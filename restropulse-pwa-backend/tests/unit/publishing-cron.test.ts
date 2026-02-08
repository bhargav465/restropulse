import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// -- Mock Setup --

const mockToArray = jest.fn<any>();
const mockSort = jest.fn<any>(() => ({ toArray: mockToArray }));
const mockFind = jest.fn<any>(() => ({ sort: mockSort }));
const mockFindOne = jest.fn<any>();
const mockUpdateOne = jest.fn<any>();
const mockPostsCollection = {
    find: mockFind,
    findOne: mockFindOne,
    updateOne: mockUpdateOne
};

const mockRestFindOne = jest.fn<any>();
const mockRestaurantsCollection = {
    findOne: mockRestFindOne
};

const mockPublishPost = jest.fn<any>();
const mockSchedule = jest.fn<any>();

// Mock modules before importing subject
await jest.unstable_mockModule('../../src/services/publishing-service.js', () => ({
    publishPost: mockPublishPost
}));

await jest.unstable_mockModule('node-cron', () => ({
    default: { schedule: mockSchedule }
}));

// Import actual connection module so we can override collection getters
import { getPostsCollection, getRestaurantsCollection } from '../../src/db/connection.js';

// Import subject
const {
    getPostsDueForPublishing,
    getRestaurantCredentials,
    processPostForPublishing,
    runPublishingJob,
    getRecentPublishAttempts,
    startPublishingCron,
    triggerManualPublish
} = await import('../../src/services/publishing-cron.js');

