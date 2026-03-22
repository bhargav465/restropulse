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

// Mock content-generator to throw on demand
vi.mock('../../src/services/content-generator.js', () => ({
  generateContent: vi.fn(),
}));

// Mock @restropulse/db so no real DB connection is needed
vi.mock('@restropulse/db', () => ({
  getPostsCollection: vi.fn(),
}));

import { getPostsCollection } from '@restropulse/db';
import { generateContent } from '../../src/services/content-generator.js';
import { processAdhocRequests } from '../../src/services/adhoc-processor.js';

const mockGetPostsCollection = vi.mocked(getPostsCollection);
const mockGenerateContent = vi.mocked(generateContent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adhoc-processor error paths', () => {
  it('increments failed counter when generateContent throws', async () => {
    const fakePost = {
      _id: { toString: () => 'post-id-1' },
      caption: 'test',
      concept: undefined,
      type: 'IMAGE',
      platforms: ['INSTAGRAM'],
    };

    const mockCollection = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([fakePost]),
        }),
      }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    mockGetPostsCollection.mockReturnValue(mockCollection as never);
    mockGenerateContent.mockRejectedValue(new Error('AI service unavailable'));

    const result = await processAdhocRequests();

    expect(result).toEqual({ processed: 0, failed: 1 });
  });

  it('increments failed counter when updateOne throws', async () => {
    const fakePost = {
      _id: { toString: () => 'post-id-2' },
      caption: 'test',
      concept: undefined,
      type: 'IMAGE',
      platforms: ['INSTAGRAM'],
    };

    const mockCollection = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([fakePost]),
        }),
      }),
      updateOne: vi.fn().mockRejectedValue(new Error('DB write failed')),
    };

    mockGetPostsCollection.mockReturnValue(mockCollection as never);
    mockGenerateContent.mockResolvedValue({
      caption: 'Generated caption',
      thumbnail: 'http://localhost:3002/images/food-01.jpg',
    });

    const result = await processAdhocRequests();

    expect(result).toEqual({ processed: 0, failed: 1 });
  });

  it('processes successes and failures in a mixed batch', async () => {
    const goodPost = {
      _id: { toString: () => 'post-good' },
      type: 'IMAGE',
      platforms: ['INSTAGRAM'],
    };
    const badPost = {
      _id: { toString: () => 'post-bad' },
      type: 'IMAGE',
      platforms: ['INSTAGRAM'],
    };

    const mockCollection = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([goodPost, badPost]),
        }),
      }),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    mockGetPostsCollection.mockReturnValue(mockCollection as never);
    mockGenerateContent
      .mockResolvedValueOnce({
        caption: 'Good caption',
        thumbnail: 'http://localhost:3002/images/food-01.jpg',
      })
      .mockRejectedValueOnce(new Error('fail'));

    const result = await processAdhocRequests();

    expect(result).toEqual({ processed: 1, failed: 1 });
  });
});
