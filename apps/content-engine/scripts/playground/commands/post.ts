import path from 'node:path';
import { config } from 'dotenv';
config({ path: path.resolve(process.cwd(), '.env'), override: false });

import { getRestaurantsFromDB } from '../lib/db-setup.js';
import { selectFromList, ask, confirm, closePrompts } from '../lib/prompts.js';
import { hr, success, warn } from '../lib/display.js';
import { findAllCycles, createPost } from '@restropulse/db';
import { createContentGenerator } from '../../../src/services/content-generator/index.js';
import type { PostType, Platform } from '@restropulse/shared';

const POST_TYPES: PostType[] = ['IMAGE', 'CAROUSEL', 'STORY', 'REEL', 'VIDEO'];
const PLATFORMS: Platform[] = ['INSTAGRAM', 'FACEBOOK'];

export async function runPostCommand(): Promise<void> {
  hr('CREATE POST');

  const restaurants = await getRestaurantsFromDB();
  const restaurant = await selectFromList(
    restaurants,
    (r) => `${r.name}  [${r._id}]`,
    'Select a restaurant',
  );

  const cycles = await findAllCycles(restaurant._id);
  let cycleId: string | undefined;
  if (cycles.length > 0) {
    const withSkip = [...cycles, { id: 'SKIP', period: 'Ad-hoc (no cycle)', status: '', startDate: '', endDate: '', summary: '', plannedPosts: [], focus: [] }] as any[];
    const selected = await selectFromList(
      withSkip,
      (c) => c.id === 'SKIP' ? 'Ad-hoc (no cycle)' : `${c.period}  [${c.status}]`,
      'Select a cycle (or ad-hoc)',
    );
    if (selected.id !== 'SKIP') cycleId = selected.id;
  }

  const dateInput = await ask(`\nScheduled date (YYYY-MM-DD) [default: today]: `);
  const scheduledFor = dateInput.trim() ? new Date(dateInput.trim()).toISOString() : new Date().toISOString();

  const concept = await ask(`Concept / prompt (required): `);
  if (!concept.trim()) { console.error('Concept is required.'); closePrompts(); return; }

  const postType = await selectFromList(POST_TYPES, t => t, 'Post type') as PostType;

  const platformInput = await ask(`Platforms: INSTAGRAM / FACEBOOK / both [default: INSTAGRAM]: `);
  const platforms: Platform[] = platformInput.trim().toLowerCase() === 'both'
    ? ['INSTAGRAM', 'FACEBOOK']
    : platformInput.trim().toUpperCase() === 'FACEBOOK'
    ? ['FACEBOOK']
    : ['INSTAGRAM'];

  const hasCalendarKey = !!process.env.GOOGLE_CALENDAR_API_KEY || !!process.env.PERPLEXITY_API_KEY;
  let currentAffairsHints: string[] | undefined;
  if (hasCalendarKey) {
    const useCA = await confirm('Use current affairs hints?');
    if (!useCA) currentAffairsHints = [];
  }

  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const backendDefault = hasAnthropicKey ? 'ai' : 'placeholder';
  const backendInput = await ask(`Backend: ai / placeholder [default: ${backendDefault}]: `);
  const backend = (backendInput.trim() || backendDefault) as 'ai' | 'placeholder';

  console.log('\nGenerating post...');
  const gen = createContentGenerator(backend);
  const post = await gen.generatePost(
    { concept: concept.trim(), type: postType, platforms, cycleId, currentAffairsHints },
    { restaurantId: restaurant._id, restaurantName: restaurant.name },
  );

  hr('RESULT');
  console.log('\nCaption:\n');
  console.log(post.caption);
  if (post.videoUrl) { console.log(`\nVideo URL: ${post.videoUrl}`); }
  else if (post.mediaUrls?.[0]) { console.log(`\nMedia URL: ${post.mediaUrls[0]}`); }
  else if (post.thumbnail) { console.log(`\nThumbnail: ${post.thumbnail}`); }
  if (post.mediaJobId) {
    warn(`Async video job submitted — jobId: ${post.mediaJobId}`);
    console.log('  Check db.mediaJobs for progress. Status: PENDING_MEDIA');
  }

  const save = await confirm('\nSave this post to DB?');
  if (save) {
    const saved = await createPost({
      restaurantId: restaurant._id,
      type: postType,
      status: 'PENDING_APPROVAL',
      platforms,
      caption: post.caption,
      thumbnail: post.thumbnail,
      ...(post.mediaUrls ? { mediaUrls: post.mediaUrls } : {}),
      ...(post.videoUrl ? { videoUrl: post.videoUrl } : {}),
      ...(post.mediaJobId ? { mediaJobId: post.mediaJobId } : {}),
      ...(cycleId ? { cycleId } : {}),
      scheduledFor,
      isAdhoc: !cycleId,
    });
    success(`Post saved: ${saved.id}`);
  }

  closePrompts();
}
