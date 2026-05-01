/**
 * IContentGenerator contract.
 *
 * Frozen interface that every backend implementation must satisfy. The placeholder
 * lives behind this contract; a future AI-driven backend swaps in via setContentGenerator()
 * without any processor edits.
 */

import type { PlannedPost, Platform, PostType } from '@restropulse/shared';

// ---------------------------------------------------------------------------
// Context + error types
// ---------------------------------------------------------------------------

export interface GenerationContext {
  correlationId?: string;
  restaurantId?: string;
  restaurantName?: string;
  locale?: string;
}

export type ContentGenerationErrorCode =
  | 'INVALID_INPUT'
  | 'ASSET_UNAVAILABLE'
  | 'BACKEND_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export class ContentGenerationError extends Error {
  readonly code: ContentGenerationErrorCode;
  readonly cause?: unknown;

  constructor(code: ContentGenerationErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ContentGenerationError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Cycle inputs / outputs
// ---------------------------------------------------------------------------

export interface DraftCycleInput {
  restaurantId?: string;
  period: string;
  startDate?: string;
  endDate?: string;
  strategyFocus?: string[];
  strategyThemes?: string[];
  currentAffairsHints?: string[];
}

export interface CycleFeedback {
  areas: string[];
  note: string;
  resolution?: string;
}

export interface ReviseCycleInput {
  existingCycle: {
    restaurantId?: string;
    period: string;
    startDate?: string;
    endDate?: string;
    summary: string;
    plannedPosts: PlannedPost[];
    focus: string[];
  };
  feedback: CycleFeedback;
  currentAffairsHints?: string[];
}

export interface GeneratedCycle {
  summary: string;
  plannedPosts: PlannedPost[];
  focus: string[];
  rationale?: string;
}

// ---------------------------------------------------------------------------
// Post inputs / outputs
// ---------------------------------------------------------------------------

export interface GeneratePostInput {
  concept: string;
  type: PostType;
  platforms: Platform[];
  themes?: string[];
  scheduledFor?: string;
  cycleId?: string;
  currentAffairsHints?: string[];
}

export interface PostFeedback {
  tags: string[];
  details: Record<string, string>;
  note: string;
  resolution?: string;
}

export interface RevisePostInput {
  existingPost: {
    type: PostType;
    platforms: Platform[];
    caption: string;
    thumbnail?: string;
    mediaUrls?: string[];
    videoUrl?: string;
    themes?: string[];
  };
  feedback: PostFeedback;
  currentAffairsHints?: string[];
}

export interface GeneratedPost {
  caption: string;
  thumbnail: string;
  mediaUrls?: string[];
  videoUrl?: string;
}

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

export interface IContentGenerator {
  readonly name: string;
  draftCycle(input: DraftCycleInput, ctx?: GenerationContext): Promise<GeneratedCycle>;
  reviseCycle(input: ReviseCycleInput, ctx?: GenerationContext): Promise<GeneratedCycle>;
  generatePost(input: GeneratePostInput, ctx?: GenerationContext): Promise<GeneratedPost>;
  revisePost(input: RevisePostInput, ctx?: GenerationContext): Promise<GeneratedPost>;
  healthCheck?(): Promise<{ ok: boolean; detail?: string }>;
}
