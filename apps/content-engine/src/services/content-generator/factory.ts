/**
 * createContentGenerator -- selects the registered IContentGenerator backend
 * based on a flag string. Wired into worker.ts via the CONTENT_GENERATOR_BACKEND
 * env var. Default is 'placeholder' so existing deployments keep their current
 * behavior unless the flag is explicitly flipped.
 *
 * The 'ai' branch reads ANTHROPIC_API_KEY from process.env; missing key fails
 * loudly here at boot rather than silently falling back to the placeholder.
 *
 * Adding a new backend: extend the union, add a case, wire its dependencies
 * here. The worker stays dumb about per-backend wiring.
 */

import type { IContentGenerator } from './types.js';
import { PlaceholderContentGenerator } from './backends/placeholder/index.js';
import { AIContentGenerator } from './backends/ai/ai-content-generator.js';
import { RestaurantSpecialization } from './backends/ai/specialization/index.js';
import { AnthropicLLMProvider } from './backends/ai/llm/anthropic-provider.js';
import { PlaceholderMediaGenerator } from './backends/ai/media/placeholder-media-generator.js';

export type ContentGeneratorBackend = 'placeholder' | 'ai';

export function createContentGenerator(backend: ContentGeneratorBackend): IContentGenerator {
  switch (backend) {
    case 'placeholder':
      return new PlaceholderContentGenerator();
    case 'ai': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY is required when CONTENT_GENERATOR_BACKEND=ai. Set it in apps/content-engine/.env or the deployment environment.',
        );
      }
      return new AIContentGenerator({
        specialization: new RestaurantSpecialization(),
        llm: new AnthropicLLMProvider({ apiKey }),
        media: new PlaceholderMediaGenerator(),
      });
    }
    default: {
      const exhaustive: never = backend;
      throw new Error(`Unknown content generator backend: ${String(exhaustive)}`);
    }
  }
}
