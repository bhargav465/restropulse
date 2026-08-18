/**
 * Zod schemas for structured LLM outputs.
 *
 * Vercel AI SDK's generateObject() validates the parsed JSON against these
 * schemas before returning. Mismatches cause an exception that
 * AnthropicLLMProvider classifies (typically non-retriable -- a model that
 * doesn't follow the schema won't follow it on retry either).
 */

import { z } from 'zod';

export const PlannedPostSchema = z.object({
  category: z.string().min(1),
  count: z.number().int().positive(),
  themes: z.array(z.string().min(1)).max(3).optional(),
});

export const CycleSchema = z.object({
  summary: z.string().min(1),
  plannedPosts: z.array(PlannedPostSchema).min(1),
  focus: z.array(z.string().min(1)).min(1),
  rationale: z.string().optional(),
});

export type CycleSchemaType = z.infer<typeof CycleSchema>;

export const PostCaptionSchema = z.object({
  /** The post caption (without hashtags). */
  caption: z.string().min(1),
  /** Hashtags suggested by the model. Final selection is merged with specialization output. */
  suggestedHashtags: z.array(z.string()).optional(),
  /** Archetype the model chose; informational only (not enforced). */
  archetype: z.string().optional(),
  /** 1-2 sentences explaining why this specific content was chosen — the strategic or seasonal rationale. */
  motivation: z.string().min(1),
  /** The main dish featured in this content, when the post is dish-specific. Must match a menu item if one was provided. */
  selectedDish: z.string().optional(),
  /**
   * For CAROUSEL posts only: per-slide visual brief (2-6 items).
   * Each string describes what a single slide should show — a distinct moment, stage, or
   * facet of the same subject, not just a camera angle. Used by the media generator to produce
   * slides that share a narrative arc while remaining visually distinct.
   */
  carouselSlides: z.array(z.string().min(1)).min(2).max(6).optional(),
});

export type PostCaptionSchemaType = z.infer<typeof PostCaptionSchema>;

/**
 * Art-director output (IG-3). One short structured shot brief produced AFTER the
 * caption, from (user concept + caption + selected dish + cuisine). Rendered by
 * generate-post.ts into the image prompt so the picture matches the post, not a
 * random dish. Every field is a positive visual statement -- no "avoid" language.
 */
export const ShotTypeSchema = z.enum(['DISH', 'AMBIENCE', 'PEOPLE', 'ANNOUNCEMENT']);
export type ShotType = z.infer<typeof ShotTypeSchema>;

export const ShotBriefSchema = z.object({
  /**
   * What kind of frame this is. DISH = a plated dish is the hero. AMBIENCE = the
   * space itself (interior, tables, lighting, façade) is the hero and no plated
   * food is the subject. PEOPLE = staff/guests/hands at work. ANNOUNCEMENT =
   * an offer/event/hiring visual (still photographic; text is added later).
   * When the user concept excludes food ("no dish", "ambience only") this MUST
   * NOT be DISH.
   */
  shotType: ShotTypeSchema,
  /** The hero of the frame -- for DISH: form, colour, texture, garnish, vessel; for AMBIENCE: the room, tables, walls, light; for PEOPLE: who and what they are doing. */
  subject: z.string().min(1),
  /** Where the subject sits: table, counter, kitchen, street stall, home dining -- one clause. */
  setting: z.string().min(1),
  /** 2-4 supporting objects that reinforce the concept (e.g. "brass diya, marigold petals"). */
  props: z.string().min(1),
  /** Light quality and direction, one clause. */
  lighting: z.string().min(1),
  /** Overall mood in 2-5 words. */
  mood: z.string().min(1),
  /**
   * When the concept is tied to an occasion/event (festival, match night, weather),
   * a SMALL prop-level cue that signals it without replacing the dish as hero.
   */
  occasionCue: z.string().optional(),
});

export type ShotBriefSchemaType = z.infer<typeof ShotBriefSchema>;
