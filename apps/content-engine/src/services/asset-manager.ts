/**
 * Asset Manager
 *
 * Selects placeholder assets from the local media catalog and constructs
 * full HTTP URLs using ASSET_SERVER_BASE_URL. Provides theme-aware random
 * selection with graceful fallback when no themed asset exists.
 *
 * All functions are pure (no side effects) and testable without a running server.
 */

import {
  IMAGE_ASSETS,
  CAROUSEL_SETS,
  VIDEO_ASSETS,
  CAPTION_TEMPLATES,
  type ImageAsset,
  type VideoAsset,
  type CarouselSet,
} from '../assets/media-catalog.js';

// Base URL for the local asset HTTP server — override via environment variable
// to point at a CDN or staging server in other environments.
const BASE_URL = (process.env.ASSET_SERVER_BASE_URL ?? 'http://localhost:3002').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function filterByTheme<T extends { theme: string }>(arr: T[], theme?: string): T[] {
  if (!theme) return arr;
  const matches = arr.filter((a) => a.theme === theme);
  return matches.length > 0 ? matches : arr;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SelectedImage {
  url: string;
  asset: ImageAsset;
}

export interface SelectedVideo {
  videoUrl: string;
  thumbnail: string;
  asset: VideoAsset;
}

export interface SelectedCarousel {
  urls: string[];
  set: CarouselSet;
}

/** Pick a random image, preferring the given theme. Falls back to any image. */
export function getRandomImage(theme?: string): SelectedImage {
  const asset = pickRandom(filterByTheme(IMAGE_ASSETS, theme));
  return {
    url: `${BASE_URL}/images/${asset.filename}`,
    asset,
  };
}

/** Pick a random carousel set, preferring the given theme. Returns array of image URLs. */
export function getRandomCarousel(theme?: string): SelectedCarousel {
  const set = pickRandom(filterByTheme(CAROUSEL_SETS, theme));
  return {
    urls: set.filenames.map((f) => `${BASE_URL}/images/${f}`),
    set,
  };
}

/** Pick a random video, preferring the given theme. Returns video + thumbnail URLs. */
export function getRandomVideo(theme?: string): SelectedVideo {
  const asset = pickRandom(filterByTheme(VIDEO_ASSETS, theme));
  return {
    videoUrl:  `${BASE_URL}/videos/${asset.videoFilename}`,
    thumbnail: `${BASE_URL}/videos/${asset.thumbnailFilename}`,
    asset,
  };
}

/**
 * Build a themed caption by picking a random template for the theme,
 * then substituting {restaurant} and {concept} placeholders.
 */
export function buildCaption(concept: string, theme: string, restaurantName?: string): string {
  const templates = CAPTION_TEMPLATES[theme] ?? CAPTION_TEMPLATES['default'];
  const template = pickRandom(templates);
  return template
    .replace('{restaurant}', restaurantName ?? 'our restaurant')
    .replace('{concept}', concept || theme);
}
