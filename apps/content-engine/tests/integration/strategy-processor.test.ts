import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import { setDB } from '@restropulse/db';

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

// Set ASSET_SERVER_BASE_URL before content-generator loads asset-manager
process.env['ASSET_SERVER_BASE_URL'] = 'http://localhost:3002';

const { processApprovedCycles, processStrategyRequests } = await import(
  '../../src/services/strategy-processor.js'
);

let mongod: MongoMemoryServer;
let client: MongoClient;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await MongoClient.connect(mongod.getUri());
  setDB(client.db('strategy-processor-test'));
}, 60000);

afterAll(async () => {
  await client.close();
  await mongod.stop();
}, 20000);

beforeEach(async () => {
  vi.clearAllMocks();
  const db = client.db('strategy-processor-test');
  await db.collection('posts').deleteMany({});
  await db.collection('strategyCycles').deleteMany({});
  await db.collection('contentStrategies').deleteMany({});
  await db.collection('restaurants').deleteMany({});
});

// ---------------------------------------------------------------------------
// processApprovedCycles
// ---------------------------------------------------------------------------
describe('processApprovedCycles()', () => {
  it('returns { processed: 0, failed: 0 } when no APPROVED cycles exist', async () => {
    const result = await processApprovedCycles();
    expect(result).toEqual({ processed: 0, failed: 0 });
  });

  it('skips cycles that are APPROVED but already have contentGenerated = true', async () => {
    const db = client.db('strategy-processor-test');
    await db.collection('strategyCycles').insertOne({
      _id: new ObjectId(),
      status: 'APPROVED',
      contentGenerated: true,
      restaurantId: 'r1',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-08T00:00:00.000Z',
      focus: ['Food & Menu'],
      period: 'March 2026',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processApprovedCycles();
    expect(result).toEqual({ processed: 0, failed: 0 });
  });

  it('generates posts for an APPROVED cycle and sets contentGenerated to true', async () => {
    const db = client.db('strategy-processor-test');
    const cycleId = new ObjectId();
    await db.collection('strategyCycles').insertOne({
      _id: cycleId,
      status: 'APPROVED',
      contentGenerated: false,
      restaurantId: null,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-08T00:00:00.000Z',
      focus: ['Food & Menu', 'Offers'],
      period: 'March 2026',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processApprovedCycles();
    expect(result).toEqual({ processed: 1, failed: 0 });

    // The cycle should now be marked as content generated and active
    const updatedCycle = await db.collection('strategyCycles').findOne({ _id: cycleId });
    expect(updatedCycle?.contentGenerated).toBe(true);
    expect(updatedCycle?.status).toBe('ACTIVE');

    // Posts should have been created
    const posts = await db.collection('posts').find({ strategyId: cycleId.toString() }).toArray();
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect(post.status).toBe('PENDING_APPROVAL');
      expect(typeof post.caption).toBe('string');
      expect(typeof post.thumbnail).toBe('string');
    }
  });

  it('uses postsPerWeek from the contentStrategy when available', async () => {
    const db = client.db('strategy-processor-test');
    const restaurantId = 'r-strategy-test';
    const cycleId = new ObjectId();

    await db.collection('contentStrategies').insertOne({
      _id: new ObjectId(),
      restaurantId,
      postsPerWeek: 7,
      bestTime: '09:00',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('strategyCycles').insertOne({
      _id: cycleId,
      status: 'APPROVED',
      contentGenerated: false,
      restaurantId,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-08T00:00:00.000Z',
      focus: ['Chef Specials'],
      period: 'March 2026',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processApprovedCycles();
    expect(result.processed).toBe(1);

    const posts = await db.collection('posts').find({ strategyId: cycleId.toString() }).toArray();
    // 1 week at 7 posts/week => 7 posts
    expect(posts).toHaveLength(7);
  });

  it('falls back to default 3 postsPerWeek when no strategy document exists', async () => {
    const db = client.db('strategy-processor-test');
    const cycleId = new ObjectId();

    await db.collection('strategyCycles').insertOne({
      _id: cycleId,
      status: 'APPROVED',
      contentGenerated: false,
      restaurantId: 'r-no-strategy',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-08T00:00:00.000Z',
      focus: ['Offers'],
      period: 'March 2026',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processApprovedCycles();
    expect(result.processed).toBe(1);

    const posts = await db.collection('posts').find({ strategyId: cycleId.toString() }).toArray();
    // 1 week at default 3 posts/week => 3 posts
    expect(posts).toHaveLength(3);
  });

  it('uses restaurant name in post captions when restaurant exists', async () => {
    const db = client.db('strategy-processor-test');
    const restaurantId = 'r-named';
    const cycleId = new ObjectId();

    await db.collection('restaurants').insertOne({
      _id: restaurantId,
      name: 'Casa Bella',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('strategyCycles').insertOne({
      _id: cycleId,
      status: 'APPROVED',
      contentGenerated: false,
      restaurantId,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-08T00:00:00.000Z',
      focus: ['Food & Menu'],
      period: 'March 2026',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processApprovedCycles();
    expect(result.processed).toBe(1);

    const posts = await db.collection('posts').find({ strategyId: cycleId.toString() }).toArray();
    expect(posts.length).toBeGreaterThan(0);
    const withRestaurantName = posts.filter((p) => p.caption.includes('Casa Bella'));
    expect(withRestaurantName.length).toBeGreaterThan(0);
  });

  it('handles cycles with invalid dates by using fallback dates', async () => {
    const db = client.db('strategy-processor-test');
    const cycleId = new ObjectId();

    await db.collection('strategyCycles').insertOne({
      _id: cycleId,
      status: 'APPROVED',
      contentGenerated: false,
      restaurantId: null,
      startDate: 'not-a-date',
      endDate: 'also-not-a-date',
      focus: ['default'],
      period: 'March 2026',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Should not throw -- should use fallback dates
    const result = await processApprovedCycles();
    expect(result.processed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// processStrategyRequests
// ---------------------------------------------------------------------------
describe('processStrategyRequests()', () => {
  it('returns { processed: 0, failed: 0 } when no PENDING_GENERATION cycles exist', async () => {
    const result = await processStrategyRequests();
    expect(result).toEqual({ processed: 0, failed: 0 });
  });

  it('does not process cycles that are not PENDING_GENERATION', async () => {
    const db = client.db('strategy-processor-test');
    await db.collection('strategyCycles').insertOne({
      _id: new ObjectId(),
      status: 'PENDING_APPROVAL',
      restaurantId: 'r1',
      period: 'April 2026',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processStrategyRequests();
    expect(result).toEqual({ processed: 0, failed: 0 });
  });

  it('processes a PENDING_GENERATION cycle and sets status to PENDING_APPROVAL', async () => {
    const db = client.db('strategy-processor-test');
    const cycleId = new ObjectId();

    await db.collection('strategyCycles').insertOne({
      _id: cycleId,
      status: 'PENDING_GENERATION',
      restaurantId: 'r1',
      period: 'April 2026',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await processStrategyRequests();
    expect(result).toEqual({ processed: 1, failed: 0 });

    const updatedCycle = await db.collection('strategyCycles').findOne({ _id: cycleId });
    expect(updatedCycle?.status).toBe('PENDING_APPROVAL');
    expect(typeof updatedCycle?.summary).toBe('string');
    expect(Array.isArray(updatedCycle?.focus)).toBe(true);
    expect(Array.isArray(updatedCycle?.plannedPosts)).toBe(true);
  });

  it('sets summary to include the cycle period', async () => {
    const db = client.db('strategy-processor-test');
    const cycleId = new ObjectId();

    await db.collection('strategyCycles').insertOne({
      _id: cycleId,
      status: 'PENDING_GENERATION',
      restaurantId: 'r1',
      period: 'May 2026',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await processStrategyRequests();

    const updatedCycle = await db.collection('strategyCycles').findOne({ _id: cycleId });
    expect(updatedCycle?.summary).toContain('May 2026');
  });

  it('processes multiple PENDING_GENERATION cycles in a single call', async () => {
    const db = client.db('strategy-processor-test');
    await db.collection('strategyCycles').insertMany([
      {
        _id: new ObjectId(),
        status: 'PENDING_GENERATION',
        restaurantId: 'r1',
        period: 'April 2026',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: new ObjectId(),
        status: 'PENDING_GENERATION',
        restaurantId: 'r2',
        period: 'May 2026',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await processStrategyRequests();
    expect(result).toEqual({ processed: 2, failed: 0 });
  });
});
