/**
 * PlaceholderContentGenerator
 *
 * Default IContentGenerator implementation. Delegates to the local asset catalog
 * via asset-manager.ts and a small set of heuristic strategy templates. No AI calls.
 */

import type { PlannedPost, PostType } from '@restropulse/shared';
import {
  buildCaption,
  getRandomCarousel,
  getRandomImage,
  getRandomVideo,
} from '../asset-manager.js';
import {
  ContentGenerationError,
  type DraftCycleInput,
  type GeneratedCycle,
  type GeneratedPost,
  type GenerationContext,
  type GeneratePostInput,
  type IContentGenerator,
  type ReviseCycleInput,
  type RevisePostInput,
} from './types.js';

const DEFAULT_THEMES = [
  'Food & Menu',
  'Chef Specials',
  'Behind the Scenes',
  'Customer Stories',
  'Offers',
];

function buildPlannedPosts(focus: string[]): PlannedPost[] {
  return focus.map((category) => ({ category, count: 2 }));
}

function pickTheme(themes: string[] | undefined): string {
  return themes?.[0]?.trim() || 'default';
}

function pickConcept(input: Pick<GeneratePostInput, 'concept' | 'themes'>): string {
  if (input.concept && input.concept.trim().length > 0) return input.concept;
  return pickTheme(input.themes);
}

function assembleMedia(type: PostType, theme: string): Omit<GeneratedPost, 'caption'> {
  switch (type) {
    case 'CAROUSEL': {
      const { urls } = getRandomCarousel(theme);
      return { thumbnail: urls[0], mediaUrls: urls };
    }
    case 'REEL':
    case 'VIDEO':
    case 'STORY': {
      const { videoUrl, thumbnail } = getRandomVideo(theme);
      return { thumbnail, videoUrl };
    }
    case 'IMAGE':
    default: {
      const { url } = getRandomImage(theme);
      return { thumbnail: url };
    }
  }
}

export class PlaceholderContentGenerator implements IContentGenerator {
  readonly name = 'placeholder';

  async draftCycle(input: DraftCycleInput, _ctx?: GenerationContext): Promise<GeneratedCycle> {
    const period = input.period?.trim();
    if (!period) {
      throw new ContentGenerationError('INVALID_INPUT', 'draftCycle requires a non-empty period');
    }

    const focus = (input.strategyFocus && input.strategyFocus.length > 0
      ? input.strategyFocus
      : DEFAULT_THEMES
    ).slice(0, 3);

    return {
      summary: `Content strategy for ${period}: ${focus.join(', ')} focus`,
      plannedPosts: buildPlannedPosts(focus),
      focus,
    };
  }

  async reviseCycle(
    input: ReviseCycleInput,
    _ctx?: GenerationContext,
  ): Promise<GeneratedCycle> {
    const { existingCycle, feedback } = input;
    if (!existingCycle?.period) {
      throw new ContentGenerationError(
        'INVALID_INPUT',
        'reviseCycle requires an existing cycle with a period',
      );
    }

    // Placeholder revision: keep existing focus/plannedPosts, just refresh the summary
    // and stamp a resolution explaining which areas we considered.
    const areas = feedback.areas.length > 0 ? feedback.areas.join(', ') : 'general feedback';
    return {
      summary: `Revised plan for ${existingCycle.period}: addressed ${areas}`,
      plannedPosts: existingCycle.plannedPosts,
      focus: existingCycle.focus,
      rationale: `Adjusted based on feedback: ${areas}`,
    };
  }

  async generatePost(
    input: GeneratePostInput,
    ctx?: GenerationContext,
  ): Promise<GeneratedPost> {
    if (!input.type) {
      throw new ContentGenerationError('INVALID_INPUT', 'generatePost requires a PostType');
    }

    const theme = pickTheme(input.themes);
    const concept = pickConcept(input);
    const caption = buildCaption(concept, theme, ctx?.restaurantName);
    const media = assembleMedia(input.type, theme);

    return { caption, ...media };
  }

  async revisePost(
    input: RevisePostInput,
    ctx?: GenerationContext,
  ): Promise<GeneratedPost> {
    const { existingPost, feedback } = input;
    if (!existingPost?.type) {
      throw new ContentGenerationError(
        'INVALID_INPUT',
        'revisePost requires an existingPost with a type',
      );
    }

    const theme = pickTheme(existingPost.themes);
    const details = Object.values(feedback.details || {}).filter(Boolean).join(' ');
    const concept =
      [feedback.note, details].filter((s) => s && s.trim().length > 0).join(' - ') ||
      pickTheme(existingPost.themes);
    const caption = buildCaption(concept, theme, ctx?.restaurantName);
    const media = assembleMedia(existingPost.type, theme);

    return { caption, ...media };
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'placeholder generator always healthy' };
  }
}
