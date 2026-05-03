/**
 * Restaurant-domain system + per-operation task prompts.
 *
 * Plain string assembly. Anthropic prompt caching (added in phase 2) will treat
 * the system prompt fragment as a cache breakpoint; keep it stable.
 */

import type {
  SpecializationContext,
  SpecializationOperation,
  SpecializationOperationInput,
} from '../types.js';

export function buildSystemPromptFragment(ctx: SpecializationContext): string {
  const name = ctx.restaurantName ?? 'the restaurant';
  const voice = ctx.brandVoice ?? 'warm and inviting';
  const cuisine = ctx.cuisine ?? 'multi-cuisine';
  const dietary = ctx.dietaryFocus?.length ? ctx.dietaryFocus.join(', ') : 'none specified';

  return [
    `You are an expert social media copywriter and creative director for restaurants in India.`,
    `You write content for ${name}, a ${cuisine} restaurant.`,
    `Brand voice: ${voice}.`,
    `Dietary focus: ${dietary}.`,
    ``,
    `RULES:`,
    `- Use sensory-first language (texture, aroma, temperature, sound). Specificity wins.`,
    `- Do NOT make health claims. FSSAI restricts wording like "cures", "prevents disease",`,
    `  "weight loss", "boosts immunity". Avoid them entirely.`,
    `- Match the brand voice on every line.`,
    `- Never invent menu items, ingredients, prices, or offers that were not provided.`,
    `- Captions should pull readers in within the first sentence (the above-the-fold cut at ~125 chars on Instagram).`,
  ].join('\n');
}

export function buildTaskPrompt(
  operation: SpecializationOperation,
  input: SpecializationOperationInput,
  ctx: SpecializationContext,
): string {
  switch (operation) {
    case 'draftCycle':
      return [
        `Draft a content cycle for ${ctx.restaurantName ?? 'the restaurant'}.`,
        `Period: ${(input as any).period ?? 'unspecified'}.`,
        `Themes: ${((input as any).strategyThemes ?? []).join(', ') || 'general'}.`,
        `Produce a balanced mix across the seven restaurant content archetypes.`,
      ].join('\n');

    case 'reviseCycle':
      return [
        `Revise the supplied cycle while addressing every item in the feedback.`,
        `Keep what worked; change only what the feedback flags.`,
      ].join('\n');

    case 'generatePost':
      return [
        `Generate a single post for the supplied concept.`,
        `Concept: ${(input as any).concept ?? 'unspecified'}.`,
        `Type: ${(input as any).type ?? 'IMAGE'}. Platforms: ${((input as any).platforms ?? []).join(', ') || 'INSTAGRAM'}.`,
      ].join('\n');

    case 'revisePost':
      return [
        `Revise the existing post to address every item in the feedback.`,
        `Preserve the original concept and tone; modify only what feedback flags.`,
      ].join('\n');
  }
}
