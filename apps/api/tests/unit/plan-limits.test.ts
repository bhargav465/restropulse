import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Define Mocks
const mockFindActiveSubscription = vi.fn();
const mockGetWeeklyPostCounts = vi.fn();
const mockDeductCredits = vi.fn();
const mockCreatePost = vi.fn();
const mockFindAllPosts = vi.fn();
const mockFindPostById = vi.fn();
const mockUpdatePost = vi.fn();
const mockDeletePost = vi.fn();
const mockFindPostsByStatus = vi.fn();
const mockCreateInvoice = vi.fn();

vi.mock('@restropulse/db', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        findActiveSubscription: mockFindActiveSubscription,
        getWeeklyPostCounts: mockGetWeeklyPostCounts,
        deductCredits: mockDeductCredits,
        createPost: mockCreatePost,
        findAllPosts: mockFindAllPosts,
        findPostById: mockFindPostById,
        updatePost: mockUpdatePost,
        deletePost: mockDeletePost,
        findPostsByStatus: mockFindPostsByStatus,
        createInvoice: mockCreateInvoice,
    };
});

vi.mock('@restropulse/publishing', () => ({
    publishPost: vi.fn(),
    triggerManualPublish: vi.fn(),
    getRecentPublishAttempts: vi.fn(),
    startPublishingCron: vi.fn(),
}));

vi.mock('../../src/services/razorpay.js', () => ({
    createRazorpaySubscription: vi.fn(),
    cancelRazorpaySubscription: vi.fn(),
    createRazorpayOrder: vi.fn(),
    verifyWebhookSignature: vi.fn(),
    verifyPaymentSignature: vi.fn(),
    getRazorpayKeyId: vi.fn().mockReturnValue('rzp_test_key'),
    createRazorpayOffer: vi.fn(),
    fetchRazorpayInvoice: vi.fn(),
    listRazorpayInvoices: vi.fn(),
}));

const { createTestApp, generateAuthToken } = await import('../helpers/testHelper.js');

const authToken = generateAuthToken();
const app = createTestApp();

