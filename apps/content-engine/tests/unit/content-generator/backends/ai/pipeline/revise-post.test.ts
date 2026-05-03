import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@restropulse/telemetry/server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  trackAIUsage: vi.fn(),
}));

vi.mock('@restropulse/db', () => ({
  insertCostEvent: vi.fn().mockResolvedValue({ id: 'ce_test' }),
}));

const { runRevisePost } = await import(
  '../../../../../../src/services/content-generator/backends/ai/pipeline/revise-post.js'
);
const { RestaurantSpecialization } = await import(
  '../../../../../../src/services/content-generator/backends/ai/specialization/index.js'
);

beforeEach(() => {
  vi.clearAllMocks();
});

const baseInput = {
  existingPost: {
    type: 'IMAGE' as const,
    platforms: ['INSTAGRAM' as const],
    caption: 'Old caption with #fewhashtags',
    thumbnail: 'http://localhost/old.jpg',
  },
  feedback: {
    tags: ['caption', 'voice'],
    details: { voice: 'too formal' },
    note: 'Make it warmer and more inviting.',
  },
};

function makeDeps() {
  const generateObject = vi.fn().mockResolvedValue({
    object: {
      caption: 'A warmer, friendlier hello from our kitchen.',
      suggestedHashtags: ['#warm', '#kitchen'],
    },
    usage: { inputTokens: 100, outputTokens: 60 },
    modelId: 'claude-haiku-4-5-20251001',
  });
  const generateImage = vi.fn().mockResolvedValue({
    jobId: 'jr_img_1',
    status: 'COMPLETED',
    mediaUrl: 'http://localhost:3002/images/new.jpg',
    thumbnail: 'http://localhost:3002/images/new.jpg',
    metadata: { widthPx: 1080, heightPx: 1080 },
  });
  return {
    llm: { name: 'mock-llm', generateObject },
    media: { name: 'mock-media', generateImage, generateVideo: vi.fn(), pollJob: vi.fn() },
    specialization: new RestaurantSpecialization(),
  };
}

describe('runRevisePost', () => {
  it('returns a revised caption (LLM output) preserving the existing thumbnail when feedback does NOT request media changes', async () => {
    const deps = makeDeps();
    const out = await runRevisePost(baseInput, deps, { restaurantId: 'r1' });
    expect(out.caption).toContain('warmer');
    expect(out.thumbnail).toBe('http://localhost/old.jpg');  // existing thumbnail preserved
    expect((deps.media.generateImage as any)).not.toHaveBeenCalled();
  });

  it('regenerates media when feedback.tags includes "media" or "image"', async () => {
    const deps = makeDeps();
    const inputWithMediaFeedback = {
      ...baseInput,
      feedback: { tags: ['image'], details: {}, note: 'Try a different shot' },
    };
    const out = await runRevisePost(inputWithMediaFeedback, deps, {});
    expect((deps.media.generateImage as any)).toHaveBeenCalledTimes(1);
    expect(out.thumbnail).toBe('http://localhost:3002/images/new.jpg');
  });

  it('passes the existing caption + feedback into the LLM prompt', async () => {
    const deps = makeDeps();
    await runRevisePost(baseInput, deps, {});
    const arg = (deps.llm.generateObject as any).mock.calls[0][0];
    expect(arg.prompt).toContain('Old caption with #fewhashtags');
    expect(arg.prompt).toContain('too formal');
    expect(arg.prompt).toContain('Make it warmer and more inviting');
  });

  it('writes a cost event with operation=revisePost', async () => {
    const { insertCostEvent } = await import('@restropulse/db');
    (insertCostEvent as any).mockClear();
    const deps = makeDeps();
    await runRevisePost(baseInput, deps, { restaurantId: 'r1' });
    const llmEvent = (insertCostEvent as any).mock.calls.find((c: any) => c[0].surface === 'llm');
    expect(llmEvent).toBeDefined();
    expect(llmEvent[0].operation).toBe('revisePost');
  });
});
