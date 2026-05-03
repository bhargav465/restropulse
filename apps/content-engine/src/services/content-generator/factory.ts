/**
 * createContentGenerator -- selects the registered IContentGenerator backend
 * based on a flag string. Wired into worker.ts via the CONTENT_GENERATOR_BACKEND
 * env var. Default is 'placeholder' so existing deployments keep their
 * current behavior unless the flag is explicitly flipped.
 *
 * Adding a new backend: extend the union, add a case, and wire its dependencies
 * here (the worker should not learn the implementation details of any backend).
 */

import type { IContentGenerator } from './types.js';
import { PlaceholderContentGenerator } from './backends/placeholder/index.js';
import { AIContentGenerator } from './backends/ai/ai-content-generator.js';
import { RestaurantSpecialization } from './backends/ai/specialization/index.js';

export type ContentGeneratorBackend = 'placeholder' | 'ai';

export function createContentGenerator(backend: ContentGeneratorBackend): IContentGenerator {
  switch (backend) {
    case 'placeholder':
      return new PlaceholderContentGenerator();
    case 'ai':
      return new AIContentGenerator({ specialization: new RestaurantSpecialization() });
    default: {
      const exhaustive: never = backend;
      throw new Error(`Unknown content generator backend: ${String(exhaustive)}`);
    }
  }
}
