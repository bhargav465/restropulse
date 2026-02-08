/**
 * Content Generator Interface
 *
 * Abstraction layer for content generation. Current implementation uses
 * placeholder content. Replace with actual AI service integration
 * (OpenAI, Replicate, etc.) when ready.
 */

import type { PostType, Platform } from '@restropulse/shared';

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
 * Generate content for a post.
 * TODO: Replace with actual AI content generation service (OpenAI, Replicate, etc.)
 */
export async function generateContent(options: GenerateOptions): Promise<GeneratedContent> {
  const { concept, type } = options;
  const seed = Math.random().toString(36).substring(2, 10);
  const timestamp = Date.now();

  console.log(`[Content Engine] Generating ${type} content for concept: "${concept}"`);

  // Base placeholder content
  const caption = concept || `Fresh content from RestroPulse - ${new Date().toLocaleDateString()}`;

  switch (type) {
    case 'CAROUSEL': {
      const mediaUrls = Array.from({ length: 3 }, (_, i) =>
        `https://picsum.photos/seed/${seed}-${i}/1080/1080`,
      );
      return {
        caption,
        thumbnail: mediaUrls[0],
        mediaUrls,
      };
    }

    case 'REEL':
    case 'VIDEO':
    case 'STORY': {
      return {
        caption,
        thumbnail: `https://picsum.photos/seed/${seed}/1080/1920`,
        videoUrl: `https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4?t=${timestamp}`,
      };
    }

    case 'IMAGE':
    default: {
      return {
        caption,
        thumbnail: `https://picsum.photos/seed/${seed}/1080/1080`,
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

  console.log(`[Content Engine] Generating ${totalPosts} posts for cycle (${startDate} to ${endDate})`);

  const results: GeneratedContent[] = [];

  for (let i = 0; i < totalPosts; i++) {
    const theme = themes[i % themes.length] || 'Restaurant Highlights';
    const type = contentTypes[i % contentTypes.length] || 'IMAGE';

    const content = await generateContent({
      concept: `${theme} - Post ${i + 1}`,
      type,
      platform: 'BOTH',
      restaurantName: options.restaurantName,
      themes,
    });

    results.push(content);
  }

  return results;
}
