/**
 * Content Generator
 *
 * Abstraction layer for content generation. Current implementation uses
 * locally stored placeholder assets (images and videos) served by the
 * built-in asset server. Each PostType gets a themed asset selected
 * randomly from the local catalog.
 *
 * Replace the body of generateContent() (and generateCycleContent() if needed)
 * with actual AI service calls when ready — the interfaces below are the stable
 * service contract consumed by adhoc-processor.ts and strategy-processor.ts.
 */

import type { PostType, Platform } from '@restropulse/shared';
import { createLogger } from '@restropulse/telemetry/server';
import { getRandomImage, getRandomCarousel, getRandomVideo, buildCaption } from './asset-manager.js';

const logger = createLogger('content-engine:content-generator');

export interface GeneratedContent {
  caption: string;
  thumbnail: string;
  mediaUrls?: string[];
  videoUrl?: string;
}

export interface GenerateOptions {
  concept: string;
  type: PostType;
  platform: Platform;
  restaurantName?: string;
  themes?: string[];
}

/**
 * Generate content for a single post.
 * TODO: Replace with actual AI content generation service (OpenAI, Replicate, etc.)
 */
export async function generateContent(options: GenerateOptions): Promise<GeneratedContent> {
  const { concept, type, restaurantName, themes } = options;
  const theme = themes?.[0] ?? 'default';

  logger.debug({ type, concept }, 'Generating content');

  const caption = buildCaption(concept, theme, restaurantName);

  switch (type) {
    case 'CAROUSEL': {
      const { urls } = getRandomCarousel(theme);
      return {
        caption,
        thumbnail: urls[0],
        mediaUrls: urls,
      };
    }

    case 'REEL':
    case 'VIDEO':
    case 'STORY': {
      const { videoUrl, thumbnail } = getRandomVideo(theme);
      return {
        caption,
        thumbnail,
        videoUrl,
      };
    }

    case 'IMAGE':
    default: {
      const { url } = getRandomImage(theme);
      return {
        caption,
        thumbnail: url,
      };
    }
  }
}

/**
 * Generate content for a full strategy cycle.
 * Creates posts for each day based on strategy configuration.
 * TODO: Use AI to generate varied, themed content based on restaurant profile.
 */
export async function generateCycleContent(options: {
  startDate: string;
  endDate: string;
  postsPerWeek: number;
  themes: string[];
  contentTypes: PostType[];
  restaurantName?: string;
}): Promise<GeneratedContent[]> {
  const { startDate, endDate, postsPerWeek, themes, contentTypes } = options;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const totalWeeks = Math.ceil(totalDays / 7);
  const totalPosts = totalWeeks * postsPerWeek;

  logger.info({ totalPosts, startDate, endDate }, 'Generating posts for cycle');

  const results: GeneratedContent[] = [];

  for (let i = 0; i < totalPosts; i++) {
    const theme = themes[i % themes.length] || 'default';
    const type = contentTypes[i % contentTypes.length] || 'IMAGE';

    const content = await generateContent({
      concept: `${theme} - Post ${i + 1}`,
      type,
      platform: 'BOTH',
      restaurantName: options.restaurantName,
      themes: [theme],
    });

    results.push(content);
  }

  return results;
}
