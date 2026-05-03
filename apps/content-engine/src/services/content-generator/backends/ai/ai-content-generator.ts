/**
 * AIContentGenerator -- phase 1 stub.
 *
 * Implements IContentGenerator (via BaseContentGenerator) and holds a reference
 * to its IDomainSpecialization. Each operation throws BACKEND_UNAVAILABLE until
 * phase 2 wires Vercel AI SDK LLM calls. The factory still returns this when
 * CONTENT_GENERATOR_BACKEND=ai so the seam is exercised end-to-end and any
 * misconfigured environment fails loudly at the first generation attempt rather
 * than silently falling back to placeholder.
 */

import { createLogger } from '@restropulse/telemetry/server';
import { BaseContentGenerator } from '../../base-generator.js';
import {
  ContentGenerationError,
  type DraftCycleInput,
  type GeneratedCycle,
  type GeneratedPost,
  type GenerationContext,
  type GeneratePostInput,
  type ReviseCycleInput,
  type RevisePostInput,
} from '../../types.js';
import type { IDomainSpecialization } from './specialization/index.js';

const log = createLogger('ai-content-generator');

const NOT_WIRED_DETAIL = 'AI generator scaffolded but the LLM provider is not yet wired. This lands in phase 2.';

export interface AIContentGeneratorOptions {
  specialization: IDomainSpecialization;
}

export class AIContentGenerator extends BaseContentGenerator {
  readonly name = 'ai';
  readonly specialization: IDomainSpecialization;

  constructor(options: AIContentGeneratorOptions) {
    super();
    if (!options || !options.specialization) {
      throw new ContentGenerationError(
        'INVALID_INPUT',
        'AIContentGenerator requires a specialization in its constructor options.',
      );
    }
    this.specialization = options.specialization;
    log.info(
      { domain: this.specialization.domain, version: this.specialization.version },
      'AIContentGenerator instantiated (phase 1 stub)',
    );
  }

  async draftCycle(_input: DraftCycleInput, _ctx?: GenerationContext): Promise<GeneratedCycle> {
    throw new ContentGenerationError('BACKEND_UNAVAILABLE', NOT_WIRED_DETAIL);
  }

  async reviseCycle(_input: ReviseCycleInput, _ctx?: GenerationContext): Promise<GeneratedCycle> {
    throw new ContentGenerationError('BACKEND_UNAVAILABLE', NOT_WIRED_DETAIL);
  }

  async generatePostContent(_input: GeneratePostInput, _ctx?: GenerationContext): Promise<GeneratedPost> {
    throw new ContentGenerationError('BACKEND_UNAVAILABLE', NOT_WIRED_DETAIL);
  }

  async revisePostContent(_input: RevisePostInput, _ctx?: GenerationContext): Promise<GeneratedPost> {
    throw new ContentGenerationError('BACKEND_UNAVAILABLE', NOT_WIRED_DETAIL);
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: false, detail: NOT_WIRED_DETAIL };
  }
}
