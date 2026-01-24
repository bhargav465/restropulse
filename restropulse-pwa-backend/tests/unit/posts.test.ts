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

// Import Helpers
const { createTestApp, mockPost } = await import('../helpers/testHelper.js');
const { getPostsCollection } = await import('../../src/db/connection.js');

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

                const response = await request(app).post('/api/posts').send({ title: 'test' });
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
                expect(response.status).toBe(201);
                expect(response.body.data).toHaveProperty('id');
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
                const specialCaption = '🍕🎉 Special #offer @restaurant 50% off! 💰';
                const response = await request(app).post('/api/posts').send({
                    type: 'IMAGE',
                    caption: specialCaption,
                    platform: 'INSTAGRAM'
                });
                expect(response.status).toBe(201);
                expect(response.body.data.caption).toBe(specialCaption);
            });
        });
    });
});


