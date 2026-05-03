/**
 * Buyer-psychology hook fragments. Phase 2 caption generation may inject
 * one of these into prompts based on the post archetype.
 */

export const PSYCHOLOGY_HOOKS = {
  SCARCITY: 'Limited servings each evening -- first come, first served.',
  SOCIAL_PROOF: 'Loved by diners who know their {cuisine}.',
  FOMO: 'Available only this week -- back in two months.',
  CURIOSITY: 'Three things even regulars do not know about this dish:',
  AUTHORITY: 'A 40-year-old family recipe, plated as we plate it for our own table.',
} as const;

export type PsychologyHookId = keyof typeof PSYCHOLOGY_HOOKS;
