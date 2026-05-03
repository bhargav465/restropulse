import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@restropulse/telemetry/server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  trackAIUsage: vi.fn(),
}));

vi.mock('@restropulse/db', () => ({
  insertCostEvent: vi.fn().mockResolvedValue({ id: 'ce_test' }),
}));

const { runGeneratePost } = await import(
  '../../../../../../src/services/content-generator/backends/ai/pipeline/generate-post.js'
);
const { RestaurantSpecialization } = await import(
  '../../../../../../src/services/content-generator/backends/ai/specialization/index.js'
);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeDeps(captionOverrides: Partial<{ caption: string; suggestedHashtags: string[] }> = {}) {
  const generateObject = vi.fn().mockResolvedValue({
    object: {
      caption: captionOverrides.caption ?? 'Soft, flaky, ghee-laced parotta straight off the tawa.',
      suggestedHashtags: captionOverrides.suggestedHashtags ?? ['#parotta', '#ghee'],
      archetype: 'CHEFS_PICK',
    },
    usage: { inputTokens: 80, outputTokens: 40 },
    modelId: 'claude-haiku-4-5-20251001',
  });
  const generateImage = vi.fn().mockResolvedValue({
    jobId: 'job_img_1',
    status: 'COMPLETED',
    mediaUrl: 'http://localhost:3002/images/x.jpg',
    thumbnail: 'http://localhost:3002/images/x.jpg',
    metadata: { widthPx: 1080, heightPx: 1080 },
  });
  const generateVideo = vi.fn().mockResolvedValue({
    jobId: 'job_vid_1',
    status: 'COMPLETED',
    mediaUrl: 'http://localhost:3002/videos/x.mp4',
    thumbnail: 'http://localhost:3002/videos/x.jpg',
    metadata: { widthPx: 1080, heightPx: 1920, durationSeconds: 18 },
  });
  return {
    llm: { name: 'mock-llm', generateObject },
    media: { name: 'mock-media', generateImage, generateVideo, pollJob: vi.fn() },
    specialization: new RestaurantSpecialization(),
  };
}

describe('runGeneratePost', () => {
  it('produces caption + thumbnail for an IMAGE post', async () => {
    const deps = makeDeps();
    const out = await runGeneratePost(
      { concept: 'parotta', type: 'IMAGE', platforms: ['INSTAGRAM'] },
      deps,
      { restaurantId: 'r1', restaurantName: 'Spice Route', locale: 'en-IN' },
    );
    expect(out.caption).toContain('parotta');
    expect(out.thumbnail).toMatch(/^http:\/\//);
    expect(out.videoUrl).toBeUndefined();
  });

  it('routes REEL post type through generateVideo', async () => {
    const deps = makeDeps();
    await runGeneratePost(
      { concept: 'kitchen reel', type: 'REEL', platforms: ['INSTAGRAM'] },
      deps,
      {},
    );
    expect((deps.media.generateVideo as any)).toHaveBeenCalledTimes(1);
    expect((deps.media.generateImage as any)).not.toHaveBeenCalled();
  });

  it('routes CAROUSEL through generateImage with postType=CAROUSEL', async () => {
    const deps = makeDeps();
    (deps.media.generateImage as any).mockResolvedValueOnce({
      jobId: 'j_c1',
      status: 'COMPLETED',
      mediaUrls: ['http://localhost/a.jpg', 'http://localhost/b.jpg', 'http://localhost/c.jpg'],
      thumbnail: 'http://localhost/a.jpg',
      metadata: { widthPx: 1080, heightPx: 1080 },
    });
    const out = await runGeneratePost(
      { concept: 'menu', type: 'CAROUSEL', platforms: ['INSTAGRAM'] },
      deps,
      {},
    );
    expect((deps.media.generateImage as any).mock.calls[0][0].postType).toBe('CAROUSEL');
    expect(out.mediaUrls).toHaveLength(3);
    expect(out.thumbnail).toBe(out.mediaUrls![0]);
  });

  it('caption ends with hashtags merged from LLM + specialization, deduped, denylist applied', async () => {
    const deps = makeDeps({
      suggestedHashtags: ['#parotta', '#like4like', '#ghee'],  // like4like is on the denylist
    });
    const out = await runGeneratePost(
      { concept: 'parotta', type: 'IMAGE', platforms: ['INSTAGRAM'] },
      deps,
      { restaurantId: 'r1', locale: 'en-IN' },
    );
    expect(out.caption).not.toMatch(/like4like/i);
    // At least one hashtag from the model input survives:
    expect(out.caption).toMatch(/#parotta|#ghee/);
  });

  it('writes two cost events: one llm, one image', async () => {
    const { insertCostEvent } = await import('@restropulse/db');
    (insertCostEvent as any).mockClear();
    const deps = makeDeps();
    await runGeneratePost({ concept: 'x', type: 'IMAGE', platforms: ['INSTAGRAM'] }, deps, { restaurantId: 'r1' });
    expect(insertCostEvent).toHaveBeenCalledTimes(2);
    const surfaces = (insertCostEvent as any).mock.calls.map((c: any) => c[0].surface);
    expect(surfaces).toContain('llm');
    expect(surfaces).toContain('image');
  });

  it('throws ContentGenerationError on missing concept and type', async () => {
    const deps = makeDeps();
    await expect(
      runGeneratePost({ concept: '', type: 'IMAGE', platforms: ['INSTAGRAM'] }, deps, {}),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
