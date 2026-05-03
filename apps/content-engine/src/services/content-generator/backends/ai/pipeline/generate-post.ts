/**
 * runGeneratePost -- per-post caption + media orchestration.
 *
 * 1. Pick the model family (Haiku for captions per ADR 4.6).
 * 2. Build system + task prompts via the specialization.
 * 3. Call LLM(generateObject, schema=PostCaptionSchema) wrapped in withRetry +
 *    withCostTracking.
 * 4. In parallel-ish, request media via IMediaGenerator (image vs video chosen
 *    from postType). Image jobs in phase 2 resolve immediately (placeholder
 *    media generator); phase 5 introduces async video.
 * 5. Merge LLM-suggested hashtags with specialization.selectHashtags, apply
 *    denylist + count cap, append to caption.
 * 6. Validate the assembled post via specialization.validateOutput. Errors
 *    bubble; warnings are logged.
 */

import { createLogger } from '@restropulse/telemetry/server';
import {
  ContentGenerationError,
  type GeneratedPost,
  type GenerationContext,
  type GeneratePostInput,
  type MediaMetadata,
} from '../../../types.js';
import type { Platform, PostType } from '@restropulse/shared';
import { withRetry, RETRY_PROFILES } from '../with-retry.js';
import { withCostTracking } from '../with-cost-tracking.js';
import { PostCaptionSchema, type PostCaptionSchemaType } from '../llm/schemas.js';
import { computeCostUsd } from '../llm/pricing.js';
import { type PipelineDeps, toSpecializationContext } from './types.js';
import type { MediaGenJob } from '../media/types.js';

const log = createLogger('ai-generate-post');

const HASHTAG_HARD_CAP = 8;

// Mirror the denylist in specialization/restaurant/hashtag-strategy.ts.
// Applied here so LLM-suggested hashtags are also scrubbed before appending.
const HASHTAG_DENYLIST = new Set([
  '#like4like', '#follow4follow', '#l4l', '#f4f', '#tagsforlikes', '#followforfollow',
]);

function isVideoType(t: PostType): boolean {
  return t === 'REEL' || t === 'VIDEO';
}

function isStoryVideoCandidate(_t: PostType, _platforms: Platform[]): boolean {
  // Phase 2 keeps STORY on the image path (matches placeholder behavior).
  // FalAIMediaGenerator in phase 4 may revisit.
  return false;
}

