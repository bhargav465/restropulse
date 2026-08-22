/**
 * Visual direction fragment for image/video generation prompts.
 * Called from generate-post.ts pipeline; signature must not change.
 *
 * DESIGN NOTE (IG-4): this fragment is appended verbatim to a text-to-image
 * prompt (Flux). Image models have no negative prompt and treat "avoid X" as a
 * positive mention of X, and they cannot act on pixel-zone advice. So the
 * fragment must be SHORT (target ≤ 300 chars) and POSITIVE only: what the
 * frame should look like, never what it shouldn't. Human-readable composition
 * guidance (safe zones, caption zones, people-in-frame rules) lives in
 * `SAFE_ZONES` / `COMPOSITION_NOTES` below for compositor / crop steps and
 * docs -- it is intentionally NOT part of the model prompt.
 */

import type { ImageGenInput, SpecializationContext } from '../types.js';
import { getRegionalAesthetic } from './india-context.js';

/**
 * Per-aspect-ratio safe zone and text placement guidance. Reference for a
 * post-processing crop/compositor step and for humans -- NOT sent to the
 * image model (see design note above).
 *
 * Safe-zone pixel guidance from Instagram's official 2026 Reels spec:
 *   top ~270px (14%), bottom ~385px (20%), left/right ~65px (6%)
 * Grid safe zone (post-3:4 grid update, late 2025): centre 1012 × 1350px.
 */
export const SAFE_ZONES: Record<string, string> = {
  '1:1':  'Centre 80% is active area. Outer 10% each side is bleed-safe but not text-safe. Instagram grid (3:4 crop) keeps centre 1012 × 1350px — keep dish and any text inside that zone.',
  '4:5':  'Top 15% and bottom 15% risk platform chrome. Keep subject in middle 70%. Text-safe area: centre 70% vertically.',
  '9:16': 'Top 14% (~270px) = status bar / profile handle risk. Bottom 20–25% (~385–480px) = caption text, audio strip, Like/Comment/Share buttons. Left/right 6% (~65px) = thumb-safe margins. Place hero subject and all text burns inside the central 88% × 65% zone.',
};

/** Human-facing composition rules that used to be in the prompt. Kept for docs / QA checklists. */
export const COMPOSITION_NOTES = [
  'People in frame: rule-of-thirds placement, eyeline facing into the frame; hands and forearms (pouring, tearing, ladling) outperform faces for food engagement.',
  'Leave 30–40% negative space on one side for caption/price overlays.',
  'Avoid heavy colour grading, artificial gloss, plastic-looking food, stock-photo garnish, embedded text/watermarks, and flat overhead angles for curries or biryani.',
];

/** Hard cap on the style tail so it can never crowd out the subject. */
export const STYLE_TAIL_MAX_CHARS = 420;

function pickAngle(postType: string): string {
  switch (postType) {
    case 'STORY':
    case 'REEL':
    case 'VIDEO':
      return 'portrait framing, centred subject, lower third of the frame kept clear';
    case 'CAROUSEL':
      return 'consistent lighting and colour grade across all frames';
    default:
      return '45-degree angle showing height and depth of the dish';
  }
}

/**
 * Build the positive style tail appended to every image prompt.
 * Keep this compact and visual — the SUBJECT comes from the art-director brief
 * (generate-post.ts), this only sets the look.
 */
export function buildImagePromptFragment(input: ImageGenInput, ctx: SpecializationContext): string {
  const aesthetic = getRegionalAesthetic(ctx.cuisine);
  const angle = pickAngle(input.postType);
  const shot = input.shotType ?? 'DISH';

  // The style tail must not smuggle a dish back into a non-dish frame. Each shot
  // type gets its own positive description of what the frame IS.
  const lead =
    shot === 'AMBIENCE'
      ? `Style: editorial interior photography of a restaurant, wide-angle eye-level view of the dining space — set tables, seating, walls, lamps and window light as the subject; the room is the hero, empty of diners or with a few blurred in the distance; warm ambient light, honest true-to-life colours, deep depth of field.`
      : shot === 'PEOPLE'
      ? `Style: candid documentary photography of restaurant staff or guests at work — hands and gestures, natural expressions, environmental portrait framing; warm natural side light, honest true-to-life colours, shallow depth of field.`
      : shot === 'ANNOUNCEMENT'
      ? `Style: clean editorial lifestyle photograph for a restaurant announcement, calm composition with a large area of soft, uncluttered background suitable for overlaid text; warm natural light, honest colours.`
      : `Style: editorial food photography, ${angle}, warm natural side light, honest true-to-life colours, shallow depth of field.`;

  const surfaceLine =
    shot === 'DISH'
      ? `Surface: ${aesthetic.surface}. Props: ${aesthetic.props}. Palette: ${aesthetic.colours}.`
      : `Palette: ${aesthetic.colours}.`;

  const tail = [
    lead,
    surfaceLine,
    `Composition: subject on a rule-of-thirds line with clean negative space on one side; no text, no watermark, no logos.`,
  ].join(' ');

  return tail.length > STYLE_TAIL_MAX_CHARS ? tail.slice(0, STYLE_TAIL_MAX_CHARS - 1).trimEnd() + '.' : tail;
}
