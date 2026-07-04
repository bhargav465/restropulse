/**
 * Restaurant content archetypes — the creative frames that shape every post.
 * Each archetype maps to a hook type and frequency guidance for cycle planning.
 * Consumed by prompts.ts (system prompt archetype table) and the LLM when
 * planning cycles (draftCycle) and generating posts (generatePost).
 */

import type { HookType } from './hooks.js';

export type RestaurantArchetypeId =
  | 'CHEFS_PICK'
  | 'BEHIND_THE_SCENES'
  | 'SOCIAL_PROOF'
  | 'FESTIVAL_TIE_IN'
  | 'CUISINE_EDUCATION'
  | 'OFFER_PROMO'
  | 'ORIGIN_STORY'
  | 'STAFF_SPOTLIGHT'
  | 'HEALTH_DIETARY_SIGNAL';

export interface RestaurantArchetype {
  id: RestaurantArchetypeId;
  label: string;
  description: string;
  defaultHookType: HookType;
  /** Fraction of a weekly content plan this archetype should occupy (all sum to ~1.0). */
  recommendedFrequency: number;
  /** true = validateOutput applies a stricter health-claim / FSSAI second-pass check. */
  fssaiSensitive: boolean;
  reelCompatible: boolean;
  carouselCompatible: boolean;
}

export const RESTAURANT_ARCHETYPES: ReadonlyArray<RestaurantArchetype> = [
  {
    id: 'CHEFS_PICK',
    label: "Chef's Pick",
    description: 'Featured dish with chef endorsement, scarcity, or seasonal availability angle',
    defaultHookType: 'CURIOSITY_GAP',
    recommendedFrequency: 0.20,
    fssaiSensitive: false,
    reelCompatible: true,
    carouselCompatible: false,
  },
  {
    id: 'BEHIND_THE_SCENES',
    label: 'Behind the Scenes',
    description: 'Kitchen prep, plating craft, sourcing journey, morning routine',
    defaultHookType: 'PROCESS_REVEAL',
    recommendedFrequency: 0.15,
    fssaiSensitive: false,
    reelCompatible: true,
    carouselCompatible: true,
  },
  {
    id: 'SOCIAL_PROOF',
    label: 'Social Proof',
    description: 'Customer reviews, UGC reposts, occasion celebrations, table moments',
    defaultHookType: 'SOCIAL_PROOF_OPEN',
    recommendedFrequency: 0.10,
    fssaiSensitive: false,
    reelCompatible: false,
    carouselCompatible: true,
  },
  {
    id: 'FESTIVAL_TIE_IN',
    label: 'Festival Tie-in',
    description: 'Holiday/season-themed specials; must respect festival food sensitivity per india-context.ts',
    defaultHookType: 'FESTIVAL_MOMENT',
    recommendedFrequency: 0.10,
    fssaiSensitive: false,
    reelCompatible: true,
    carouselCompatible: true,
  },
  {
    id: 'CUISINE_EDUCATION',
    label: 'Cuisine Education',
    description: 'Dish origin, technique explainer, ingredient story, regional history',
    defaultHookType: 'UNEXPECTED_FACT',
    recommendedFrequency: 0.10,
    fssaiSensitive: false,
    reelCompatible: true,
    carouselCompatible: true,
  },
  {
    id: 'OFFER_PROMO',
    label: 'Offer / Promo',
    description: 'Combo deal, weekday discount, loyalty reward, limited-time offer',
    defaultHookType: 'PRICE_ANCHOR',
    recommendedFrequency: 0.15,
    fssaiSensitive: false,
    reelCompatible: false,
    carouselCompatible: false,
  },
  {
    id: 'ORIGIN_STORY',
    label: 'Origin Story',
    description: 'Chef biography, family recipe legacy, how the restaurant started',
    defaultHookType: 'BEHIND_THE_SCENES',
    recommendedFrequency: 0.05,
    fssaiSensitive: false,
    reelCompatible: true,
    carouselCompatible: true,
  },
  {
    id: 'STAFF_SPOTLIGHT',
    label: 'Staff Spotlight',
    description: 'Feature a cook, server, or delivery partner — humanises the brand; high engagement in Indian food social',
    defaultHookType: 'BEHIND_THE_SCENES',
    recommendedFrequency: 0.08,
    fssaiSensitive: false,
    reelCompatible: true,
    carouselCompatible: false,
  },
  {
    id: 'HEALTH_DIETARY_SIGNAL',
    label: 'Dietary Highlight',
    description: 'Factual labelling: millet-based, jain, vegan, high-protein. Factual claims ONLY — no benefit claims.',
    defaultHookType: 'UNEXPECTED_FACT',
    recommendedFrequency: 0.07,
    fssaiSensitive: true,
    reelCompatible: false,
    carouselCompatible: true,
  },
];

/** Returns archetypes sorted by recommended frequency (highest first). */
export function getWeeklyArchetypeMix(): RestaurantArchetype[] {
  return [...RESTAURANT_ARCHETYPES].sort((a, b) => b.recommendedFrequency - a.recommendedFrequency);
}
