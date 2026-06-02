/**
 * Restaurant-domain system + per-operation task prompts.
 *
 * System prompt is a prompt-cache breakpoint — all 5 blocks must be deterministic
 * given ctx. Time-varying data (today's festival, trending topics) stays in the
 * current-affairs pipeline and arrives as current-affairs hints, never here.
 */

import type {
  SpecializationContext,
  SpecializationOperation,
  SpecializationOperationInput,
} from '../types.js';
import { getRegionalAesthetic, PRICE_REGISTER_GUIDE, VERNACULAR_POSTURE } from './india-context.js';
import { RESTAURANT_ARCHETYPES, getWeeklyArchetypeMix } from './content-patterns.js';
import { getDefaultHook } from './hooks.js';

export function buildSystemPromptFragment(ctx: SpecializationContext): string {
  const name = ctx.restaurantName ?? 'the restaurant';
  const voice = ctx.brandVoice ?? 'warm and inviting';
  const cuisine = ctx.cuisine ?? 'multi-cuisine';
  const dietary = ctx.dietaryFocus?.length ? ctx.dietaryFocus.join(', ') : 'none specified';
  const region = ctx.region ?? 'India';
  const aesthetic = getRegionalAesthetic(ctx.cuisine);

  // Block 3: price register — derived deterministically from cuisine string
  const cuisineLower = cuisine.toLowerCase();
  const priceReg = cuisineLower.includes('fine') || cuisineLower.includes('premium')
    ? PRICE_REGISTER_GUIDE.premiumSignal
    : cuisineLower.includes('street') || cuisineLower.includes('budget') || cuisineLower.includes('qsr')
    ? PRICE_REGISTER_GUIDE.valueSignal
    : PRICE_REGISTER_GUIDE.midRangeSignal;

  // Vernacular posture — south Indian restaurants get regional-language note
  const isSouthIndian = cuisineLower.includes('south indian') || cuisineLower.includes('andhra')
    || cuisineLower.includes('tamil') || cuisineLower.includes('kerala') || cuisineLower.includes('chettinad')
    || ctx.region?.toLowerCase().includes('south');
  const vernacularNote = isSouthIndian
    ? VERNACULAR_POSTURE.southIndianNote
    : VERNACULAR_POSTURE.rule;

  // Block 5: compact archetype reference (ID + purpose + default hook opener)
  const archetypeTable = getWeeklyArchetypeMix()
    .map(a => {
      const hook = getDefaultHook(a.id);
      const hookPreview = hook?.captionOpener.split('.')[0] ?? a.label;
      return `  ${a.id.padEnd(26)} ${a.label.padEnd(20)} — ${hookPreview}`;
    })
    .join('\n');

  return [
    // Block 1 — Restaurant identity
    `You are an expert social media copywriter and creative director for restaurants in India.`,
    `You write content for ${name}, a ${cuisine} restaurant in ${region}.`,
    `Brand voice: ${voice}.`,
    `Dietary focus: ${dietary}.`,
    ``,
    // Block 2 — Brand compliance (FSSAI + honesty)
    `COMPLIANCE RULES (non-negotiable):`,
    `- Do NOT make health claims. No "cures", "prevents disease", "weight loss", "boosts immunity", "treats illness", or comparative health language ("healthier than", "better for your gut").`,
    `- Never invent menu items, ingredients, prices, or offers not explicitly provided.`,
    `- No dark patterns or false urgency ("only 2 left!" without evidence).`,
    `- No false comparative pricing claims ("cheaper than X restaurant").`,
    ``,
    // Block 3 — India cultural grounding
    `INDIA MARKET CONTEXT:`,
    `- First 125 characters are above-the-fold on Instagram — hook the reader there.`,
    `- 80-85% of Indian users scroll without sound — every reel hook must work as text overlay alone.`,
    `- Pricing language: ${priceReg}. Avoid: ${PRICE_REGISTER_GUIDE.avoidPhrases.join(', ')}.`,
    `- Vernacular: ${vernacularNote}`,
    `- Visual aesthetic for this cuisine: ${aesthetic.surface} surface; ${aesthetic.colours} palette; props: ${aesthetic.props}.`,
    aesthetic.avoidNote ? `- Visual note: ${aesthetic.avoidNote}.` : '',
    ``,
    // Block 4 — Content philosophy
    `CONTENT PHILOSOPHY:`,
    `- Authenticity over polish. Indian food audiences trust specificity — name the technique, the region, the supplier.`,
    `- Use sensory language: texture, aroma, temperature, sound, colour. Vague praise ("delicious", "amazing") is wasted.`,
    `- Emotional currency: family, nostalgia, pride of place, and origin story outperform product-push in Indian markets.`,
    `- Every caption must make the reader feel something — hunger, nostalgia, pride, or curiosity — before it sells anything.`,
    ``,
    // Block 5 — Archetype reference table
    `CONTENT ARCHETYPES (reference — do not reproduce verbatim):`,
    archetypeTable,
  ].filter(Boolean).join('\n');
}