describe('Publishing Cron Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockToArray.mockResolvedValue([]);
        mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
        // Override the collection getters to return our mocks
        (getPostsCollection as unknown as jest.Mock).mockReturnValue(mockPostsCollection);
        (getRestaurantsCollection as unknown as jest.Mock).mockReturnValue(mockRestaurantsCollection);
    });

    describe('getPostsDueForPublishing', () => {
        test('should query scheduled posts with scheduledFor in the past', async () => {
            mockToArray.mockResolvedValue([{ _id: 'p1', status: 'SCHEDULED' }]);

            const result = await getPostsDueForPublishing();

            expect(getPostsCollection).toHaveBeenCalled();
            expect(mockFind).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'SCHEDULED',
                    scheduledFor: { $lte: expect.any(String) }
                })
            );
            expect(result).toHaveLength(1);
        });

        test('should return empty array when no posts are due', async () => {
            mockToArray.mockResolvedValue([]);

            const result = await getPostsDueForPublishing();

            expect(result).toHaveLength(0);
        });
    });

    describe('getRestaurantCredentials', () => {
        test('should find restaurant with Instagram credentials', async () => {
            const mockRestaurant = {
                _id: 'rest-1',
                instagramCredentials: {
                    userId: 'ig-123',
                    accessToken: 'encrypted-token'
                }
            };
            mockRestFindOne.mockResolvedValue(mockRestaurant);

            const result = await getRestaurantCredentials('rest-1');

            expect(result).toEqual(mockRestaurant);
            expect(mockRestFindOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    _id: 'rest-1',
                    'instagramCredentials.accessToken': { $exists: true, $ne: null }
                })
            );
        });

        test('should return null when restaurant has no credentials', async () => {
            mockRestFindOne.mockResolvedValue(null);

            const result = await getRestaurantCredentials('rest-2');

            expect(result).toBeNull();
        });
    });

    describe('processPostForPublishing', () => {
        const mockPostDoc = {
            _id: 'post-1',
            restaurantId: 'rest-1',
            type: 'IMAGE',
            caption: 'Test post',
            thumbnail: 'https://example.com/img.jpg',
            platform: 'INSTAGRAM',
            publishAttempts: 0
        };

        const mockRestaurant = {
            _id: 'rest-1',
            instagramCredentials: {
                userId: 'ig-123',
                pageId: 'page-456',
                accessToken: 'encrypted-token'
            }
        };

        test('should publish a post successfully', async () => {
            mockRestFindOne.mockResolvedValue(mockRestaurant);
            mockPublishPost.mockResolvedValue({
                instagram: { success: true, instagramMediaId: 'media-999', retryable: false }
            });

            const result = await processPostForPublishing(mockPostDoc);

            expect(result).toBe(true);
            expect(mockPublishPost).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: 'post-1',
                    type: 'IMAGE',
                    caption: 'Test post'
                }),
                expect.objectContaining({
                    userId: 'ig-123',
                    pageId: 'page-456',
                    accessToken: 'encrypted-token'
                })
            );

            // Verify status update to POSTED
            expect(mockUpdateOne).toHaveBeenCalledWith(
                { _id: 'post-1' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        status: 'POSTED',
                        instagramMediaId: 'media-999'
                    })
                })
            );
        });

        test('should fail when post has no restaurantId', async () => {
            const postWithoutRestaurant = { _id: 'post-2', publishAttempts: 0 };

            const result = await processPostForPublishing(postWithoutRestaurant);

            expect(result).toBe(false);
            expect(mockUpdateOne).toHaveBeenCalledWith(
                { _id: 'post-2' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        status: 'MISSED_DEADLINE',
                        publishError: 'No restaurant associated with this post'
                    })
                })
            );
        });

        test('should fail when restaurant has no Instagram credentials', async () => {
            mockRestFindOne.mockResolvedValue(null);

            const result = await processPostForPublishing(mockPostDoc);

            expect(result).toBe(false);
            expect(mockPublishPost).not.toHaveBeenCalled();
        });

        test('should mark as MISSED_DEADLINE after max attempts with no credentials', async () => {
            mockRestFindOne.mockResolvedValue(null);
            const postWithMaxAttempts = { ...mockPostDoc, publishAttempts: 2 };

            const result = await processPostForPublishing(postWithMaxAttempts);

            expect(result).toBe(false);
            expect(mockUpdateOne).toHaveBeenCalledWith(
                { _id: 'post-1' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        status: 'MISSED_DEADLINE'
                    })
                })
            );
        });

        test('should handle retryable publishing failure', async () => {
            mockRestFindOne.mockResolvedValue(mockRestaurant);
            mockPublishPost.mockResolvedValue({
                instagram: { success: false, error: 'Rate limited', retryable: true }
            });

            const result = await processPostForPublishing(mockPostDoc);

            expect(result).toBe(false);

            // Should NOT set status to MISSED_DEADLINE (retryable and not max attempts)
            const updateCall = mockUpdateOne.mock.calls[0] as any[];
            const setOps = updateCall[1].$set;
            expect(setOps.status).toBeUndefined();
            expect(setOps.publishError).toContain('Rate limited');
        });

        test('should mark as MISSED_DEADLINE on non-retryable failure', async () => {
            mockRestFindOne.mockResolvedValue(mockRestaurant);
            mockPublishPost.mockResolvedValue({
                instagram: { success: false, error: 'Invalid media', retryable: false }
            });

            const result = await processPostForPublishing(mockPostDoc);

            expect(result).toBe(false);
            expect(mockUpdateOne).toHaveBeenCalledWith(
                { _id: 'post-1' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        status: 'MISSED_DEADLINE'
                    })
                })
            );
        });

        test('should mark as MISSED_DEADLINE when max retries reached even if retryable', async () => {
            mockRestFindOne.mockResolvedValue(mockRestaurant);
            mockPublishPost.mockResolvedValue({
                instagram: { success: false, error: 'Rate limited', retryable: true }
            });

            const postAtMaxRetry = { ...mockPostDoc, publishAttempts: 2 };
            const result = await processPostForPublishing(postAtMaxRetry);

            expect(result).toBe(false);
            expect(mockUpdateOne).toHaveBeenCalledWith(
                { _id: 'post-1' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        status: 'MISSED_DEADLINE'
                    })
                })
            );
        });
    });

    describe('runPublishingJob', () => {
        test('should return zero stats when no posts are due', async () => {
            mockToArray.mockResolvedValue([]);

            const stats = await runPublishingJob();

            expect(stats).toEqual({ published: 0, failed: 0, skipped: 0 });
        });

        test('should process multiple posts', async () => {
            jest.useFakeTimers();

            const posts = [
                {
                    _id: 'p1',
                    restaurantId: 'r1',
                    type: 'IMAGE',
                    caption: 'Post 1',
                    thumbnail: 'https://example.com/1.jpg',
                    platform: 'INSTAGRAM',
                    publishAttempts: 0
                },
                {
                    _id: 'p2',
                    restaurantId: 'r1',
                    type: 'IMAGE',
                    caption: 'Post 2',
                    thumbnail: 'https://example.com/2.jpg',
                    platform: 'INSTAGRAM',
                    publishAttempts: 0
                }
            ];

            mockToArray.mockResolvedValue(posts);
            mockRestFindOne.mockResolvedValue({
                _id: 'r1',
                instagramCredentials: {
                    userId: 'ig-123',
                    pageId: 'page-456',
                    accessToken: 'enc-token'
                }
            });

            // First post succeeds, second fails (non-retryable)
            mockPublishPost
                .mockResolvedValueOnce({ instagram: { success: true, instagramMediaId: 'media-1', retryable: false } })
                .mockResolvedValueOnce({ instagram: { success: false, error: 'Failed', retryable: false } });

            const resultPromise = runPublishingJob();

            // Advance past the 2-second rate-limit delays between posts
            await jest.advanceTimersByTimeAsync(4000);

            const stats = await resultPromise;

            expect(stats.published).toBe(1);
            expect(stats.failed).toBe(1);

            jest.useRealTimers();
        });
    });

    describe('startPublishingCron', () => {
        test('should schedule cron job every 5 minutes', () => {
            startPublishingCron();

            expect(mockSchedule).toHaveBeenCalledWith(
                '*/5 * * * *',
                expect.any(Function),
                expect.objectContaining({ timezone: 'Asia/Kolkata' })
            );
        });
    });

    describe('getRecentPublishAttempts', () => {
        test('should return an array (initially empty)', () => {
            const attempts = getRecentPublishAttempts();
            expect(Array.isArray(attempts)).toBe(true);
        });
    });

    describe('triggerManualPublish', () => {
        test('should call runPublishingJob and return stats', async () => {
            mockToArray.mockResolvedValue([]);

            const stats = await triggerManualPublish();

            expect(stats).toEqual({ published: 0, failed: 0, skipped: 0 });
        });
    });
});
