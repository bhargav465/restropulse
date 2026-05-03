/**
 * createContentGenerator -- selects the registered IContentGenerator backend
 * based on a flag string. Wired into worker.ts via the CONTENT_GENERATOR_BACKEND
 * env var. Default is 'placeholder' so existing deployments keep their current
 * behavior unless the flag is explicitly flipped.
 *
 * The 'ai' branch:
 *   - reads ANTHROPIC_API_KEY (always required)
 *   - reads CURRENT_AFFAIRS_V1_ENABLED (default 'true')
 *   - reads CURRENT_AFFAIRS_V2_ENABLED (default 'false')
 *   - reads GOOGLE_CALENDAR_API_KEY (required when V1 enabled)
 *   - reads PERPLEXITY_API_KEY (required when V2 enabled)
 *   - reads MEDIA_BACKEND ('placeholder' | 'fal-ai', default 'placeholder')
 *   - reads FAL_API_KEY (required when MEDIA_BACKEND='fal-ai')
 *
 * Missing required keys throw at boot rather than letting the worker silently
 * misbehave.
 */

import type { IContentGenerator } from './types.js';
import { PlaceholderContentGenerator } from './backends/placeholder/index.js';
import { AIContentGenerator } from './backends/ai/ai-content-generator.js';
import { RestaurantSpecialization } from './backends/ai/specialization/index.js';
import { AnthropicLLMProvider } from './backends/ai/llm/anthropic-provider.js';
import { PlaceholderMediaGenerator } from './backends/ai/media/placeholder-media-generator.js';
import {
  FalAIMediaGenerator,
  FalClient,
  MongoMediaJobStore,
} from './backends/ai/index.js';
import type { IMediaGenerator } from './backends/ai/media/types.js';
import {
  buildCurrentAffairsProvider,
  GoogleCalendarClient,
  MongoCurrentAffairsCache,
  SonarClient,
  type ICurrentAffairsProvider,
} from './backends/ai/current-affairs/index.js';

export type ContentGeneratorBackend = 'placeholder' | 'ai';

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function buildCurrentAffairsForFactory(specialization: RestaurantSpecialization): ICurrentAffairsProvider {
  const v1Enabled = readBoolEnv('CURRENT_AFFAIRS_V1_ENABLED', true);
  const v2Enabled = readBoolEnv('CURRENT_AFFAIRS_V2_ENABLED', false);

  if (!v1Enabled && !v2Enabled) {
    return buildCurrentAffairsProvider({ v1Enabled: false, v2Enabled: false }, {
      cache: new MongoCurrentAffairsCache(),
      // Stub clients -- never called when both flags are off
      calendarClient: { listHolidays: async () => [] } as any,
      sonarClient: { query: async () => ({ text: '', usage: { inputTokens: 0, outputTokens: 0 }, modelId: 'sonar-pro' }) } as any,
      specialization,
    });
  }

  let calendarClient: GoogleCalendarClient | { listHolidays: () => Promise<never[]> };
  if (v1Enabled) {
    const calKey = process.env.GOOGLE_CALENDAR_API_KEY;
    if (!calKey) {
      throw new Error('GOOGLE_CALENDAR_API_KEY is required when CURRENT_AFFAIRS_V1_ENABLED=true');
    }
    calendarClient = new GoogleCalendarClient({ apiKey: calKey });
  } else {
    calendarClient = { listHolidays: async () => [] };
  }

  let sonarClient: SonarClient | { query: () => Promise<{ text: string; usage: { inputTokens: number; outputTokens: number }; modelId: string }> };
  if (v2Enabled) {
    const sonarKey = process.env.PERPLEXITY_API_KEY;
    if (!sonarKey) {
      throw new Error('PERPLEXITY_API_KEY is required when CURRENT_AFFAIRS_V2_ENABLED=true');
    }
    sonarClient = new SonarClient({ apiKey: sonarKey });
  } else {
    sonarClient = { query: async () => ({ text: '', usage: { inputTokens: 0, outputTokens: 0 }, modelId: 'sonar-pro' }) };
  }

  return buildCurrentAffairsProvider(
    { v1Enabled, v2Enabled },
    {
      cache: new MongoCurrentAffairsCache(),
      calendarClient: calendarClient as GoogleCalendarClient,
      sonarClient: sonarClient as SonarClient,
      specialization,
    },
  );
}

type MediaBackend = 'placeholder' | 'fal-ai';

function readMediaBackend(): MediaBackend {
  const raw = (process.env.MEDIA_BACKEND ?? 'placeholder').trim();
  if (raw === 'placeholder' || raw === 'fal-ai') return raw;
  throw new Error(`Unknown MEDIA_BACKEND value: ${raw}. Expected 'placeholder' or 'fal-ai'.`);
}

function buildMediaGeneratorForFactory(): IMediaGenerator {
  const backend = readMediaBackend();
  if (backend === 'fal-ai') {
    const apiKey = process.env.FAL_API_KEY;
    if (!apiKey) {
      throw new Error('FAL_API_KEY is required when MEDIA_BACKEND=fal-ai.');
    }
    return new FalAIMediaGenerator({
      client: new FalClient({ apiKey }),
      store: new MongoMediaJobStore(),
    });
  }
  return new PlaceholderMediaGenerator();
}

/**
 * Stash the current-affairs provider per call so worker.ts can pull the same
 * instance for cron registration without re-running the env logic. This is a
 * factory-internal cache keyed by the most recent backend selected.
 */
let lastAiCurrentAffairs: ICurrentAffairsProvider | null = null;

/**
 * Read the current-affairs provider built by the most recent createContentGenerator('ai') call.
 * Worker.ts uses this to wire the cron processor. Returns null if 'ai' was never selected
 * (in which case there's nothing to refresh).
 */
export function getLastAiCurrentAffairsProvider(): ICurrentAffairsProvider | null {
  return lastAiCurrentAffairs;
}

export function createContentGenerator(backend: ContentGeneratorBackend): IContentGenerator {
  switch (backend) {
    case 'placeholder':
      lastAiCurrentAffairs = null;
      return new PlaceholderContentGenerator();

    case 'ai': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY is required when CONTENT_GENERATOR_BACKEND=ai. Set it in apps/content-engine/.env or the deployment environment.',
        );
      }
      const specialization = new RestaurantSpecialization();
      const currentAffairs = buildCurrentAffairsForFactory(specialization);
      lastAiCurrentAffairs = currentAffairs;
      return new AIContentGenerator({
        specialization,
        llm: new AnthropicLLMProvider({ apiKey }),
        media: buildMediaGeneratorForFactory(),
        currentAffairs,
      });
    }

    default: {
      const exhaustive: never = backend;
      throw new Error(`Unknown content generator backend: ${String(exhaustive)}`);
    }
  }
}
