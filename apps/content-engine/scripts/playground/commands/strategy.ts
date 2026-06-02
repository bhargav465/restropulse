import path from 'node:path';
import { config } from 'dotenv';
config({ path: path.resolve(process.cwd(), '.env'), override: false });

import { getRestaurantsFromDB } from '../lib/db-setup.js';
import { selectFromList, ask, confirm, closePrompts } from '../lib/prompts.js';
import { hr, success } from '../lib/display.js';
import { createCycle } from '@restropulse/db';
import { createContentGenerator } from '../../../src/services/content-generator/index.js';
import type { PlannedPost } from '@restropulse/shared';

export async function runStrategyCommand(): Promise<void> {
  hr('CREATE STRATEGY CYCLE');

  const restaurants = await getRestaurantsFromDB();
  const restaurant = await selectFromList(
    restaurants,
    (r) => `${r.name}  [${r._id}]  ${r.cuisine.split(',')[0]}`,
    'Select a restaurant',
  );

  const startDateInput = await ask(`\nCycle start date (YYYY-MM-DD) [default: today]: `);
  const startDate = startDateInput.trim() || new Date().toISOString().split('T')[0];
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const endDate = end.toISOString().split('T')[0];

  const defaultPeriod = `Week of ${start.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`;
  const periodInput = await ask(`Period label [default: ${defaultPeriod}]: `);
  const period = periodInput.trim() || defaultPeriod;

  const themesInput = await ask(`Focus themes (comma-separated) [optional]: `);
  const themes = themesInput.trim() ? themesInput.split(',').map(t => t.trim()) : [];

  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const backendDefault = hasAnthropicKey ? 'ai' : 'placeholder';
  const backendInput = await ask(`Backend: ai / placeholder [default: ${backendDefault}]: `);
  const backend = (backendInput.trim() || backendDefault) as 'ai' | 'placeholder';

  console.log('\nDrafting cycle...');
  const gen = createContentGenerator(backend);
  const cycle = await gen.draftCycle(
    { period, startDate, endDate, strategyThemes: themes.length ? themes : undefined },
    { restaurantId: restaurant._id, restaurantName: restaurant.name },
  );

  hr('RESULT');
  console.log(`\nSummary: ${cycle.summary}`);
  console.log(`\nFocus: ${cycle.focus?.join(', ') ?? 'n/a'}`);
  console.log('\nPlanned posts:');
  cycle.plannedPosts.forEach((p: PlannedPost, i: number) => console.log(`  ${i + 1}. [${p.category}] x${p.count}`));

  const save = await confirm('\nSave this cycle to DB?');
  if (save) {
    const saved = await createCycle({
      restaurantId: restaurant._id,
      period,
      startDate,
      endDate,
      status: 'PENDING_APPROVAL',
      summary: cycle.summary,
      plannedPosts: cycle.plannedPosts,
      focus: cycle.focus ?? [],
    });
    success(`Cycle saved: ${saved.id}`);
  }

  closePrompts();
}
