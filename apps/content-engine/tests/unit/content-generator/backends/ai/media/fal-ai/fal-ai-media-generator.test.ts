import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@restropulse/telemetry/server', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  trackAIUsage: vi.fn(),
}));

vi.mock('@restropulse/db', () => ({
  insertCostEvent: vi.fn().mockResolvedValue({ id: 'ce_test' }),
  // FalAIMediaGenerator goes through IMediaJobStore (injected), not these helpers
  // -- but these are mocked for any incidental import paths.
}));

const { FalAIMediaGenerator } = await import(
  '../../../../../../../src/services/content-generator/backends/ai/media/fal-ai/fal-ai-media-generator.js'
);
const { ContentGenerationError } = await import(
  '../../../../../../../src/services/content-generator/types.js'
);

function makeStore(captureInsert: (j: any) => void = () => {}) {
  return {
    insert: vi.fn(async (j: any) => { captureInsert(j); return { ...j, id: 'persisted' }; }),
    findById: vi.fn(async () => null),
    updateStatus: vi.fn(async () => null),
    incrementAttempts: vi.fn(async () => undefined),
  };
}

function makeClient(images = [{ url: 'https://fal.media/x.jpg', width: 1024, height: 1024 }]) {
  return {
    generateImage: vi.fn(async () => ({ images, seed: 1, modelId: 'fal-ai/flux/dev' })),
    editImage: vi.fn(async () => ({ images, seed: 2, modelId: 'fal-ai/flux/dev/image-to-image' })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FalAIMediaGenerator IMAGE happy path', () => {
  it('produces a COMPLETED MediaGenJob with the fal-returned URL', async () => {
    const store = makeStore();
    const client = makeClient();
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });

    const job = await gen.generateImage({
      postType: 'IMAGE',
      platforms: ['INSTAGRAM'],
      concept: 'paneer tikka',
      restaurantId: 'r1',
      postId: 'p1',
    });

    expect(job.status).toBe('COMPLETED');
    expect(job.mediaUrl).toBe('https://fal.media/x.jpg');
    expect(job.metadata?.widthPx).toBe(1024);
    expect(client.generateImage).toHaveBeenCalledTimes(1);
  });

  it('writes a MediaJobRecord with restaurantId/postId/modelId/status=COMPLETED', async () => {
    let captured: any = null;
    const store = makeStore((j) => { captured = j; });
    const client = makeClient();
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });

    await gen.generateImage({
      postType: 'IMAGE',
      platforms: ['INSTAGRAM'],
      concept: 'paneer tikka',
      restaurantId: 'r1',
      postId: 'p1',
      cycleId: 'c1',
    });

    expect(captured).not.toBeNull();
    expect(captured.provider).toBe('fal-ai');
    expect(captured.modelId).toBe('fal-ai/flux/dev');
    expect(captured.status).toBe('COMPLETED');
    expect(captured.restaurantId).toBe('r1');
    expect(captured.postId).toBe('p1');
    expect(captured.cycleId).toBe('c1');
    expect(captured.attempts).toBe(1);
    expect(captured.mediaUrl).toBe('https://fal.media/x.jpg');
  });

  it('writes an LLM cost event tagged surface=image when generation succeeds', async () => {
    const { insertCostEvent } = await import('@restropulse/db');
    (insertCostEvent as any).mockClear();
    const store = makeStore();
    const client = makeClient();
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });

    await gen.generateImage({
      postType: 'IMAGE',
      platforms: ['INSTAGRAM'],
      concept: 'paneer tikka',
      restaurantId: 'r1',
      postId: 'p1',
    });

    expect(insertCostEvent).toHaveBeenCalledTimes(1);
    const event = (insertCostEvent as any).mock.calls[0][0];
    expect(event.surface).toBe('image');
    expect(event.operation).toBe('generatePost');
    expect(event.model).toBe('fal-ai/flux/dev');
    expect(event.restaurantId).toBe('r1');
    expect(event.postId).toBe('p1');
    expect(event.costUsd).toBeGreaterThan(0);
  });

  it('routes baseImageUrl through editImage (img2img) instead of generateImage', async () => {
    const store = makeStore();
    const client = makeClient();
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });

    const job = await gen.generateImage({
      postType: 'IMAGE',
      platforms: ['INSTAGRAM'],
      concept: 'warmer lighting on this dish',
      baseImageUrl: 'https://example.com/uploaded.jpg',
      restaurantId: 'r1',
      postId: 'p1',
    });

    expect(client.generateImage).not.toHaveBeenCalled();
    expect(client.editImage).toHaveBeenCalledTimes(1);
    expect(job.status).toBe('COMPLETED');
  });

  it('STORY post type uses portrait_16_9 image_size', async () => {
    const store = makeStore();
    const client = makeClient();
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });
    await gen.generateImage({
      postType: 'STORY',
      platforms: ['INSTAGRAM'],
      concept: 'kitchen behind the scenes',
    });
    const arg = (client.generateImage as any).mock.calls[0][0];
    expect(arg.imageSize).toBe('portrait_16_9');
  });

  it('CAROUSEL post type generates 3 parallel frames + 3 MediaJobRecords', async () => {
    const insertCalls: any[] = [];
    const store = makeStore((j) => { insertCalls.push(j); });
    const client = makeClient();
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });

    const job = await gen.generateImage({
      postType: 'CAROUSEL',
      platforms: ['INSTAGRAM'],
      concept: 'menu highlights',
      restaurantId: 'r1',
      postId: 'p1',
    });

    expect(client.generateImage).toHaveBeenCalledTimes(3);
    expect(insertCalls).toHaveLength(3);
    expect(job.mediaUrls).toHaveLength(3);
    expect(job.thumbnail).toBe(job.mediaUrls![0]);
    expect(job.status).toBe('COMPLETED');
  });

  it('returns FAILED MediaGenJob when fal.ai returns no images', async () => {
    const store = makeStore();
    const client = { generateImage: vi.fn(async () => ({ images: [], modelId: 'fal-ai/flux/dev' })), editImage: vi.fn() };
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });

    const job = await gen.generateImage({
      postType: 'IMAGE',
      platforms: ['INSTAGRAM'],
      concept: 'x',
    });
    expect(job.status).toBe('FAILED');
    expect(job.error).toMatch(/no images/i);
  });
});

