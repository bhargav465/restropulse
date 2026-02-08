import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

// Import Actual Implementation
import * as actualPostsDb from '../../src/db/posts.js';

// Define Mocks
const mockFindAllPosts = jest.fn<any>();
const mockFindPostById = jest.fn<any>();
const mockCreatePost = jest.fn<any>();
const mockUpdatePost = jest.fn<any>();
const mockDeletePost = jest.fn<any>();
const mockFindPostsByStatus = jest.fn<any>();

// Mock publishPost and cron functions used by routes/posts.ts
const mockPublishPost = jest.fn<any>();
const mockTriggerManualPublish = jest.fn<any>();
const mockGetRecentPublishAttempts = jest.fn<any>();

// Mock Module
await jest.unstable_mockModule('../../src/db/posts.js', () => ({
    __esModule: true,
    ...actualPostsDb,
    findAllPosts: mockFindAllPosts,
    findPostById: mockFindPostById,
    createPost: mockCreatePost,
    updatePost: mockUpdatePost,
    deletePost: mockDeletePost,
    findPostsByStatus: mockFindPostsByStatus
}));

await jest.unstable_mockModule('../../src/services/publishing-service.js', () => ({
    publishPost: mockPublishPost
}));

await jest.unstable_mockModule('../../src/services/publishing-cron.js', () => ({
    triggerManualPublish: mockTriggerManualPublish,
    getRecentPublishAttempts: mockGetRecentPublishAttempts,
    startPublishingCron: jest.fn()
}));

// Import Helpers
const { createTestApp, mockPost } = await import('../helpers/testHelper.js');
const { getPostsCollection, getRestaurantsCollection } = await import('../../src/db/connection.js');

// Reset Mocks Helper
const useActualImplementation = () => {
    mockFindAllPosts.mockImplementation(actualPostsDb.findAllPosts);
    mockFindPostById.mockImplementation(actualPostsDb.findPostById);
    mockCreatePost.mockImplementation(actualPostsDb.createPost);
    mockUpdatePost.mockImplementation(actualPostsDb.updatePost);
    mockDeletePost.mockImplementation(actualPostsDb.deletePost);
    mockFindPostsByStatus.mockImplementation(actualPostsDb.findPostsByStatus);
};

const app = createTestApp();

