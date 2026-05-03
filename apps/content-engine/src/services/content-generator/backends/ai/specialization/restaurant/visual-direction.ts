import type { ImageGenInput, SpecializationContext } from '../types.js';

export function buildImagePromptFragment(input: ImageGenInput, ctx: SpecializationContext): string {
  const lighting = 'warm golden-hour-style lighting';
  const angleByType: Record<string, string> = {
    IMAGE: '45-degree hero angle for plated dishes',
    CAROUSEL: 'consistent angle and lighting across all frames',
    REEL: 'cinematic close-ups; macro for textures',
    VIDEO: 'cinematic close-ups; macro for textures',
    STORY: 'portrait 9:16 framing; centered subject',
    FACEBOOK: 'environmental shot showing the dish in context',
  };
  const angle = angleByType[input.postType] ?? '45-degree hero angle';
  const surface = ctx.cuisine?.toLowerCase().includes('south') ? 'banana leaf or weathered wood' : 'wooden or marble surface';

  return [
    `Style: appetizing food photography for an Indian restaurant, ${lighting}.`,
    `Angle: ${angle}.`,
    `Surface: ${surface}; thoughtful garnish; minimal but natural composition.`,
    `Avoid: heavy filters, oversaturation, plastic-looking food, fingers in frame.`,
  ].join('\n');
}
