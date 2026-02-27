/**
 * Download Placeholder Assets
 *
 * One-time setup script. Downloads food-themed placeholder images and
 * short sample videos into the assets/ directory so the content-engine
 * can serve them locally.
 *
 * Usage: npm run download-assets
 *
 * Skips files that already exist so it is safe to re-run.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '../assets');
const IMAGES_DIR = path.join(ASSETS_DIR, 'images');
const VIDEOS_DIR = path.join(ASSETS_DIR, 'videos');

// ---------------------------------------------------------------------------
// Asset definitions
// ---------------------------------------------------------------------------

// Food-themed images from picsum.photos using stable seeds.
// picsum returns 302 redirects; fetch() follows them automatically.
const IMAGES = [
  // Food & Menu (5)
  { filename: 'food-01.jpg',  url: 'https://picsum.photos/seed/rp-food-01/800/800' },
  { filename: 'food-02.jpg',  url: 'https://picsum.photos/seed/rp-food-02/800/800' },
  { filename: 'food-03.jpg',  url: 'https://picsum.photos/seed/rp-food-03/800/800' },
  { filename: 'food-04.jpg',  url: 'https://picsum.photos/seed/rp-food-04/800/800' },
  { filename: 'food-05.jpg',  url: 'https://picsum.photos/seed/rp-food-05/800/800' },
  // Chef Specials (4)
  { filename: 'chef-01.jpg',  url: 'https://picsum.photos/seed/rp-chef-01/800/800' },
  { filename: 'chef-02.jpg',  url: 'https://picsum.photos/seed/rp-chef-02/800/800' },
  { filename: 'chef-03.jpg',  url: 'https://picsum.photos/seed/rp-chef-03/800/800' },
  { filename: 'chef-04.jpg',  url: 'https://picsum.photos/seed/rp-chef-04/800/800' },
  // Behind the Scenes (4)
  { filename: 'bts-01.jpg',   url: 'https://picsum.photos/seed/rp-bts-01/800/800' },
  { filename: 'bts-02.jpg',   url: 'https://picsum.photos/seed/rp-bts-02/800/800' },
  { filename: 'bts-03.jpg',   url: 'https://picsum.photos/seed/rp-bts-03/800/800' },
  { filename: 'bts-04.jpg',   url: 'https://picsum.photos/seed/rp-bts-04/800/800' },
  // Customer Stories (4)
  { filename: 'cust-01.jpg',  url: 'https://picsum.photos/seed/rp-cust-01/800/800' },
  { filename: 'cust-02.jpg',  url: 'https://picsum.photos/seed/rp-cust-02/800/800' },
  { filename: 'cust-03.jpg',  url: 'https://picsum.photos/seed/rp-cust-03/800/800' },
  { filename: 'cust-04.jpg',  url: 'https://picsum.photos/seed/rp-cust-04/800/800' },
  // Offers (4)
  { filename: 'offer-01.jpg', url: 'https://picsum.photos/seed/rp-offer-01/800/800' },
  { filename: 'offer-02.jpg', url: 'https://picsum.photos/seed/rp-offer-02/800/800' },
  { filename: 'offer-03.jpg', url: 'https://picsum.photos/seed/rp-offer-03/800/800' },
  { filename: 'offer-04.jpg', url: 'https://picsum.photos/seed/rp-offer-04/800/800' },
  // default (3)
  { filename: 'default.jpg',    url: 'https://picsum.photos/seed/rp-default/800/800' },
  { filename: 'default-02.jpg', url: 'https://picsum.photos/seed/rp-default-02/800/800' },
  { filename: 'default-03.jpg', url: 'https://picsum.photos/seed/rp-default-03/800/800' },
];

// Video thumbnail images — portrait crop (1080×1920) for story/reel thumbnails
const VIDEO_THUMBS = [
  { filename: 'food-video-01-thumb.jpg',  url: 'https://picsum.photos/seed/rp-vid-food-01/1080/1920' },
  { filename: 'food-video-02-thumb.jpg',  url: 'https://picsum.photos/seed/rp-vid-food-02/1080/1920' },
  { filename: 'chef-video-01-thumb.jpg',  url: 'https://picsum.photos/seed/rp-vid-chef-01/1080/1920' },
  { filename: 'chef-video-02-thumb.jpg',  url: 'https://picsum.photos/seed/rp-vid-chef-02/1080/1920' },
  { filename: 'bts-video-01-thumb.jpg',   url: 'https://picsum.photos/seed/rp-vid-bts-01/1080/1920' },
  { filename: 'default-video-thumb.jpg',  url: 'https://picsum.photos/seed/rp-vid-default/1080/1920' },
];

// Short sample MP4 videos from Google's public test video bucket.
// These are open-licensed Blender Foundation films re-encoded for streaming.
// File sizes: ForBiggerJoyrides ~6 MB, ForBiggerMeltdowns ~6 MB,
//             ForBiggerBlazes ~11 MB, ForBiggerEscapes ~11 MB,
//             WeAreGoingOnBullrun ~10 MB.
const VIDEOS = [
  {
    filename: 'food-video-01.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  },
  {
    filename: 'food-video-02.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  },
  {
    filename: 'chef-video-01.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  },
  {
    filename: 'chef-video-02.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
  },
  {
    filename: 'bts-video-01.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
  {
    filename: 'default-video.mp4',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  },
];

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

async function downloadFile(url, destPath) {
  const name = path.basename(destPath);

  if (fs.existsSync(destPath)) {
    console.log(`  ✓ ${name} (already exists, skipping)`);
    return;
  }

  process.stdout.write(`  ↓ ${name} ...`);

  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.promises.writeFile(destPath, Buffer.from(buffer));

  const kb = Math.round(buffer.byteLength / 1024);
  process.stdout.write(` done (${kb} KB)\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\nRestroPulse Content Engine — Download Placeholder Assets\n');

  // Create directories if they don't exist
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  // Images
  console.log('Images:');
  for (const asset of IMAGES) {
    await downloadFile(asset.url, path.join(IMAGES_DIR, asset.filename));
  }

  // Video thumbnails (stored alongside videos)
  console.log('\nVideo thumbnails:');
  for (const thumb of VIDEO_THUMBS) {
    await downloadFile(thumb.url, path.join(VIDEOS_DIR, thumb.filename));
  }

  // Videos
  console.log('\nVideos (may take a moment — files are 6–11 MB each, ~54 MB total):');
  for (const video of VIDEOS) {
    await downloadFile(video.url, path.join(VIDEOS_DIR, video.filename));
  }

  console.log('\nAll assets ready. You can now run: npm run dev\n');
}

main().catch((err) => {
  console.error('\nDownload failed:', err.message);
  process.exit(1);
});
