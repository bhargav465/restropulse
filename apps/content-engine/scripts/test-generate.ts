/**
 * One-shot AI generation smoke test.
 * Runs outside the cron worker — no DB or full stack needed.
 *
 * Usage:
 *   npm run test:generate                            # cycle + one IMAGE post
 *   npm run test:generate -- --type REEL             # test video (async, prints jobId)
 *   npm run test:generate -- --concept "your idea"   # custom concept
 */

import 'dotenv/config';
import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.resolve(process.cwd(), '.env'), override: false });

import { createContentGenerator } from '../src/services/content-generator/index.js';
import type { PostType } from '@restropulse/shared';

const args = process.argv.slice(2);
const typeArg = args[args.indexOf('--type') + 1] as PostType | undefined;
const conceptArg = args[args.indexOf('--concept') + 1];

const postType: PostType = typeArg ?? 'IMAGE';
const concept = conceptArg ?? 'Freshly made dosa with sambar and chutney';
const ctx = { restaurantId: 'r1', restaurantName: 'Spice Garden' };

console.log('Creating AI generator...');
const gen = createContentGenerator('ai');
console.log(`Backend: ${gen.name}\n`);

// --- Cycle planning (Sonnet + current-affairs) ---
console.log('=== DRAFT CYCLE ===');
try {
  const cycle = await gen.draftCycle({
    period: 'Week of June 9-15, 2026',
    strategyThemes: ['festive', 'weekend-specials'],
  }, ctx);

  console.log('Summary:', cycle.summary);
  console.log('Focus:', cycle.focus?.join(', ') ?? 'n/a');
  console.log('Planned posts:');
  cycle.plannedPosts.forEach((p, i) =>
    console.log(`  ${i + 1}. [${p.type.padEnd(9)}] ${p.concept}`),
  );
} catch (err) {
  console.error('Cycle draft failed:', (err as Error).message);
}

// --- Single post (Haiku + media) ---
console.log(`\n=== GENERATE POST [${postType}] ===`);
console.log('Concept:', concept);
try {
  const post = await gen.generatePost({
    postType,
    platforms: ['INSTAGRAM'],
    concept,
    restaurantId: ctx.restaurantId,
  }, ctx);

  console.log('\nCaption:\n', post.caption);
  if (post.mediaUrl) {
    console.log('\nMedia URL:', post.mediaUrl);
  } else if (post.thumbnail) {
    console.log('\nThumbnail:', post.thumbnail);
  } else {
    console.log('\nMedia: pending (video job submitted — check mediaJobs collection)');
  }
} catch (err) {
  console.error('Post generation failed:', (err as Error).message);
}
