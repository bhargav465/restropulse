/**
 * createContentGenerator -- selects the registered IContentGenerator backend
 * based on a flag string. Wired into worker.ts via the CONTENT_GENERATOR_BACKEND
 * env var. Default is 'placeholder' so existing deployments keep their current
 * behavior unless the flag is explicitly flipped.
 *
 * The 'ai' branch is an "uber" master flag: when set, every AI sub-feature
 * defaults to enabled (fal.ai media + V1 calendar + V2 Sonar) and every
 * required key must be present. Operators set ONE flag and four keys; that
 * is the supported normal mode.
 *
 * Required when CONTENT_GENERATOR_BACKEND=ai (defaults shown):
 *   ANTHROPIC_API_KEY                  -- Anthropic Claude
 *   FAL_API_KEY                        -- fal.ai (image + video)
 *   GOOGLE_CALENDAR_API_KEY            -- India holidays (V1)
 *   PERPLEXITY_API_KEY                 -- Sonar Pro current affairs (V2)
 *
 * Advanced sub-flag overrides (for debug / cost-control / staged rollouts):
 *   MEDIA_BACKEND=placeholder          -- skip fal.ai; use asset catalog
 *   CURRENT_AFFAIRS_V1_ENABLED=false   -- skip Google Calendar
 *   CURRENT_AFFAIRS_V2_ENABLED=false   -- skip Perplexity Sonar
 *
 * When a sub-flag is overridden to false, its corresponding API key becomes
 * optional. The factory pre-validates every required key in one pass and
 * throws a single combined error so operators see the full setup gap at once.
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
type MediaBackend = 'placeholder' | 'fal-ai';

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function readMediaBackend(fallback: MediaBackend): MediaBackend {
  const raw = process.env.MEDIA_BACKEND?.trim();
  if (!raw) return fallback;
  if (raw === 'placeholder' || raw === 'fal-ai') return raw;
  throw new Error(`Unknown MEDIA_BACKEND value: ${raw}. Expected 'placeholder' or 'fal-ai'.`);
}

interface AiModeResolution {
  v1Enabled: boolean;
  v2Enabled: boolean;
  mediaBackend: MediaBackend;
}

/**
 * Resolve the effective sub-feature flags when AI mode is engaged.
 * Master flag activates everything by default; sub-flags override.
 */
function resolveAiModeFlags(): AiModeResolution {
  return {
    // V1 has been default-on since phase 3 (Calendar is free); kept default-on under AI.
    v1Enabled: readBoolEnv('CURRENT_AFFAIRS_V1_ENABLED', true),
    // V2 default flips from false to true under AI mode.
    v2Enabled: readBoolEnv('CURRENT_AFFAIRS_V2_ENABLED', true),
    // Media backend default flips from placeholder to fal-ai under AI mode.
    mediaBackend: readMediaBackend('fal-ai'),
  };
}

/**
 * Validate every required key for the resolved AI-mode shape and throw a
 * single combined error if any are missing. Operators see the full gap at
 * once instead of fixing one key at a time across multiple boots.
 */
function validateAiKeys(flags: AiModeResolution): void {
  const missing: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
  if (flags.mediaBackend === 'fal-ai' && !process.env.FAL_API_KEY) missing.push('FAL_API_KEY');
  if (flags.v1Enabled && !process.env.GOOGLE_CALENDAR_API_KEY) missing.push('GOOGLE_CALENDAR_API_KEY');
  if (flags.v2Enabled && !process.env.PERPLEXITY_API_KEY) missing.push('PERPLEXITY_API_KEY');

  if (missing.length === 0) return;

  const overrideHints: string[] = [];
  if (flags.mediaBackend === 'fal-ai' && missing.includes('FAL_API_KEY')) {
    overrideHints.push('MEDIA_BACKEND=placeholder to skip fal.ai');
  }
  if (flags.v1Enabled && missing.includes('GOOGLE_CALENDAR_API_KEY')) {
    overrideHints.push('CURRENT_AFFAIRS_V1_ENABLED=false to skip Google Calendar');
  }
  if (flags.v2Enabled && missing.includes('PERPLEXITY_API_KEY')) {
    overrideHints.push('CURRENT_AFFAIRS_V2_ENABLED=false to skip Sonar Pro');
  }

  const overrideLine = overrideHints.length
    ? `\n\nTo run with a reduced AI chain, set one or more of: ${overrideHints.join('; ')}.`
    : '';

  throw new Error(
    `CONTENT_GENERATOR_BACKEND=ai requires the following missing env var(s): ${missing.join(', ')}.\n` +
    `Set them in apps/content-engine/.env (dev) or App Service settings (prod). ` +
    `See docs/SECRETS.md for how to obtain each key.${overrideLine}`,
  );
}

function buildCurrentAffairsForFactory(
  specialization: RestaurantSpecialization,
  flags: AiModeResolution,
): ICurrentAffairsProvider {
  const { v1Enabled, v2Enabled } = flags;

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
    // Key already validated upfront; non-null assertion is safe here.
    calendarClient = new GoogleCalendarClient({ apiKey: process.env.GOOGLE_CALENDAR_API_KEY! });
  } else {
    calendarClient = { listHolidays: async () => [] };
  }

  let sonarClient: SonarClient | { query: () => Promise<{ text: string; usage: { inputTokens: number; outputTokens: number }; modelId: string }> };
  if (v2Enabled) {
    sonarClient = new SonarClient({ apiKey: process.env.PERPLEXITY_API_KEY! });
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

function buildMediaGeneratorForFactory(flags: AiModeResolution): IMediaGenerator {
  if (flags.mediaBackend === 'fal-ai') {
    // Key already validated upfront; non-null assertion is safe here.
    const store = new MongoMediaJobStore();
    const media = new FalAIMediaGenerator({
      client: new FalClient({ apiKey: process.env.FAL_API_KEY! }),
      store,
    });
    lastAiMediaJobStore = store;
    lastAiMediaGenerator = media;
    return media;
  }
  lastAiMediaJobStore = null;
  lastAiMediaGenerator = null;
  return new PlaceholderMediaGenerator();
}

/**
 * Stash the current-affairs provider per call so worker.ts can pull the same
 * instance for cron registration without re-running the env logic. This is a
 * factory-internal cache keyed by the most recent backend selected.
 */
let lastAiCurrentAffairs: ICurrentAffairsProvider | null = null;

let lastAiMediaJobStore: import('./backends/ai/media/jobs/types.js').IMediaJobStore | null = null;
let lastAiMediaGenerator: import('./backends/ai/media/types.js').IMediaGenerator | null = null;

export function getLastAiMediaJobStore() {
  return lastAiMediaJobStore;
}

export function getLastAiMediaGenerator() {
  return lastAiMediaGenerator;
}

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
      lastAiMediaJobStore = null;
      lastAiMediaGenerator = null;
      return new PlaceholderContentGenerator();

    case 'ai': {
      const flags = resolveAiModeFlags();
      validateAiKeys(flags);

      const specialization = new RestaurantSpecialization();
      const currentAffairs = buildCurrentAffairsForFactory(specialization, flags);
      lastAiCurrentAffairs = currentAffairs;

      return new AIContentGenerator({
        specialization,
        llm: new AnthropicLLMProvider({ apiKey: process.env.ANTHROPIC_API_KEY! }),
        media: buildMediaGeneratorForFactory(flags),
        currentAffairs,
      });
    }

    default: {
      const exhaustive: never = backend;
      throw new Error(`Unknown content generator backend: ${String(exhaustive)}`);
    }
  }
}
