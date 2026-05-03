/**
 * Dependencies the pipeline orchestration functions accept.
 *
 * Passing PipelineDeps (vs reading from a global) lets tests inject mocks
 * for every external dependency: the LLM client, the media generator, and
 * the domain specialization. AIContentGenerator builds this object once in
 * its constructor and forwards it to each pipeline function.
 */

import type { ILLMProvider } from '../llm/types.js';
import type { IMediaGenerator } from '../media/types.js';
import type { IDomainSpecialization, SpecializationContext } from '../specialization/types.js';
import type { GenerationContext } from '../../../types.js';

export interface PipelineDeps {
  llm: ILLMProvider;
  media: IMediaGenerator;
  specialization: IDomainSpecialization;
}

/**
 * Project a GenerationContext (caller-supplied at call time) into the
 * SpecializationContext shape that prompts/queries expect.
 *
 * Today they are nearly identical; isolated as a function so future fields
 * (cuisine, brandVoice etc. enriched from a restaurant lookup) land in one place.
 */
export function toSpecializationContext(ctx?: GenerationContext): SpecializationContext {
  return {
    restaurantId: ctx?.restaurantId,
    restaurantName: ctx?.restaurantName,
    locale: ctx?.locale,
  };
}
