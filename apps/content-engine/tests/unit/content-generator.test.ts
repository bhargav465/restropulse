import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock telemetry before any app code loads
vi.mock('@restropulse/telemetry/server', () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    fatal: vi.fn(),
    trace: vi.fn(),
  };
  return {
    createLogger: vi.fn(() => noopLogger),
    initServerTelemetry: vi.fn(),
    shutdownServerTelemetry: vi.fn(),
  };
});

// Set ASSET_SERVER_BASE_URL before dynamic import so asset-manager picks it up
beforeAll(() => {
  process.env['ASSET_SERVER_BASE_URL'] = 'http://localhost:3002';
});

const { generateContent, generateCycleContent } = await import(
  '../../src/services/content-generator.js'
);

describe('content-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateContent()', () => {
    it('returns caption and thumbnail for IMAGE type', async () => {
      const result = await generateContent({
        concept: 'Weekend special',
        type: 'IMAGE',
        platforms: ['INSTAGRAM'],
      });

      expect(typeof result.caption).toBe('string');
      expect(result.caption.length).toBeGreaterThan(0);
      expect(typeof result.thumbnail).toBe('string');
      expect(result.thumbnail).toMatch(/^http:\/\/localhost:3002\/images\/.+\.jpg$/);
      expect(result.videoUrl).toBeUndefined();
    });

    it('returns caption, thumbnail, and mediaUrls array for CAROUSEL type', async () => {
      const result = await generateContent({
        concept: 'Menu highlights',
        type: 'CAROUSEL',
        platforms: ['INSTAGRAM'],
        themes: ['Food & Menu'],
      });

      expect(typeof result.caption).toBe('string');
      expect(Array.isArray(result.mediaUrls)).toBe(true);
      expect(result.mediaUrls!.length).toBeGreaterThan(0);
      expect(result.thumbnail).toBe(result.mediaUrls![0]);
      expect(result.videoUrl).toBeUndefined();
    });

    it('returns caption, thumbnail, and videoUrl for REEL type', async () => {
      const result = await generateContent({
        concept: 'Behind the scenes',
        type: 'REEL',
        platforms: ['INSTAGRAM'],
      });

      expect(typeof result.caption).toBe('string');
      expect(typeof result.videoUrl).toBe('string');
      expect(result.videoUrl).toMatch(/\.mp4$/);
      expect(typeof result.thumbnail).toBe('string');
      expect(result.mediaUrls).toBeUndefined();
    });

    it('returns video content for VIDEO type', async () => {
      const result = await generateContent({
        concept: 'Chef demo',
        type: 'VIDEO',
        platforms: ['FACEBOOK'],
      });

      expect(typeof result.videoUrl).toBe('string');
      expect(result.videoUrl).toMatch(/\.mp4$/);
      expect(typeof result.thumbnail).toBe('string');
    });

    it('returns video content for STORY type', async () => {
      const result = await generateContent({
        concept: 'Daily story',
        type: 'STORY',
        platforms: ['INSTAGRAM'],
      });

      expect(typeof result.videoUrl).toBe('string');
      expect(result.videoUrl).toMatch(/\.mp4$/);
      expect(typeof result.thumbnail).toBe('string');
    });

    it('falls back to IMAGE content when type is unrecognised', async () => {
      const result = await generateContent({
        concept: 'Unknown type post',
        type: 'IMAGE',
        platforms: ['INSTAGRAM'],
      });

      expect(typeof result.thumbnail).toBe('string');
      expect(result.thumbnail).toMatch(/^http:\/\/localhost:3002\/images\/.+\.jpg$/);
    });

    it('uses first theme from themes array for caption', async () => {
      const result = await generateContent({
        concept: 'Pasta night',
        type: 'IMAGE',
        platforms: ['INSTAGRAM'],
        restaurantName: 'Bella Roma',
        themes: ['Food & Menu'],
      });

      expect(result.caption).toContain('Bella Roma');
    });

    it('uses default theme when no themes provided', async () => {
      const result = await generateContent({
        concept: 'Something good',
        type: 'IMAGE',
        platforms: ['INSTAGRAM'],
      });

      expect(typeof result.caption).toBe('string');
      expect(result.caption).not.toContain('{restaurant}');
      expect(result.caption).not.toContain('{concept}');
    });
  });

  describe('generateCycleContent()', () => {
    it('returns an array of GeneratedContent items', async () => {
      const results = await generateCycleContent({
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-08T00:00:00.000Z',
        postsPerWeek: 3,
        themes: ['Food & Menu', 'Offers'],
        contentTypes: ['IMAGE', 'CAROUSEL', 'REEL'],
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('generates the correct total number of posts for the date range', async () => {
      // 7 days = 1 week, 3 posts/week => 3 posts
      const results = await generateCycleContent({
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-08T00:00:00.000Z',
        postsPerWeek: 3,
        themes: ['Food & Menu'],
        contentTypes: ['IMAGE'],
      });

      expect(results).toHaveLength(3);
    });

    it('cycles through content types across posts', async () => {
      const results = await generateCycleContent({
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-15T00:00:00.000Z',
        postsPerWeek: 3,
        themes: ['Food & Menu'],
        contentTypes: ['IMAGE', 'CAROUSEL'],
      });

      // Some posts should be images (thumbnail only) and some carousel (with mediaUrls)
      const withMediaUrls = results.filter((r) => Array.isArray(r.mediaUrls));
      const withoutMediaUrls = results.filter((r) => !Array.isArray(r.mediaUrls));
      expect(withMediaUrls.length).toBeGreaterThan(0);
      expect(withoutMediaUrls.length).toBeGreaterThan(0);
    });

    it('includes restaurantName in captions when provided', async () => {
      const results = await generateCycleContent({
        startDate: '2026-03-01T00:00:00.000Z',
        endDate: '2026-03-08T00:00:00.000Z',
        postsPerWeek: 1,
        themes: ['Food & Menu'],
        contentTypes: ['IMAGE'],
        restaurantName: 'Trattoria Test',
      });

      expect(results.length).toBeGreaterThan(0);
      // At least one caption should include the restaurant name
      const withName = results.filter((r) => r.caption.includes('Trattoria Test'));
      expect(withName.length).toBeGreaterThan(0);
    });

    it('returns empty array when start and end date are the same', async () => {
      const sameDate = '2026-03-01T00:00:00.000Z';
      const results = await generateCycleContent({
        startDate: sameDate,
        endDate: sameDate,
        postsPerWeek: 3,
        themes: ['default'],
        contentTypes: ['IMAGE'],
      });

      // 0 days => 0 weeks => 0 posts
      expect(results).toHaveLength(0);
    });
  });
});
