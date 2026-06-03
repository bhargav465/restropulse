/**
 * Fetch top-rated Hyderabad restaurants from Zomato via Apify.
 *
 * Strategy for maximum records within $5 budget:
 *   - Filter builder mode: city=hyderabad, sort=rating, min_rating=4
 *   - expand_cuisines: true  → fans out across ~15 top cuisines (~135 restaurants)
 *   - expand_localities: true → fans out across all Hyderabad locality pages
 *   - Runs dining + delivery surfaces separately for wider coverage
 *   - Deduplicates by Zomato restaurant ID before saving
 *
 * Budget math:
 *   $0.005  actor start (per run)
 *   $0.002  per result (FREE tier)
 *   $5 budget → max ~2,497 results across all runs
 *
 * Output: scripts/output/hyderabad-restaurants.json
 *
 * Usage: node scripts/fetch-hyderabad-restaurants.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, 'output');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'hyderabad-restaurants.json');

const APIFY_TOKEN = 'apify_api_9CgzLYRdNFF0XU51xkrC1unHuawwqh4nlApa';
const ACTOR_ID = 'Gu5ENpoCVy6IJrXzs';
const BASE_URL = 'https://api.apify.com/v2';

// ─── API helpers ─────────────────────────────────────────────────────────────

async function startRun(input) {
  const res = await fetch(`${BASE_URL}/acts/${ACTOR_ID}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${APIFY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to start run: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.data.id;
}

async function pollRun(runId, label = '') {
  const pollInterval = 10_000; // 10s
  let dots = 0;
  while (true) {
    await new Promise(r => setTimeout(r, pollInterval));
    const res = await fetch(`${BASE_URL}/actor-runs/${runId}`, {
      headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` },
    });
    const data = await res.json();
    const { status, stats } = data.data;
    process.stdout.write(`\r  ${label} [${status}] ${stats?.itemCount ?? 0} results${'.'.repeat((++dots % 4) + 1)}   `);
    if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      process.stdout.write('\n');
      return { status, itemCount: stats?.itemCount ?? 0, datasetId: data.data.defaultDatasetId };
    }
  }
}

async function fetchDataset(datasetId) {
  const res = await fetch(
    `${BASE_URL}/datasets/${datasetId}/items?clean=true&limit=10000`,
    { headers: { 'Authorization': `Bearer ${APIFY_TOKEN}` } },
  );
  if (!res.ok) throw new Error(`Dataset fetch failed: ${res.status}`);
  return res.json();
}

// ─── Run configurations ───────────────────────────────────────────────────────

const RUNS = [
  {
    label: 'Dining Out — top-rated — expand cuisines + localities',
    input: {
      city: 'hyderabad',
      search_mode: 'dining',
      sort: 'rating',
      min_rating: '4',        // must be string
      expand_cuisines: true,
      expand_localities: true,
      ignore_url_failures: true,
    },
  },
  {
    label: 'Delivery — top-rated — expand cuisines + localities',
    input: {
      city: 'hyderabad',
      search_mode: 'delivery',
      sort: 'rating',
      min_rating: '4',        // must be string
      expand_cuisines: true,
      expand_localities: true,
      ignore_url_failures: true,
    },
  },
  // Cafes run already completed — results pre-loaded from output file above
];

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('Hyderabad Restaurant Fetch — Apify Zomato Scraper');
console.log('='.repeat(52));
console.log(`Budget: ~$5 | Max results: ~2,497 at $0.002/result`);
console.log(`Output: ${OUTPUT_FILE}`);
console.log();

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

const allById = new Map(); // dedup by Zomato restaurant ID
let totalCost = 0;
let runCount = 0;

// Pre-load previously fetched results (cafes run already done)
import { readFileSync, existsSync as existsSyncFs } from 'node:fs';
if (existsSyncFs(OUTPUT_FILE)) {
  const prev = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
  for (const r of prev) allById.set(r.id, r);
  console.log(`Pre-loaded ${allById.size} existing results from previous run.\n`);
}

for (const { label, input } of RUNS) {
  console.log(`Run ${++runCount}: ${label}`);

  // Budget guard — stop before we overspend
  const estimatedRemaining = (5 - totalCost - 0.005);
  const maxMoreResults = Math.floor(estimatedRemaining / 0.002);
  if (maxMoreResults <= 0) {
    console.log(`  Budget exhausted — skipping remaining runs.\n`);
    break;
  }
  console.log(`  Estimated remaining budget: $${estimatedRemaining.toFixed(3)} (~${maxMoreResults} more results)`);

  let runId;
  try {
    runId = await startRun(input);
    console.log(`  Run ID: ${runId}`);
    totalCost += 0.005; // actor start cost
  } catch (err) {
    console.error(`  Failed to start run: ${err.message}`);
    continue;
  }

  const { status, itemCount, datasetId } = await pollRun(runId, label.slice(0, 30));

  if (status !== 'SUCCEEDED') {
    console.log(`  Run ended with status: ${status} — skipping dataset fetch\n`);
    continue;
  }

  const items = await fetchDataset(datasetId);
  const actualCount = items.length;
  totalCost += actualCount * 0.002;
  console.log(`  Fetched ${actualCount} items (stats showed ${itemCount}) | Est. run cost: $${(0.005 + actualCount * 0.002).toFixed(3)}`);

  // Filter to Hyderabad only (actor may include nearby cities on locality expand)
  const hydItems = items.filter(r =>
    r.location?.city?.toLowerCase().includes('hyderabad') ||
    r.search_context?.city_slug === 'hyderabad',
  );

  let newCount = 0;
  for (const item of hydItems) {
    if (item.id && !allById.has(item.id)) {
      allById.set(item.id, item);
      newCount++;
    }
  }

  console.log(`  Hyderabad only: ${hydItems.length} | New unique: ${newCount} | Total unique so far: ${allById.size}`);
  console.log();
}

// ─── Save output ──────────────────────────────────────────────────────────────

const results = Array.from(allById.values())
  .sort((a, b) => (b.ratings?.aggregate ?? 0) - (a.ratings?.aggregate ?? 0));

// Slim down for storage — keep fields most useful for RestroPulse
const slimmed = results.map(r => ({
  id: r.id,
  name: r.name,
  url: r.url,
  cuisines: r.cuisines,
  location: {
    address: r.location?.address,
    locality: r.location?.locality,
    city: r.location?.city,
    latitude: r.location?.latitude,
    longitude: r.location?.longitude,
  },
  ratings: r.ratings,
  price: r.price,
  phones: r.phones,
  timing: r.timing,
  status: r.status,
  is_delivery_only: r.is_delivery_only,
  top_dishes: r.top_dishes,
  known_for: r.known_for,
  highlights: r.highlights,
  features: r.features,
  photo: r.photo?.url,
  image_count: r.image_count,
  scraped_at: r.search_context?.scraped_at,
}));

writeFileSync(OUTPUT_FILE, JSON.stringify(slimmed, null, 2), 'utf8');

// ─── Summary ──────────────────────────────────────────────────────────────────

const withTopDishes = slimmed.filter(r => r.top_dishes?.length > 0);
const avgRating = slimmed.length
  ? (slimmed.reduce((s, r) => s + (r.ratings?.aggregate ?? 0), 0) / slimmed.length).toFixed(2)
  : 0;

console.log('='.repeat(52));
console.log('SUMMARY');
console.log('='.repeat(52));
console.log(`Total unique restaurants : ${slimmed.length}`);
console.log(`With top_dishes data     : ${withTopDishes.length}`);
console.log(`Average rating           : ${avgRating}`);
console.log(`Estimated total cost     : $${totalCost.toFixed(3)}`);
console.log(`Output file              : ${OUTPUT_FILE}`);
console.log();

// Top 10 by rating
console.log('Top 10 by rating:');
slimmed.slice(0, 10).forEach((r, i) => {
  const dishes = r.top_dishes?.slice(0, 3).join(', ') || r.known_for || '—';
  console.log(`  ${i + 1}. ${r.name} (${r.ratings?.aggregate}) — ${dishes}`);
});