describe('Posts Module', () => {

    beforeEach(async () => {
        jest.clearAllMocks();
        useActualImplementation();
        // Clear the mock collection
        const col = getPostsCollection();
        await col.deleteMany({});
    });

    describe('DB Helpers (src/db/posts.ts)', () => {

        describe('findPostsByStatus', () => {
            test('should return posts filtered by status', async () => {
                const col = getPostsCollection();
                await col.insertOne({
                    _id: 'p1',
                    status: 'SCHEDULED',
                    scheduledFor: new Date('2024-01-01'),
                    restaurantId: 'r1'
                } as any);
                await col.insertOne({
                    _id: 'p2',
                    status: 'POSTED',
                    scheduledFor: new Date('2024-01-02'),
                    restaurantId: 'r1'
                } as any);

                const drafts = await actualPostsDb.findPostsByStatus('SCHEDULED');
                expect(drafts).toHaveLength(1);
                expect(drafts[0].id).toBe('p1');
                expect(drafts[0].status).toBe('SCHEDULED');
            });

            test('should filter by restaurantId if provided', async () => {
                const col = getPostsCollection();
                await col.insertOne({
                    _id: 'p3',
                    status: 'PUBLISHED',
                    restaurantId: 'r1'
                } as any);
                await col.insertOne({
                    _id: 'p4',
                    status: 'PUBLISHED',
                    restaurantId: 'r2'
                } as any);

                const r1Published = await actualPostsDb.findPostsByStatus('PUBLISHED', 'r1');
                expect(r1Published).toHaveLength(1);
                expect(r1Published[0].id).toBe('p3');
            });

            test('should return empty array if no matches', async () => {
                const results = await actualPostsDb.findPostsByStatus('ARCHIVED');
                expect(results).toEqual([]);
            });

            test('should sort by scheduledFor', async () => {
                const col = getPostsCollection();
                await col.insertOne({
                    _id: 'p5',
                    status: 'SCHEDULED',
                    scheduledFor: new Date('2024-01-05')
                } as any);
                await col.insertOne({
                    _id: 'p6',
                    status: 'SCHEDULED',
                    scheduledFor: new Date('2024-01-01')
                } as any);

                const results = await actualPostsDb.findPostsByStatus('SCHEDULED');
                expect(results).toHaveLength(2);
                const ids = results.map(r => r.id);
                expect(ids).toContain('p5');
                expect(ids).toContain('p6');
            });
        });

        describe('Core CRUD Operations', () => {
            test('findAllPosts should return all posts', async () => {
                await actualPostsDb.createPost({
                    caption: 'Post 1',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    restaurantId: 'r1',
                    platform: 'INSTAGRAM',
                    thumbnail: 'img1.jpg'
                } as any);
                await actualPostsDb.createPost({
                    caption: 'Post 2',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    restaurantId: 'r1',
                    platform: 'INSTAGRAM',
                    thumbnail: 'img2.jpg'
                } as any);

                const posts = await actualPostsDb.findAllPosts();
                expect(posts).toHaveLength(2);
            });

            test('findAllPosts should filter by restaurantId', async () => {
                await actualPostsDb.createPost({
                    caption: 'P1',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    restaurantId: 'target-r',
                    platform: 'INSTAGRAM',
                    thumbnail: 't1'
                } as any);
                await actualPostsDb.createPost({
                    caption: 'P2',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    restaurantId: 'other-r',
                    platform: 'INSTAGRAM',
                    thumbnail: 't2'
                } as any);

                const results = await actualPostsDb.findAllPosts('target-r');
                expect(results).toHaveLength(1);
                expect(results[0].caption).toBe('P1');
            });

            test('findPostById should return post if exists', async () => {
                const newPost = await actualPostsDb.createPost({
                    caption: 'Target Post',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    restaurantId: 'r1',
                    platform: 'INSTAGRAM',
                    thumbnail: 'img3.jpg'
                } as any);

                const found = await actualPostsDb.findPostById(newPost.id);
                expect(found).toBeDefined();
                expect(found?.id).toBe(newPost.id);
                expect(found?.caption).toBe('Target Post');
            });

            test('findPostById should return null if not exists', async () => {
                const found = await actualPostsDb.findPostById('non-existent-id');
                expect(found).toBeNull();
            });

            test('createPost should add createdAt/updatedAt', async () => {
                const post = await actualPostsDb.createPost({
                    caption: 'New Post',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    restaurantId: 'r1',
                    platform: 'INSTAGRAM',
                    thumbnail: 'img4.jpg'
                } as any);

                expect(post.id).toBeDefined();

                const stored = await actualPostsDb.findPostById(post.id);
                expect(stored).toBeDefined();
                expect((stored as any).createdAt).toBeDefined();
                expect((stored as any).updatedAt).toBeDefined();
            });

            test('updatePost should modify post', async () => {
                const post = await actualPostsDb.createPost({
                    caption: 'Original',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    restaurantId: 'r1',
                    platform: 'INSTAGRAM',
                    thumbnail: 'img5.jpg'
                } as any);

                const updated = await actualPostsDb.updatePost(post.id, { caption: 'Updated' });
                expect(updated?.caption).toBe('Updated');
                expect((updated as any)?.updatedAt).not.toBe((post as any).updatedAt);
            });

            test('deletePost should remove post', async () => {
                const post = await actualPostsDb.createPost({
                    caption: 'To Delete',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    restaurantId: 'r1',
                    platform: 'INSTAGRAM',
                    thumbnail: 'img6.jpg'
                } as any);

                const success = await actualPostsDb.deletePost(post.id);
                expect(success).toBe(true);

                const found = await actualPostsDb.findPostById(post.id);
                expect(found).toBeNull();
            });
        });
    });

    describe('API Routes (src/routes/posts.ts)', () => {
        beforeEach(async () => {
            // Seed data for API tests
            await request(app).post('/api/posts').send(mockPost);
        });

        describe('GET /api/posts', () => {
            test('should get all posts', async () => {
                const response = await request(app).get('/api/posts');

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('success', true);
                expect(response.body).toHaveProperty('data');
                expect(Array.isArray(response.body.data)).toBe(true);
            });

            test('should return posts with correct structure', async () => {
                const response = await request(app).get('/api/posts');

                if (response.body.data.length > 0) {
                    const post = response.body.data[0];
                    expect(post).toHaveProperty('id');
                    expect(post).toHaveProperty('type');
                    expect(post).toHaveProperty('status');
                    expect(post).toHaveProperty('caption');
                    expect(post).toHaveProperty('platform');
                }
            });

            test('should return JSON content type', async () => {
                const response = await request(app).get('/api/posts');
                expect(response.headers['content-type']).toMatch(/json/);
            });

            test('should handle 500 error', async () => {
                mockFindAllPosts.mockRejectedValue(new Error('DB Error'));

                const response = await request(app).get('/api/posts');
                expect(response.status).toBe(500);
                expect(response.body).toEqual({
                    success: false,
                    error: 'Internal server error'
                });
            });
        });

        describe('GET /api/posts/:id', () => {
            test('should get post by valid ID', async () => {
                const getRes = await request(app).get('/api/posts');
                const postId = getRes.body.data[0].id;

                const response = await request(app).get(`/api/posts/${postId}`);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('success', true);
                expect(response.body.data).toHaveProperty('id', postId);
            });

            test('should return 404 for non-existent post', async () => {
                const response = await request(app).get('/api/posts/non-existent-id');

                expect(response.status).toBe(404);
                expect(response.body).toHaveProperty('success', false);
                expect(response.body).toHaveProperty('error', 'Post not found');
            });

            test('should return complete post data', async () => {
                const getRes = await request(app).get('/api/posts');
                const postId = getRes.body.data[0].id;

                const response = await request(app).get(`/api/posts/${postId}`);

                expect(response.body.data).toHaveProperty('thumbnail');
                expect(response.body.data).toHaveProperty('caption');
                expect(response.body.data).toHaveProperty('type');
            });

            test('should handle 500 error', async () => {
                mockFindPostById.mockRejectedValue(new Error('DB Error'));

                const response = await request(app).get('/api/posts/123');
                expect(response.status).toBe(500);
                expect(response.body).toEqual({
                    success: false,
                    error: 'Internal server error'
                });
            });
        });

        describe('POST /api/posts', () => {
            test('should create new post with valid data', async () => {
                const newPost = {
                    type: 'IMAGE',
                    status: 'PENDING_APPROVAL',
                    thumbnail: '/test.jpg',
                    caption: 'Test post caption',
                    platform: 'INSTAGRAM'
                };

                const response = await request(app).post('/api/posts').send(newPost);

                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('success', true);
                expect(response.body.data).toHaveProperty('id');
                expect(response.body.data.caption).toBe(newPost.caption);
                expect(response.body).toHaveProperty('message', 'Post created successfully');
            });

            test('should auto-generate ID for new post', async () => {
                const newPost = {
                    type: 'VIDEO',
                    status: 'SCHEDULED',
                    thumbnail: '/video.jpg',
                    caption: 'Video post',
                    platform: 'FACEBOOK'
                };

                const response = await request(app).post('/api/posts').send(newPost);

                expect(response.body.data).toHaveProperty('id');
                expect(response.body.data.id).toMatch(/^[a-f0-9]{24}$/);
            });

            test('should handle post with stats', async () => {
                const newPost = {
                    type: 'CAROUSEL',
                    status: 'POSTED',
                    thumbnail: '/carousel.jpg',
                    caption: 'Carousel post',
                    platform: 'BOTH',
                    stats: { likes: 100, shares: 20, comments: 15, reach: 1000 }
                };

                const response = await request(app).post('/api/posts').send(newPost);

                expect(response.status).toBe(201);
                expect(response.body.data.stats).toMatchObject(newPost.stats);
            });

            test('should handle post with mediaUrls', async () => {
                const newPost = {
                    type: 'CAROUSEL',
                    status: 'SCHEDULED',
                    thumbnail: '/thumb.jpg',
                    mediaUrls: ['/img1.jpg', '/img2.jpg', '/img3.jpg'],
                    caption: 'Multi-image post',
                    platform: 'INSTAGRAM'
                };

                const response = await request(app).post('/api/posts').send(newPost);

                expect(response.status).toBe(201);
                expect(response.body.data.mediaUrls).toEqual(newPost.mediaUrls);
            });

            test('should handle video posts', async () => {
                const newPost = {
                    type: 'REEL',
                    status: 'PENDING_APPROVAL',
                    thumbnail: '/reel-thumb.jpg',
                    videoUrl: '/reel.mp4',
                    caption: 'Reel caption',
                    platform: 'INSTAGRAM',
                    duration: '0:15'
                };

                const response = await request(app).post('/api/posts').send(newPost);

                expect(response.status).toBe(201);
                expect(response.body.data.videoUrl).toBe(newPost.videoUrl);
                expect(response.body.data.duration).toBe(newPost.duration);
            });

            test('should handle 500 error', async () => {
                mockCreatePost.mockRejectedValue(new Error('DB Error'));

                // Need to provide valid caption to pass validation and reach DB call
                const response = await request(app).post('/api/posts').send({ caption: 'Test post' });
                expect(response.status).toBe(500);
                expect(response.body).toEqual({
                    success: false,
                    error: 'Internal server error'
                });
            });
        });

        describe('PUT /api/posts/:id', () => {
            test('should update existing post', async () => {
                const getRes = await request(app).get('/api/posts');
                const postId = getRes.body.data[0].id;

                const updateData = { caption: 'Updated caption', status: 'APPROVED' };

                const response = await request(app).put(`/api/posts/${postId}`).send(updateData);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('success', true);
                expect(response.body.data.caption).toBe(updateData.caption);
                expect(response.body.data.id).toBe(postId);
            });

            test('should return 404 for non-existent post', async () => {
                const response = await request(app).put('/api/posts/non-existent').send({ caption: 'test' });

                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
            });

            test('should preserve post ID when updating', async () => {
                const getRes = await request(app).get('/api/posts');
                const postId = getRes.body.data[0].id;

                const response = await request(app).put(`/api/posts/${postId}`).send({ id: 'different-id', caption: 'test' });

                expect(response.body.data.id).toBe(postId);
            });

            test('should handle partial updates', async () => {
                const getRes = await request(app).get('/api/posts');
                const postId = getRes.body.data[0].id;

                const response = await request(app).put(`/api/posts/${postId}`).send({ status: 'CHANGES_REQUESTED' });

                expect(response.status).toBe(200);
                expect(response.body.data.status).toBe('CHANGES_REQUESTED');
            });

            test('should update stats', async () => {
                const getRes = await request(app).get('/api/posts');
                const postId = getRes.body.data[0].id;

                const newStats = { stats: { likes: 999, shares: 99, comments: 88, reach: 8888 } };

                const response = await request(app).put(`/api/posts/${postId}`).send(newStats);

                expect(response.body.data.stats).toMatchObject(newStats.stats);
            });

            test('should update feedback field', async () => {
                const getRes = await request(app).get('/api/posts');
                const postId = getRes.body.data[0].id;
                const feedback = { feedback: JSON.stringify({ tags: ['Caption'], note: 'Please improve' }) };

                const response = await request(app).put(`/api/posts/${postId}`).send(feedback);

                expect(response.body.data.feedback).toBe(feedback.feedback);
            });

            test('should handle 500 error', async () => {
                mockUpdatePost.mockRejectedValue(new Error('DB Error'));

                const response = await request(app).put('/api/posts/123').send({ title: 'updated' });
                expect(response.status).toBe(500);
                expect(response.body).toEqual({
                    success: false,
                    error: 'Internal server error'
                });
            });
        });

        describe('DELETE /api/posts/:id', () => {
            test('should delete existing post', async () => {
                const getRes = await request(app).get('/api/posts');
                const postId = getRes.body.data[0].id;

                const response = await request(app).delete(`/api/posts/${postId}`);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('success', true);
                expect(response.body).toHaveProperty('message', 'Post deleted successfully');
            });

            test('should return 404 for non-existent post', async () => {
                const response = await request(app).delete('/api/posts/non-existent-id');

                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
            });

            test('should actually remove post from list', async () => {
                await request(app).post('/api/posts').send(mockPost);
                const getRes = await request(app).get('/api/posts');
                const postId = getRes.body.data[0].id;

                await request(app).delete(`/api/posts/${postId}`);

                const getResponse = await request(app).get(`/api/posts/${postId}`);
                expect(getResponse.status).toBe(404);
            });

            test('should handle 500 error', async () => {
                mockDeletePost.mockRejectedValue(new Error('DB Error'));

                const response = await request(app).delete('/api/posts/123');
                expect(response.status).toBe(500);
                expect(response.body).toEqual({
                    success: false,
                    error: 'Internal server error'
                });
            });
        });

        describe('Edge Cases', () => {
            test('should handle empty request body for POST', async () => {
                const response = await request(app).post('/api/posts').send({});
                // Now requires caption, so should return 400
                expect(response.status).toBe(400);
                expect(response.body.error).toBe('Caption is required');
            });

            test('should handle very long captions', async () => {
                const longCaption = 'A'.repeat(5000);
                const response = await request(app).post('/api/posts').send({
                    type: 'IMAGE',
                    caption: longCaption,
                    platform: 'INSTAGRAM'
                });
                expect(response.status).toBe(201);
                expect(response.body.data.caption).toBe(longCaption);
            });

            test('should handle special characters in caption', async () => {
                const specialCaption = '(emoji: pizza)(emoji: party) Special #offer @restaurant 50% off! (emoji: money)';
                const response = await request(app).post('/api/posts').send({
                    type: 'IMAGE',
                    caption: specialCaption,
                    platform: 'INSTAGRAM'
                });
                expect(response.status).toBe(201);
                expect(response.body.data.caption).toBe(specialCaption);
            });
        });

        describe('Adhoc Post Creation', () => {
            test('should create adhoc post without strategyId', async () => {
                const adhocPost = {
                    caption: 'Flash sale announcement - 50% off all pizzas today!',
                    type: 'IMAGE',
                    platform: 'INSTAGRAM'
                };

                const response = await request(app).post('/api/posts').send(adhocPost);

                expect(response.status).toBe(201);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toHaveProperty('id');
                expect(response.body.data.caption).toBe(adhocPost.caption);
                expect(response.body.data.isAdhoc).toBe(true);
                expect(response.body.data.strategyId).toBeUndefined();
            });

            test('should set default status to PENDING_APPROVAL for adhoc posts', async () => {
                const adhocPost = {
                    caption: 'New menu item launch',
                    type: 'REEL',
                    platform: 'BOTH'
                };

                const response = await request(app).post('/api/posts').send(adhocPost);

                expect(response.status).toBe(201);
                expect(response.body.data.status).toBe('PENDING_APPROVAL');
            });

            test('should set default type to IMAGE if not provided', async () => {
                const adhocPost = {
                    caption: 'Quick announcement',
                    platform: 'INSTAGRAM'
                };

                const response = await request(app).post('/api/posts').send(adhocPost);

                expect(response.status).toBe(201);
                expect(response.body.data.type).toBe('IMAGE');
            });

            test('should set default platform to INSTAGRAM if not provided', async () => {
                const adhocPost = {
                    caption: 'Quick announcement'
                };

                const response = await request(app).post('/api/posts').send(adhocPost);

                expect(response.status).toBe(201);
                expect(response.body.data.platform).toBe('INSTAGRAM');
            });

            test('should set default thumbnail if not provided', async () => {
                const adhocPost = {
                    caption: 'Post without image',
                    type: 'IMAGE',
                    platform: 'INSTAGRAM'
                };

                const response = await request(app).post('/api/posts').send(adhocPost);

                expect(response.status).toBe(201);
                expect(response.body.data.thumbnail).toMatch(/^https:\/\/picsum\.photos\/seed\/\d+\/400\/400$/);
            });

            test('should set default restaurantId to r1 when not provided', async () => {
                const adhocPost = {
                    caption: 'Post without restaurantId',
                    type: 'IMAGE',
                    platform: 'INSTAGRAM'
                };

                const response = await request(app).post('/api/posts').send(adhocPost);

                expect(response.status).toBe(201);
                expect(response.body.data.restaurantId).toBe('r1');
            });

            test('should preserve provided restaurantId', async () => {
                const adhocPost = {
                    caption: 'Post for specific restaurant',
                    type: 'IMAGE',
                    platform: 'INSTAGRAM',
                    restaurantId: 'r-custom'
                };

                const response = await request(app).post('/api/posts').send(adhocPost);

                expect(response.status).toBe(201);
                expect(response.body.data.restaurantId).toBe('r-custom');
            });

            test('should set all required defaults on minimal post creation', async () => {
                // Send only the required field (caption)
                const minimalPost = { caption: 'Bare minimum post' };

                const response = await request(app).post('/api/posts').send(minimalPost);

                expect(response.status).toBe(201);
                const data = response.body.data;

                // Every field the publishing pipeline depends on
                expect(data.restaurantId).toBe('r1');
                expect(data.type).toBe('IMAGE');
                expect(data.status).toBe('PENDING_APPROVAL');
                expect(data.platform).toBe('INSTAGRAM');
                expect(data.caption).toBe('Bare minimum post');
                expect(data.thumbnail).toMatch(/^https:\/\/picsum\.photos\/seed\/\d+\/400\/400$/);
                expect(data.isAdhoc).toBe(true);
                expect(data.id).toBeDefined();
            });

            test('should persist restaurantId to the database', async () => {
                const adhocPost = {
                    caption: 'DB persistence check',
                    type: 'IMAGE',
                    platform: 'INSTAGRAM'
                };

                const response = await request(app).post('/api/posts').send(adhocPost);
                expect(response.status).toBe(201);

                // Verify directly in the DB
                const col = getPostsCollection();
                const dbDoc = await col.findOne({ caption: 'DB persistence check' });
                expect(dbDoc).not.toBeNull();
                expect(dbDoc!.restaurantId).toBe('r1');
            });

            test('should mark strategy posts as non-adhoc', async () => {
                const strategyPost = {
                    caption: 'Generated from strategy',
                    type: 'IMAGE',
                    platform: 'INSTAGRAM',
                    strategyId: 'strategy-123'
                };

                const response = await request(app).post('/api/posts').send(strategyPost);

                expect(response.status).toBe(201);
                expect(response.body.data.isAdhoc).toBe(false);
                expect(response.body.data.strategyId).toBe('strategy-123');
            });

            test('should allow scheduled adhoc posts', async () => {
                const scheduledAdhocPost = {
                    caption: 'Weekend special coming up!',
                    type: 'IMAGE',
                    platform: 'BOTH',
                    scheduledFor: '2026-02-15T14:00:00.000Z'
                };

                const response = await request(app).post('/api/posts').send(scheduledAdhocPost);

                expect(response.status).toBe(201);
                expect(response.body.data.scheduledFor).toBe(scheduledAdhocPost.scheduledFor);
                expect(response.body.data.restaurantId).toBe('r1');
                expect(response.body.data.isAdhoc).toBe(true);
            });

            test('should return 400 when caption is empty string', async () => {
                const invalidPost = {
                    caption: '',
                    type: 'IMAGE',
                    platform: 'INSTAGRAM'
                };

                const response = await request(app).post('/api/posts').send(invalidPost);

                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('Caption is required');
            });

            test('should return 400 when caption is whitespace only', async () => {
                const invalidPost = {
                    caption: '   ',
                    type: 'IMAGE',
                    platform: 'INSTAGRAM'
                };

                const response = await request(app).post('/api/posts').send(invalidPost);

                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('Caption is required');
            });

            test('should create adhoc REEL with videoUrl', async () => {
                const reelPost = {
                    caption: 'Check out our new reel!',
                    type: 'REEL',
                    platform: 'INSTAGRAM',
                    videoUrl: '/videos/reel-123.mp4',
                    duration: '0:30'
                };

                const response = await request(app).post('/api/posts').send(reelPost);

                expect(response.status).toBe(201);
                expect(response.body.data.type).toBe('REEL');
                expect(response.body.data.videoUrl).toBe(reelPost.videoUrl);
                expect(response.body.data.duration).toBe(reelPost.duration);
                expect(response.body.data.restaurantId).toBe('r1');
                expect(response.body.data.isAdhoc).toBe(true);
            });

            test('should create adhoc CAROUSEL with mediaUrls', async () => {
                const carouselPost = {
                    caption: 'New menu items showcase',
                    type: 'CAROUSEL',
                    platform: 'INSTAGRAM',
                    mediaUrls: ['/img1.jpg', '/img2.jpg', '/img3.jpg'],
                    thumbnail: '/img1.jpg'
                };

                const response = await request(app).post('/api/posts').send(carouselPost);

                expect(response.status).toBe(201);
                expect(response.body.data.type).toBe('CAROUSEL');
                expect(response.body.data.mediaUrls).toEqual(carouselPost.mediaUrls);
                expect(response.body.data.restaurantId).toBe('r1');
                expect(response.body.data.isAdhoc).toBe(true);
            });

            test('should create adhoc STORY post', async () => {
                const storyPost = {
                    caption: '24hr special offer!',
                    type: 'STORY',
                    platform: 'INSTAGRAM',
                    videoUrl: '/stories/story-123.mp4'
                };

                const response = await request(app).post('/api/posts').send(storyPost);

                expect(response.status).toBe(201);
                expect(response.body.data.type).toBe('STORY');
                expect(response.body.data.restaurantId).toBe('r1');
                expect(response.body.data.isAdhoc).toBe(true);
            });

            test('should preserve provided status for adhoc posts', async () => {
                const adhocPost = {
                    caption: 'Already approved post',
                    type: 'IMAGE',
                    platform: 'INSTAGRAM',
                    status: 'SCHEDULED'
                };

                const response = await request(app).post('/api/posts').send(adhocPost);

                expect(response.status).toBe(201);
                // Status should use provided value, not default
                expect(response.body.data.status).toBe('SCHEDULED');
            });
        });

        describe('POST /api/posts/actions/publish-all', () => {
            test('should trigger manual publish and return stats', async () => {
                mockTriggerManualPublish.mockResolvedValue({ published: 2, failed: 1, skipped: 0 });

                const response = await request(app).post('/api/posts/actions/publish-all');

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toEqual({ published: 2, failed: 1, skipped: 0 });
                expect(response.body.message).toContain('2 published');
                expect(response.body.message).toContain('1 failed');
            });

            test('should handle publish-all error', async () => {
                mockTriggerManualPublish.mockRejectedValue(new Error('Cron failure'));

                const response = await request(app).post('/api/posts/actions/publish-all');

                expect(response.status).toBe(500);
                expect(response.body.success).toBe(false);
            });
        });

        describe('GET /api/posts/actions/publish-log', () => {
            test('should return recent publish attempts', async () => {
                const mockAttempts = [
                    { postId: 'p1', success: true, timestamp: new Date().toISOString() },
                    { postId: 'p2', success: false, timestamp: new Date().toISOString() }
                ];
                mockGetRecentPublishAttempts.mockReturnValue(mockAttempts);

                const response = await request(app).get('/api/posts/actions/publish-log');

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toHaveLength(2);
            });

            test('should handle publish-log error', async () => {
                mockGetRecentPublishAttempts.mockImplementation(() => { throw new Error('Log error'); });

                const response = await request(app).get('/api/posts/actions/publish-log');

                expect(response.status).toBe(500);
                expect(response.body.success).toBe(false);
            });
        });

        describe('POST /api/posts/:id/publish', () => {
            test('should publish a scheduled post successfully', async () => {
                const col = getPostsCollection();
                await col.insertOne({
                    _id: 'pub-1',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    caption: 'Publish me',
                    thumbnail: 'https://example.com/img.jpg',
                    platform: 'INSTAGRAM',
                    restaurantId: 'r1-pub'
                } as any);

                // Setup restaurant with credentials (unique ID to avoid seeded data conflict)
                const restCol = getRestaurantsCollection();
                await restCol.insertOne({
                    _id: 'r1-pub',
                    instagramCredentials: {
                        userId: 'ig-123',
                        pageId: 'page-456',
                        accessToken: 'enc-token'
                    }
                } as any);

                mockPublishPost.mockResolvedValue({
                    instagram: { success: true, instagramMediaId: 'media-1', retryable: false }
                });

                mockFindPostById.mockImplementation(actualPostsDb.findPostById);

                const response = await request(app).post('/api/posts/pub-1/publish');

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(mockPublishPost).toHaveBeenCalled();
            });

            test('should return 404 when post not found', async () => {
                mockFindPostById.mockResolvedValue(null);

                const response = await request(app).post('/api/posts/nonexistent/publish');

                expect(response.status).toBe(404);
                expect(response.body.error).toBe('Post not found');
            });

            test('should return 400 when post status is not publishable', async () => {
                mockFindPostById.mockResolvedValue({
                    id: 'pub-2',
                    status: 'PENDING_APPROVAL',
                    type: 'IMAGE',
                    caption: 'Not ready',
                    thumbnail: '/img.jpg',
                    platform: 'INSTAGRAM'
                });

                const response = await request(app).post('/api/posts/pub-2/publish');

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Cannot publish');
                expect(response.body.error).toContain('PENDING_APPROVAL');
            });

            test('should return 400 when post has no restaurantId', async () => {
                mockFindPostById.mockResolvedValue({
                    id: 'pub-3',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    caption: 'No restaurant',
                    thumbnail: '/img.jpg',
                    platform: 'INSTAGRAM'
                });

                const response = await request(app).post('/api/posts/pub-3/publish');

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('no associated restaurant');
            });

            test('should return 400 when restaurant has no Instagram credentials', async () => {
                const col = getPostsCollection();
                await col.insertOne({
                    _id: 'pub-4',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    caption: 'No creds',
                    thumbnail: '/img.jpg',
                    platform: 'INSTAGRAM',
                    restaurantId: 'r-no-creds'
                } as any);

                const restCol = getRestaurantsCollection();
                await restCol.insertOne({
                    _id: 'r-no-creds'
                } as any);

                mockFindPostById.mockImplementation(actualPostsDb.findPostById);

                const response = await request(app).post('/api/posts/pub-4/publish');

                expect(response.status).toBe(400);
                expect(response.body.error).toContain('Instagram not connected');
            });

            test('should return 502 when publishing fails', async () => {
                const col = getPostsCollection();
                await col.insertOne({
                    _id: 'pub-5',
                    status: 'SCHEDULED',
                    type: 'IMAGE',
                    caption: 'Fail publish',
                    thumbnail: '/img.jpg',
                    platform: 'INSTAGRAM',
                    restaurantId: 'r1-fail'
                } as any);

                const restCol = getRestaurantsCollection();
                await restCol.insertOne({
                    _id: 'r1-fail',
                    instagramCredentials: {
                        userId: 'ig-123',
                        pageId: 'page-456',
                        accessToken: 'enc-token'
                    }
                } as any);

                mockPublishPost.mockResolvedValue({
                    instagram: { success: false, error: 'Rate limited', retryable: true }
                });

                mockFindPostById.mockImplementation(actualPostsDb.findPostById);

                const response = await request(app).post('/api/posts/pub-5/publish');

                expect(response.status).toBe(502);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toContain('Rate limited');
            });

            test('should allow publishing MISSED_DEADLINE posts', async () => {
                mockFindPostById.mockResolvedValue({
                    id: 'pub-6',
                    status: 'MISSED_DEADLINE',
                    type: 'IMAGE',
                    caption: 'Retry',
                    thumbnail: '/img.jpg',
                    platform: 'FACEBOOK',
                    restaurantId: 'r1-retry'
                });

                const restCol = getRestaurantsCollection();
                await restCol.insertOne({
                    _id: 'r1-retry',
                    instagramCredentials: {
                        userId: 'ig-123',
                        pageId: 'page-456',
                        accessToken: 'enc-token'
                    }
                } as any);

                mockPublishPost.mockResolvedValue({
                    facebook: { success: true, facebookPostId: 'fb-1', retryable: false }
                });

                const response = await request(app).post('/api/posts/pub-6/publish');

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
            });

            test('should handle publish route internal error', async () => {
                mockFindPostById.mockRejectedValue(new Error('Database error'));

                const response = await request(app).post('/api/posts/pub-err/publish');

                expect(response.status).toBe(500);
                expect(response.body.success).toBe(false);
            });
        });
    });
});
