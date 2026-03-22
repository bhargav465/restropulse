import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock telemetry
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
  return { createLogger: vi.fn(() => noopLogger) };
});

// Mock content-generator so cycles do not require real assets
vi.mock('../../src/services/content-generator.js', () => ({
  generateContent: vi.fn(),
  generateCycleContent: vi.fn(),
}));

// Mock @restropulse/db so no real DB connection is needed
vi.mock('@restropulse/db', () => ({
  getPostsCollection: vi.fn(),
  getStrategyCyclesCollection: vi.fn(),
  getContentStrategiesCollection: vi.fn(),
  findRestaurantById: vi.fn(),
}));

import {
  getPostsCollection,
  getStrategyCyclesCollection,
  getContentStrategiesCollection,
  findRestaurantById,
} from '@restropulse/db';
import { generateCycleContent } from '../../src/services/content-generator.js';
import { processApprovedCycles, processStrategyRequests } from '../../src/services/strategy-processor.js';

const mockGetPostsCollection = vi.mocked(getPostsCollection);
const mockGetStrategyCyclesCollection = vi.mocked(getStrategyCyclesCollection);
const mockGetContentStrategiesCollection = vi.mocked(getContentStrategiesCollection);
const mockFindRestaurantById = vi.mocked(findRestaurantById);
const mockGenerateCycleContent = vi.mocked(generateCycleContent);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// processApprovedCycles error paths
// ---------------------------------------------------------------------------
describe('processApprovedCycles error paths', () => {
  it('increments failed counter when generateCycleContent throws', async () => {
    const fakeId = { toString: () => 'cycle-1' };
    const fakeCycle = {
      _id: fakeId,
      restaurantId: null,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-08T00:00:00.000Z',
      focus: ['Food & Menu'],
    };

    const mockCyclesCol = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([fakeCycle]),
      }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const mockStrategiesCol = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    const mockPostsCol = {
      insertOne: vi.fn().mockResolvedValue({ insertedId: 'p1' }),
    };

    mockGetStrategyCyclesCollection.mockReturnValue(mockCyclesCol as never);
    mockGetContentStrategiesCollection.mockReturnValue(mockStrategiesCol as never);
    mockGetPostsCollection.mockReturnValue(mockPostsCol as never);
    mockFindRestaurantById.mockResolvedValue(null);
    mockGenerateCycleContent.mockRejectedValue(new Error('AI service down'));

    const result = await processApprovedCycles();

    expect(result).toEqual({ processed: 0, failed: 1 });
  });

  it('increments failed counter when cyclesCol.updateOne throws after successful content generation', async () => {
    const fakeId = { toString: () => 'cycle-2' };
    const fakeCycle = {
      _id: fakeId,
      restaurantId: null,
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-08T00:00:00.000Z',
      focus: ['Offers'],
    };

    const mockCyclesCol = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([fakeCycle]),
      }),
      updateOne: vi.fn().mockRejectedValue(new Error('DB write failed')),
    };
    const mockStrategiesCol = {
      findOne: vi.fn().mockResolvedValue({ postsPerWeek: 1, bestTime: '10:00' }),
    };
    const mockPostsCol = {
      insertOne: vi.fn().mockResolvedValue({ insertedId: 'p1' }),
    };

    mockGetStrategyCyclesCollection.mockReturnValue(mockCyclesCol as never);
    mockGetContentStrategiesCollection.mockReturnValue(mockStrategiesCol as never);
    mockGetPostsCollection.mockReturnValue(mockPostsCol as never);
    mockFindRestaurantById.mockResolvedValue(null);
    mockGenerateCycleContent.mockResolvedValue([
      { caption: 'A caption', thumbnail: 'http://localhost:3002/images/food-01.jpg' },
    ]);

    const result = await processApprovedCycles();

    expect(result).toEqual({ processed: 0, failed: 1 });
  });
});

// ---------------------------------------------------------------------------
// processStrategyRequests error paths
// ---------------------------------------------------------------------------
describe('processStrategyRequests error paths', () => {
  it('increments failed counter when cyclesCol.updateOne throws', async () => {
    const fakeId = { toString: () => 'cycle-s1' };
    const fakeCycle = {
      _id: fakeId,
      period: 'March 2026',
    };

    const mockCyclesCol = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([fakeCycle]),
      }),
      updateOne: vi.fn().mockRejectedValue(new Error('DB write failed')),
    };

    mockGetStrategyCyclesCollection.mockReturnValue(mockCyclesCol as never);

    const result = await processStrategyRequests();

    expect(result).toEqual({ processed: 0, failed: 1 });
  });

  it('processes successes and failures in a mixed batch', async () => {
    const goodCycle = { _id: { toString: () => 'cycle-ok' }, period: 'April 2026' };
    const badCycle = { _id: { toString: () => 'cycle-fail' }, period: 'May 2026' };

    const mockCyclesCol = {
      find: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([goodCycle, badCycle]),
      }),
      updateOne: vi.fn()
        .mockResolvedValueOnce({ modifiedCount: 1 })
        .mockRejectedValueOnce(new Error('DB error')),
    };

    mockGetStrategyCyclesCollection.mockReturnValue(mockCyclesCol as never);

    const result = await processStrategyRequests();

    expect(result).toEqual({ processed: 1, failed: 1 });
  });
});