function mergeHashtags(
  caption: string,
  suggested: string[] | undefined,
  fromSpec: string[],
): string {
  const present = new Set(
    (caption.match(/#[\w-]+/g) ?? []).map((t) => t.toLowerCase()),
  );
  const candidates: string[] = [];
  for (const tag of [...(suggested ?? []), ...fromSpec]) {
    const norm = tag.startsWith('#') ? tag : `#${tag}`;
    const lower = norm.toLowerCase();
    if (HASHTAG_DENYLIST.has(lower)) continue;
    if (present.has(lower)) continue;
    if (candidates.some((c) => c.toLowerCase() === lower)) continue;
    candidates.push(lower);
    if (candidates.length >= HASHTAG_HARD_CAP) break;
  }
  if (candidates.length === 0) return caption;
  const sep = caption.endsWith('\n\n') ? '' : caption.endsWith('\n') ? '\n' : '\n\n';
  return `${caption}${sep}${candidates.join(' ')}`;
}

function metadataFromMedia(job: MediaGenJob): MediaMetadata | undefined {
  if (!job.metadata) return undefined;
  const m: MediaMetadata = {};
  if (job.metadata.widthPx !== undefined) m.widthPx = job.metadata.widthPx;
  if (job.metadata.heightPx !== undefined) m.heightPx = job.metadata.heightPx;
  if (job.metadata.durationSeconds !== undefined) m.durationSeconds = job.metadata.durationSeconds;
  return Object.keys(m).length ? m : undefined;
}

async function runMediaForPost(
  input: GeneratePostInput,
  deps: PipelineDeps,
  ctx?: GenerationContext,
): Promise<MediaGenJob> {
  const labels = {
    ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
    operation: 'generatePost' as const,
    surface: (isVideoType(input.type) ? 'video' : 'image') as 'video' | 'image',
    step: isVideoType(input.type) ? 'video' : 'image',
    model: 'placeholder-media',
  };

  return withRetry(
    () => withCostTracking(
      async () => {
        const job = isVideoType(input.type) || isStoryVideoCandidate(input.type, input.platforms)
          ? await deps.media.generateVideo({
              postType: input.type as 'REEL' | 'VIDEO' | 'STORY',
              platforms: input.platforms,
              concept: input.concept,
              themes: input.themes,
            })
          : await deps.media.generateImage({
              postType: input.type,
              platforms: input.platforms,
              concept: input.concept,
              themes: input.themes,
            });

        if (job.status === 'FAILED') {
          throw new ContentGenerationError('UNKNOWN', `Media generation failed: ${job.error ?? 'unknown'}`);
        }

        return {
          result: job,
          // Placeholder media has no token cost; phase 4 fal.ai impl reports real per-call USD.
          usage: { costUsd: 0 },
        };
      },
      labels,
    ),
    // Image submission profile is more relaxed than LLM (see ADR 4.3).
    isVideoType(input.type) ? RETRY_PROFILES.VIDEO_SUBMIT : RETRY_PROFILES.IMAGE_SUBMIT,
  );
}

async function runCaptionForPost(
  input: GeneratePostInput,
  deps: PipelineDeps,
  ctx?: GenerationContext,
): Promise<PostCaptionSchemaType> {
  const specCtx = toSpecializationContext(ctx);
  const system = deps.specialization.getSystemPromptFragment(specCtx);
  const userPrompt = [
    deps.specialization.getTaskPrompt('generatePost', input, specCtx),
    input.themes?.length ? `Themes: ${input.themes.join(', ')}` : '',
    input.cycleId ? `Cycle id: ${input.cycleId}` : '',
    input.currentAffairsHints?.length
      ? `\nCurrent-affairs hints (use sparingly):\n- ${input.currentAffairsHints.join('\n- ')}`
      : '',
    `\nReturn just the caption (no hashtags inline) plus 2-5 suggestedHashtags as separate field.`,
  ].filter(Boolean).join('\n');

  const telemetryAttributes: Record<string, string> = { operation: 'generatePost', step: 'caption' };
  if (ctx?.restaurantId) telemetryAttributes.restaurantId = ctx.restaurantId;
  if (input.cycleId) telemetryAttributes.cycleId = input.cycleId;
  if (ctx?.correlationId) telemetryAttributes.correlationId = ctx.correlationId;

  return withRetry(
    () => withCostTracking(
      async () => {
        const { object, usage, modelId } = await deps.llm.generateObject({
          model: 'haiku',
          system,
          prompt: userPrompt,
          schema: PostCaptionSchema,
          telemetryAttributes,
        });
        const costUsd = computeCostUsd(modelId, usage);
        return {
          result: object,
          usage: {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costUsd,
          },
        };
      },
      {
        ...(ctx?.restaurantId ? { restaurantId: ctx.restaurantId } : {}),
        ...(input.cycleId ? { cycleId: input.cycleId } : {}),
        operation: 'generatePost',
        surface: 'llm',
        step: 'caption',
        model: 'claude-haiku-4-5-20251001',
      },
    ),
    RETRY_PROFILES.LLM,
  );
}

export async function runGeneratePost(
  input: GeneratePostInput,
  deps: PipelineDeps,
  ctx?: GenerationContext,
): Promise<GeneratedPost> {
  if (!input.concept || !input.concept.trim()) {
    throw new ContentGenerationError('INVALID_INPUT', 'generatePost requires a non-empty concept');
  }
  if (!input.type) {
    throw new ContentGenerationError('INVALID_INPUT', 'generatePost requires a post type');
  }
  if (!input.platforms || input.platforms.length === 0) {
    throw new ContentGenerationError('INVALID_INPUT', 'generatePost requires at least one platform');
  }

  // Run caption + media concurrently. They are independent; media latency
  // dominates in phase 4-5, so parallelism is non-trivial then.
  const [captionObj, mediaJob] = await Promise.all([
    runCaptionForPost(input, deps, ctx),
    runMediaForPost(input, deps, ctx),
  ]);

  const specCtx = toSpecializationContext(ctx);
  const specHashtags = deps.specialization.selectHashtags(captionObj.caption, specCtx);
  const fullCaption = mergeHashtags(captionObj.caption, captionObj.suggestedHashtags, specHashtags);

  const post: GeneratedPost = {
    caption: fullCaption,
    thumbnail: mediaJob.thumbnail ?? mediaJob.mediaUrl ?? '',
  };
  if (mediaJob.mediaUrls) post.mediaUrls = mediaJob.mediaUrls;
  if (isVideoType(input.type) && mediaJob.mediaUrl) post.videoUrl = mediaJob.mediaUrl;
  const metadata = metadataFromMedia(mediaJob);
  if (metadata) post.mediaMetadata = metadata;

  const validation = deps.specialization.validateOutput(post, specCtx);
  if (!validation.ok) {
    const errorIssue = validation.issues.find((i) => i.severity === 'error');
    throw new ContentGenerationError(
      'INVALID_INPUT',
      `Generated post failed specialization validation: ${errorIssue?.message ?? 'unknown'}`,
    );
  }
  if (validation.issues.length > 0) {
    log.warn({ issues: validation.issues, postType: input.type }, 'Generated post has warnings');
  }

  return post;
}
