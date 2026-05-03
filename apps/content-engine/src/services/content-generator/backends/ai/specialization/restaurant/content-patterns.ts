/**
 * Seven high-performing restaurant content archetypes (ADR 0001).
 *
 * Phase 2's caption generator will sample these when no specific archetype is
 * supplied. Phase 1 only ships the catalog and a shape.
 */

export type RestaurantArchetypeId =
  | 'CHEFS_PICK'
  | 'BEHIND_THE_SCENES'
  | 'SOCIAL_PROOF'
  | 'FESTIVAL_TIE_IN'
  | 'CUISINE_EDUCATION'
  | 'OFFER_PROMO'
  | 'ORIGIN_STORY';

export interface RestaurantArchetype {
  id: RestaurantArchetypeId;
  label: string;
  description: string;
  hook: string;
}

export const RESTAURANT_ARCHETYPES: ReadonlyArray<RestaurantArchetype> = [
  { id: 'CHEFS_PICK', label: "Chef's Pick", description: 'Featured dish + price + scarcity hook', hook: 'Today only:' },
  { id: 'BEHIND_THE_SCENES', label: 'Behind the Scenes', description: 'Kitchen prep, plating, sourcing', hook: 'How it is made:' },
  { id: 'SOCIAL_PROOF', label: 'Social Proof', description: 'Reviews, UGC reposts, occasion celebrations', hook: 'Loved by:' },
  { id: 'FESTIVAL_TIE_IN', label: 'Festival Tie-in', description: 'Holiday/season-themed combos and specials', hook: 'Just in time for:' },
  { id: 'CUISINE_EDUCATION', label: 'Cuisine Education', description: 'Origin / technique / ingredient explainer', hook: 'Did you know:' },
  { id: 'OFFER_PROMO', label: 'Offer / Promo', description: 'Combo deal, weekday discount, loyalty reward', hook: 'This week:' },
  { id: 'ORIGIN_STORY', label: 'Origin Story', description: 'Chef interview, sourcing story, sustainability angle', hook: 'Behind the brand:' },
];
