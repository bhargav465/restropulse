/**
 * FalAIMediaGenerator -- IMediaGenerator backed by fal.ai sync inference.
 *
 * Phase 4 supports IMAGE, CAROUSEL, STORY (text-to-image OR image-to-image
 * when input.baseImageUrl is present). REEL/VIDEO throw BACKEND_UNAVAILABLE
 * until phase 5 wires Kling/MiniMax via the queue + poll pattern.
 *
 * Every generation path:
 *   1. Pick model + image_size from postType + baseImageUrl.
 *   2. Call FalClient (with retry + cost tracking).
 *   3. Insert MediaJobRecord with status=COMPLETED on success, FAILED on
 *      empty/invalid response.
 *
 * CAROUSEL fans out to 3 parallel calls; each gets its own MediaJobRecord.
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '@restropulse/telemetry/server';
import type { Platform, PostType, MediaJobRecord } from '@restropulse/shared';
import {
  ContentGenerationError,
} from '../../../../types.js';
import { withRetry, RETRY_PROFILES } from '../../with-retry.js';
import { withCostTracking } from '../../with-cost-tracking.js';
import { FAL_MODELS } from './models.js';
import { computeFalCostUsd } from './pricing.js';
import type { FalClient, FalImageResponse } from './fal-client.js';
import type { IMediaJobStore } from '../jobs/types.js';
import type {
  IMediaGenerator,
  ImageGenInput,
  MediaGenJob,
  VideoGenInput,
} from '../types.js';

const log = createLogger('fal-ai-media-generator');

const CAROUSEL_FRAME_COUNT = 3;

export interface FalAIMediaGeneratorOptions {
  client: Pick<FalClient, 'generateImage' | 'editImage'>;
  store: IMediaJobStore;
}

function pickImageSize(postType: PostType, _platforms: Platform[]): string {
  switch (postType) {
    case 'STORY':
      return 'portrait_16_9';
    case 'IMAGE':
    case 'CAROUSEL':
    default:
      return 'square_hd';
  }
}

function buildPrompt(input: Pick<ImageGenInput, 'concept' | 'themes' | 'caption'>): string {
  const themePart = input.themes?.length ? `, themes: ${input.themes.join(', ')}` : '';
  const captionPart = input.caption ? `, alongside the caption "${input.caption.slice(0, 200)}"` : '';
  return `${input.concept}${themePart}${captionPart}`.slice(0, 1000);
}

export class FalAIMediaGenerator implements IMediaGenerator {
  readonly name = 'fal-ai';
  private readonly client: Pick<FalClient, 'generateImage' | 'editImage'>;
  private readonly store: IMediaJobStore;

  constructor(options: FalAIMediaGeneratorOptions) {
    if (!options || !options.client || !options.store) {
      throw new Error('FalAIMediaGenerator requires { client, store }');
    }
    this.client = options.client;
    this.store = options.store;
  }

  async generateImage(input: ImageGenInput): Promise<MediaGenJob> {
    if (input.postType === 'CAROUSEL') {
      return this.generateCarousel(input);
    }
    return this.generateSingleImage(input);
  }

  async generateVideo(_input: VideoGenInput): Promise<MediaGenJob> {
    throw new ContentGenerationError(
      'BACKEND_UNAVAILABLE',
      'fal-ai video generation lands in phase 5. Set MEDIA_BACKEND=placeholder for video posts until then.',
    );
  }

  async pollJob(jobId: string): Promise<MediaGenJob> {
    const record = await this.store.findById(jobId);
    if (!record) {
      return { jobId, status: 'FAILED', error: 'job not found' };
    }
    return this.recordToMediaGenJob(record);
  }

  private async generateSingleImage(input: ImageGenInput): Promise<MediaGenJob> {
    const jobId = randomUUID();
    const useEdit = !!input.baseImageUrl;
    const modelId = useEdit ? FAL_MODELS.fluxImg2Img : FAL_MODELS.fluxDev;
    const prompt = buildPrompt(input);
    const imageSize = pickImageSize(input.postType, input.platforms);

    let response: FalImageResponse;
    try {
      response = await withRetry(
        () => withCostTracking(
          async () => {
            const result = useEdit
              ? await this.client.editImage({
                  model: modelId,
                  prompt,
                  imageUrl: input.baseImageUrl!,
                })
              : await this.client.generateImage({
                  model: modelId,
                  prompt,
                  imageSize,
                });
            return {
              result,
              usage: { costUsd: computeFalCostUsd(modelId) },
            };
          },
          {
            ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
            ...(input.postId ? { postId: input.postId } : {}),
            ...(input.cycleId ? { cycleId: input.cycleId } : {}),
            operation: 'generatePost',
            surface: 'image',
            step: useEdit ? 'image-edit' : 'image',
            model: modelId,
          },
        ),
        RETRY_PROFILES.IMAGE_SUBMIT,
      );
    } catch (err) {
      log.error({ err, jobId, modelId }, 'fal.ai image submission failed after retries');
      const failedRecord = await this.persistFailedJob(jobId, modelId, input, (err as Error).message ?? 'unknown');
      return this.recordToMediaGenJob(failedRecord);
    }

    if (!response.images || response.images.length === 0) {
      log.warn({ jobId, modelId }, 'fal.ai returned no images');
      const failedRecord = await this.persistFailedJob(jobId, modelId, input, 'no images returned');
      return this.recordToMediaGenJob(failedRecord);
    }

    const image = response.images[0];
    const record = await this.store.insert({
      jobId,
      provider: 'fal-ai',
      modelId,
      postType: input.postType,
      status: 'COMPLETED',
      mediaUrl: image.url,
      thumbnail: image.url,
      metadata: { widthPx: image.width, heightPx: image.height },
      attempts: 1,
      ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
      ...(input.postId ? { postId: input.postId } : {}),
      ...(input.cycleId ? { cycleId: input.cycleId } : {}),
      startedAt: new Date(),
      completedAt: new Date(),
    });

    return this.recordToMediaGenJob(record);
  }

  private async generateCarousel(input: ImageGenInput): Promise<MediaGenJob> {
    const carouselId = randomUUID();
    const frameInputs: ImageGenInput[] = Array.from({ length: CAROUSEL_FRAME_COUNT }, (_, i) => ({
      ...input,
      // Slightly vary the concept so frames differ; cheap and deterministic.
      concept: `${input.concept} (frame ${i + 1} of ${CAROUSEL_FRAME_COUNT})`,
      // Treat each frame as IMAGE so the inner generateSingleImage path runs.
      postType: 'IMAGE',
    }));

    const results = await Promise.all(
      frameInputs.map((frame) => this.generateSingleImage(frame)),
    );
    const succeeded = results.filter((r) => r.status === 'COMPLETED' && r.mediaUrl);
    if (succeeded.length === 0) {
      return { jobId: carouselId, status: 'FAILED', error: 'all carousel frames failed' };
    }
    const urls = succeeded.map((r) => r.mediaUrl!);
    const meta = succeeded[0].metadata;
    return {
      jobId: carouselId,
      status: 'COMPLETED',
      mediaUrls: urls,
      thumbnail: urls[0],
      ...(meta ? { metadata: meta } : {}),
    };
  }

  private async persistFailedJob(
    jobId: string,
    modelId: string,
    input: ImageGenInput,
    error: string,
  ): Promise<MediaJobRecord> {
    return this.store.insert({
      jobId,
      provider: 'fal-ai',
      modelId,
      postType: input.postType,
      status: 'FAILED',
      error,
      attempts: 1,
      ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
      ...(input.postId ? { postId: input.postId } : {}),
      ...(input.cycleId ? { cycleId: input.cycleId } : {}),
      startedAt: new Date(),
    });
  }

  private recordToMediaGenJob(record: MediaJobRecord): MediaGenJob {
    return {
      jobId: record.jobId,
      status: record.status,
      ...(record.mediaUrl ? { mediaUrl: record.mediaUrl } : {}),
      ...(record.mediaUrls ? { mediaUrls: record.mediaUrls } : {}),
      ...(record.thumbnail ? { thumbnail: record.thumbnail } : {}),
      ...(record.metadata ? { metadata: record.metadata } : {}),
      ...(record.error ? { error: record.error } : {}),
    };
  }
}
