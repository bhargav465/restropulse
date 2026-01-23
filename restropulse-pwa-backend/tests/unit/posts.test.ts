import { describe, test, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createTestApp, mockPost } from '../helpers/testHelper.js';

const app = createTestApp();

describe('Posts Routes - Unit Tests', () => {
    describe('GET /api/posts', () => {
        test('should get all posts', async () => {
            const response = await request(app)
                .get('/api/posts');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        test('should return posts with correct structure', async () => {
            const response = await request(app)
                .get('/api/posts');

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
            const response = await request(app)
                .get('/api/posts');

            expect(response.headers['content-type']).toMatch(/json/);
        });
    });

    describe('GET /api/posts/:id', () => {
        test('should get post by valid ID', async () => {
            const response = await request(app)
                .get('/api/posts/p1');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data).toHaveProperty('id', 'p1');
        });

        test('should return 404 for non-existent post', async () => {
            const response = await request(app)
                .get('/api/posts/non-existent-id');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error', 'Post not found');
        });

        test('should return complete post data', async () => {
            const response = await request(app)
                .get('/api/posts/p1');

            expect(response.body.data).toHaveProperty('thumbnail');
            expect(response.body.data).toHaveProperty('caption');
            expect(response.body.data).toHaveProperty('type');
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

            const response = await request(app)
                .post('/api/posts')
                .send(newPost);

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

            const response = await request(app)
                .post('/api/posts')
                .send(newPost);

            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.id).toMatch(/^p\d+$/);
        });

        test('should handle post with stats', async () => {
            const newPost = {
                type: 'CAROUSEL',
                status: 'POSTED',
                thumbnail: '/carousel.jpg',
                caption: 'Carousel post',
                platform: 'BOTH',
                stats: {
                    likes: 100,
                    shares: 20,
                    comments: 15,
                    reach: 1000
                }
            };

            const response = await request(app)
                .post('/api/posts')
                .send(newPost);

            expect(response.status).toBe(201);
            expect(response.body.data.stats).toMatchObject(newPost.stats);
        });

        test('should handle post with media URLs', async () => {
            const newPost = {
                type: 'CAROUSEL',
                status: 'SCHEDULED',
                thumbnail: '/thumb.jpg',
                mediaUrls: ['/img1.jpg', '/img2.jpg', '/img3.jpg'],
                caption: 'Multi-image post',
                platform: 'INSTAGRAM'
            };

            const response = await request(app)
                .post('/api/posts')
                .send(newPost);

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

            const response = await request(app)
                .post('/api/posts')
                .send(newPost);

            expect(response.status).toBe(201);
            expect(response.body.data.videoUrl).toBe(newPost.videoUrl);
            expect(response.body.data.duration).toBe(newPost.duration);
        });
    });

    describe('PUT /api/posts/:id', () => {
        test('should update existing post', async () => {
            const updateData = {
                caption: 'Updated caption',
                status: 'APPROVED'
            };

            const response = await request(app)
                .put('/api/posts/p1')
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.data.caption).toBe(updateData.caption);
            expect(response.body.data.id).toBe('p1');
        });

        test('should return 404 for non-existent post', async () => {
            const response = await request(app)
                .put('/api/posts/non-existent')
                .send({ caption: 'test' });

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });

        test('should preserve post ID when updating', async () => {
            const response = await request(app)
                .put('/api/posts/p1')
                .send({ id: 'different-id', caption: 'test' });

            expect(response.body.data.id).toBe('p1');
        });

        test('should handle partial updates', async () => {
            const response = await request(app)
                .put('/api/posts/p1')
                .send({ status: 'CHANGES_REQUESTED' });

            expect(response.status).toBe(200);
            expect(response.body.data.status).toBe('CHANGES_REQUESTED');
        });

        test('should update stats', async () => {
            const newStats = {
                stats: {
                    likes: 999,
                    shares: 99,
                    comments: 88,
                    reach: 8888
                }
            };

            const response = await request(app)
                .put('/api/posts/p1')
                .send(newStats);

            expect(response.body.data.stats).toMatchObject(newStats.stats);
        });

        test('should update feedback field', async () => {
            const feedback = {
                feedback: JSON.stringify({
                    tags: ['Caption'],
                    note: 'Please improve'
                })
            };

            const response = await request(app)
                .put('/api/posts/p1')
                .send(feedback);

            expect(response.body.data.feedback).toBe(feedback.feedback);
        });
    });

    describe('DELETE /api/posts/:id', () => {
        test('should delete existing post', async () => {
            const response = await request(app)
                .delete('/api/posts/p2');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('message', 'Post deleted successfully');
        });

        test('should return 404 for non-existent post', async () => {
            const response = await request(app)
                .delete('/api/posts/non-existent-id');

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });

        test('should actually remove post from list', async () => {
            const deleteResponse = await request(app)
                .delete('/api/posts/p3');

            expect(deleteResponse.status).toBe(200);

            const getResponse = await request(app)
                .get('/api/posts/p3');

            expect(getResponse.status).toBe(404);
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty request body for POST', async () => {
            const response = await request(app)
                .post('/api/posts')
                .send({});

            expect(response.status).toBe(201);
            expect(response.body.data).toHaveProperty('id');
        });

        test('should handle very long captions', async () => {
            const longCaption = 'A'.repeat(5000);
            const response = await request(app)
                .post('/api/posts')
                .send({
                    type: 'IMAGE',
                    caption: longCaption,
                    platform: 'INSTAGRAM'
                });

            expect(response.status).toBe(201);
            expect(response.body.data.caption).toBe(longCaption);
        });

        test('should handle special characters in caption', async () => {
            const specialCaption = '🍕🎉 Special #offer @restaurant 50% off! 💰';
            const response = await request(app)
                .post('/api/posts')
                .send({
                    type: 'IMAGE',
                    caption: specialCaption,
                    platform: 'INSTAGRAM'
                });

            expect(response.status).toBe(201);
            expect(response.body.data.caption).toBe(specialCaption);
        });
    });
});
