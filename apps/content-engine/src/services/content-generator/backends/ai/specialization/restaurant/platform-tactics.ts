import type { Platform, PostType } from '@restropulse/shared';

export interface PlatformTactics {
  /** Clean ratio string usable directly as a media-provider parameter (e.g. '1:1', '9:16', '4:5'). */
  aspectRatio: string;
  hashtagPosition: 'inline-end' | 'first-comment';
  hashtagCount: { min: number; max: number };
  captionLength: { aboveFoldChars: number; totalChars: number };
}

export function getPlatformTactics(platform: Platform, postType: PostType): PlatformTactics {
  const isVertical = postType === 'STORY' || postType === 'REEL' || postType === 'VIDEO';
  switch (platform) {
    case 'INSTAGRAM':
      return {
        aspectRatio: isVertical ? '9:16' : '1:1',
        hashtagPosition: 'inline-end',
        hashtagCount: { min: 5, max: 8 },
        captionLength: { aboveFoldChars: 125, totalChars: 2200 },
      };
    case 'FACEBOOK':
      return {
        aspectRatio: isVertical ? '9:16' : '4:5',
        hashtagPosition: 'inline-end',
        hashtagCount: { min: 1, max: 3 },
        captionLength: { aboveFoldChars: 250, totalChars: 5000 },
      };
    default:
      return {
        aspectRatio: isVertical ? '9:16' : '1:1',
        hashtagPosition: 'inline-end',
        hashtagCount: { min: 3, max: 8 },
        captionLength: { aboveFoldChars: 125, totalChars: 2200 },
      };
  }
}