describe('enforcePlanLimits Middleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreatePost.mockResolvedValue({
            id: 'p-new', type: 'IMAGE', status: 'PENDING_APPROVAL',
            caption: 'Test', thumbnail: '/test.jpg', platform: 'INSTAGRAM',
            restaurantId: 'r1',
        });
    });

    describe('Active subscription within limits', () => {
        test('should allow post creation when within plan limits', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'ACTIVE', credits: 10,
                planSnapshot: {
                    limits: { reelsPerWeek: 2, instagramPostsPerWeek: 5, carouselPostsPerWeek: 3 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 1, VIDEO: 0, STORY: 0, CAROUSEL: 0, REEL: 0,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'IMAGE', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).not.toHaveBeenCalled();
        });

        test('should allow REEL when within reel limit', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'ACTIVE', credits: 10,
                planSnapshot: {
                    limits: { reelsPerWeek: 2, instagramPostsPerWeek: 5, carouselPostsPerWeek: 3 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 0, VIDEO: 0, STORY: 0, CAROUSEL: 0, REEL: 1,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'REEL', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).not.toHaveBeenCalled();
        });

        test('should allow CAROUSEL when within carousel limit', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'ACTIVE', credits: 10,
                planSnapshot: {
                    limits: { reelsPerWeek: 2, instagramPostsPerWeek: 5, carouselPostsPerWeek: 3 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 0, VIDEO: 0, STORY: 0, CAROUSEL: 2, REEL: 0,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'CAROUSEL', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).not.toHaveBeenCalled();
        });
    });

    describe('Over plan limits - uses credits', () => {
        test('should deduct credits when IMAGE exceeds plan limit', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'ACTIVE', credits: 10,
                planSnapshot: {
                    limits: { reelsPerWeek: 2, instagramPostsPerWeek: 2, carouselPostsPerWeek: 3 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 2, VIDEO: 0, STORY: 0, CAROUSEL: 0, REEL: 0,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'IMAGE', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).toHaveBeenCalledWith('sub-1', 1); // IMAGE costs 1 credit
        });

        test('should deduct 5 credits for REEL when over limit', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'ACTIVE', credits: 10,
                planSnapshot: {
                    limits: { reelsPerWeek: 1, instagramPostsPerWeek: 5, carouselPostsPerWeek: 3 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 0, VIDEO: 0, STORY: 0, CAROUSEL: 0, REEL: 1,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'REEL', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).toHaveBeenCalledWith('sub-1', 5);
        });

        test('should deduct 3 credits for CAROUSEL when over limit', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'ACTIVE', credits: 10,
                planSnapshot: {
                    limits: { reelsPerWeek: 2, instagramPostsPerWeek: 5, carouselPostsPerWeek: 1 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 0, VIDEO: 0, STORY: 0, CAROUSEL: 1, REEL: 0,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'CAROUSEL', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).toHaveBeenCalledWith('sub-1', 3);
        });
    });

    describe('No subscription or credits', () => {
        test('should return 403 when no subscription exists', async () => {
            mockFindActiveSubscription.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'IMAGE', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('No subscription found');
        });

        test('should return 403 when over limit and no credits', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'ACTIVE', credits: 0,
                planSnapshot: {
                    limits: { reelsPerWeek: 1, instagramPostsPerWeek: 1, carouselPostsPerWeek: 1 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 1, VIDEO: 0, STORY: 0, CAROUSEL: 0, REEL: 0,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'IMAGE', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(403);
            expect(res.body.creditsNeeded).toBe(1);
            expect(res.body.creditsAvailable).toBe(0);
        });

        test('should return 403 when REEL costs more credits than available', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'ACTIVE', credits: 3,
                planSnapshot: {
                    limits: { reelsPerWeek: 0, instagramPostsPerWeek: 5, carouselPostsPerWeek: 3 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 0, VIDEO: 0, STORY: 0, CAROUSEL: 0, REEL: 0,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'REEL', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(403);
            expect(res.body.creditsNeeded).toBe(5);
            expect(res.body.creditsAvailable).toBe(3);
        });
    });

    describe('No active plan (NONE/CANCELLED) - credits only', () => {
        test('should allow post creation with credits when status is NONE', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'NONE', credits: 20,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'IMAGE', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).toHaveBeenCalledWith('sub-1', 1);
        });

        test('should allow post creation with credits when status is CANCELLED', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'CANCELLED', credits: 5,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'IMAGE', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).toHaveBeenCalledWith('sub-1', 1);
        });
    });

    describe('PAST_DUE subscription', () => {
        test('should still check plan limits when status is PAST_DUE', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'PAST_DUE', credits: 5,
                planSnapshot: {
                    limits: { reelsPerWeek: 2, instagramPostsPerWeek: 5, carouselPostsPerWeek: 3 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 0, VIDEO: 0, STORY: 0, CAROUSEL: 0, REEL: 0,
            });

            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'IMAGE', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).not.toHaveBeenCalled();
        });
    });

    describe('Combined post types count toward instagramPostsPerWeek', () => {
        test('VIDEO + STORY + IMAGE all count toward instagram limit', async () => {
            mockFindActiveSubscription.mockResolvedValue({
                id: 'sub-1', restaurantId: 'r1', status: 'ACTIVE', credits: 10,
                planSnapshot: {
                    limits: { reelsPerWeek: 2, instagramPostsPerWeek: 3, carouselPostsPerWeek: 3 },
                },
            });
            mockGetWeeklyPostCounts.mockResolvedValue({
                IMAGE: 1, VIDEO: 1, STORY: 1, CAROUSEL: 0, REEL: 0,
            });

            // 3 instagram posts used (1+1+1) >= 3 limit, so this should use credits
            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'STORY', caption: 'Test', thumbnail: '/test.jpg',
                    platform: 'INSTAGRAM',
                });

            expect(res.status).toBe(201);
            expect(mockDeductCredits).toHaveBeenCalledWith('sub-1', 1);
        });
    });
});