export function buildTaskPrompt(
  operation: SpecializationOperation,
  input: SpecializationOperationInput,
  ctx: SpecializationContext,
): string {
  const name = ctx.restaurantName ?? 'the restaurant';

  switch (operation) {
    case 'draftCycle': {
      const inp = input as any;
      const topArchetypes = getWeeklyArchetypeMix()
        .slice(0, 5)
        .map(a => `${a.label} (~${Math.round(a.recommendedFrequency * 100)}%)`)
        .join(', ');
      return [
        `Draft a content cycle for ${name}.`,
        `Period: ${inp.period ?? 'unspecified'}.`,
        `Themes: ${(inp.strategyThemes ?? []).join(', ') || 'use seasonal and regional context'}.`,
        ``,
        `Requirements:`,
        `- Produce a balanced archetype mix. Priority weighting: ${topArchetypes}.`,
        `- Every planned post should have a clear archetype in mind.`,
        `- Include at least one FESTIVAL_TIE_IN if a festival falls within the period — but check if the festival has food sensitivity restrictions before promoting non-veg content.`,
        `- Include at least one BEHIND_THE_SCENES or STAFF_SPOTLIGHT per cycle.`,
        `- Vary hook types across posts so the week feels diverse, not repetitive.`,
      ].join('\n');
    }

    case 'reviseCycle':
      return [
        `Revise the supplied cycle while addressing every item in the feedback.`,
        `Keep what worked — change only what the feedback flags.`,
        `Maintain archetype balance: no archetype should repeat more than twice in a 7-day cycle.`,
        `Preserve the overall period and restaurant identity.`,
      ].join('\n');

    case 'generatePost': {
      const inp = input as any;
      const archetype = RESTAURANT_ARCHETYPES.find(a => a.id === (inp.archetype as string));
      const hookEntry = archetype ? getDefaultHook(archetype.id) : null;

      return [
        `Generate a single post for ${name}.`,
        `Concept: ${inp.concept ?? 'unspecified'}.`,
        `Type: ${inp.type ?? 'IMAGE'}. Platforms: ${(inp.platforms ?? []).join(', ') || 'INSTAGRAM'}.`,
        archetype ? `Archetype: ${archetype.label} — ${archetype.description}.` : '',
        hookEntry ? `Hook guidance: ${hookEntry.captionOpener}` : '',
        hookEntry ? `Example opener style: "${hookEntry.exampleOpener}"` : '',
        ``,
        `Caption requirements:`,
        `- First 125 characters must hook the reader above the fold.`,
        `- Use sensory-first language — name the texture, aroma, temperature.`,
        `- End with 3–8 relevant hashtags on a new line.`,
        archetype?.fssaiSensitive
          ? `FSSAI SENSITIVE: State dietary properties as facts only (e.g. "made with ragi", "100% vegan"). No benefit claims. No comparative health language.`
          : '',
      ].filter(Boolean).join('\n');
    }

    case 'revisePost':
      return [
        `Revise the existing post to address every item in the feedback.`,
        `Preserve the original concept, archetype, and restaurant identity.`,
        `Modify only what the feedback flags — do not rewrite what is working.`,
        `Maintain the same caption length range and hashtag count.`,
      ].join('\n');
  }
}