describe('FalAIMediaGenerator REEL/VIDEO throws BACKEND_UNAVAILABLE', () => {
  it('generateVideo throws ContentGenerationError BACKEND_UNAVAILABLE', async () => {
    const store = makeStore();
    const client = makeClient();
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });

    await expect(
      gen.generateVideo({ postType: 'REEL', platforms: ['INSTAGRAM'], concept: 'x' }),
    ).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  });
});

describe('FalAIMediaGenerator pollJob', () => {
  it('returns the latest record from the store', async () => {
    const store = {
      insert: vi.fn(),
      findById: vi.fn(async (id: string) => ({
        id: 'persisted', jobId: id, provider: 'fal-ai', modelId: 'fal-ai/flux/dev',
        postType: 'IMAGE', status: 'COMPLETED', mediaUrl: 'https://fal.media/x.jpg',
        attempts: 1, startedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      })),
      updateStatus: vi.fn(),
      incrementAttempts: vi.fn(),
    };
    const client = makeClient();
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });
    const out = await gen.pollJob('job_xyz');
    expect(out.status).toBe('COMPLETED');
    expect(out.mediaUrl).toBe('https://fal.media/x.jpg');
  });

  it('returns FAILED when the store has no record for jobId (degraded)', async () => {
    const store = makeStore();
    const client = makeClient();
    const gen = new FalAIMediaGenerator({ client: client as any, store: store as any });
    const out = await gen.pollJob('unknown');
    expect(out.status).toBe('FAILED');
    expect(out.error).toMatch(/not found/i);
  });
});
