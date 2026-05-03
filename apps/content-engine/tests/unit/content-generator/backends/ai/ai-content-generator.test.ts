import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@restropulse/telemetry/server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  trackAIUsage: vi.fn(),
}));

vi.mock('@restropulse/db', () => ({
  insertCostEvent: vi.fn().mockResolvedValue({ id: 'ce_test' }),
}));

const { AIContentGenerator } = await import(
  '../../../../../src/services/content-generator/backends/ai/ai-content-generator.js'
);
const { RestaurantSpecialization } = await import(
  '../../../../../src/services/content-generator/backends/ai/specialization/index.js'
);
const { ContentGenerationError } = await import(
  '../../../../../src/services/content-generator/types.js'
);

const cycleObject = {
  summary: 'A week of food storytelling',
  plannedPosts: [{ category: 'chef_special', count: 2 }],
  focus: ['Chef Specials'],
};

const captionObject = {
  caption: 'Soft, flaky, ghee-laced parotta straight off the tawa.',
  suggestedHashtags: ['#parotta', '#ghee'],
};

function makeGen() {
  const generateObject = vi.fn().mockImplementation(async (req: any) => {
    if (req.schema._def && req.schema._def.shape && 'plannedPosts' in req.schema._def.shape()) {
      return { object: cycleObject, usage: { inputTokens: 100, outputTokens: 50 }, modelId: 'claude-sonnet-4-6' };
    }
    return { object: captionObject, usage: { inputTokens: 80, outputTokens: 40 }, modelId: 'claude-haiku-4-5-20251001' };
  });
  const generateImage = vi.fn().mockResolvedValue({
    jobId: 'j1', status: 'COMPLETED',
    mediaUrl: 'http://localhost:3002/images/x.jpg',
    thumbnail: 'http://localhost:3002/images/x.jpg',
    metadata: { widthPx: 1080, heightPx: 1080 },
  });
  const generateVideo = vi.fn().mockResolvedValue({
    jobId: 'j2', status: 'COMPLETED',
    mediaUrl: 'http://localhost:3002/videos/x.mp4',
    thumbnail: 'http://localhost:3002/videos/x.jpg',
    metadata: { widthPx: 1080, heightPx: 1920, durationSeconds: 18 },
  });
  return {
    gen: new AIContentGenerator({
      specialization: new RestaurantSpecialization(),
      llm: { name: 'mock', generateObject },
      media: { name: 'mock-media', generateImage, generateVideo, pollJob: vi.fn() },
    }),
    generateObject,
    generateImage,
    generateVideo,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AIContentGenerator (phase 2 complete)', () => {
  it('exposes name "ai" and the configured specialization', () => {
    const { gen } = makeGen();
    expect(gen.name).toBe('ai');
    expect(gen.specialization.domain).toBe('restaurant');
  });

  it('throws when constructed without specialization, llm, or media', () => {
    expect(() => new AIContentGenerator({} as any)).toThrow(ContentGenerationError);
  });

  it('draftCycle returns the cycle from the LLM', async () => {
    const { gen } = makeGen();
    const out = await gen.draftCycle({ period: 'w1' });
    expect(out.summary).toBe(cycleObject.summary);
  });

  it('reviseCycle returns the cycle from the LLM', async () => {
    const { gen } = makeGen();
    const out = await gen.reviseCycle({
      existingCycle: { period: 'w1', summary: 's', plannedPosts: [{ category: 'a', count: 1 }], focus: ['x'] },
      feedback: { areas: ['cta'], note: 'add CTA' },
    });
    expect(out.summary).toBe(cycleObject.summary);
  });

  it('generatePost produces caption + thumbnail for IMAGE', async () => {
    const { gen } = makeGen();
    const out = await gen.generatePost({ concept: 'parotta', type: 'IMAGE', platforms: ['INSTAGRAM'] });
    expect(out.caption).toContain('parotta');
    expect(out.thumbnail).toMatch(/^http:\/\//);
  });

  it('revisePost regenerates caption only when feedback does not request media', async () => {
    const { gen, generateImage } = makeGen();
    await gen.revisePost({
      existingPost: { type: 'IMAGE', platforms: ['INSTAGRAM'], caption: 'old', thumbnail: 'http://existing/t.jpg' },
      feedback: { tags: ['voice'], details: {}, note: 'warmer please' },
    });
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('healthCheck reports ok=true', async () => {
    const { gen } = makeGen();
    const r = await gen.healthCheck!();
    expect(r.ok).toBe(true);
  });
});
