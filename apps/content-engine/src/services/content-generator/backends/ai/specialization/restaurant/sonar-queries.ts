/**
 * Restaurant-tuned Perplexity Sonar query templates (phase 3 will call these).
 */

import type { SonarQueryScope, SpecializationContext } from '../types.js';

export function buildSonarQueries(scope: SonarQueryScope, ctx: SpecializationContext): string[] {
  if (scope === 'daily-platform') {
    return [
      'What major Indian holidays, sports events, festivals, weather events, and trending topics today and tomorrow could a restaurant reference in social media content?',
    ];
  }

  const cuisine = ctx.cuisine ?? 'Indian';
  const region = ctx.region ?? 'India';

  return [
    `What are the trending food and dining conversations in ${region} this week that a ${cuisine} restaurant could tap into on Instagram?`,
    `What ${cuisine} cuisine moments (dish history, regional traditions) would resonate with diners in ${region} right now?`,
    `What sports, festival, or weather hooks in ${region} are restaurant audiences engaging with on social media this week?`,
  ];
}
