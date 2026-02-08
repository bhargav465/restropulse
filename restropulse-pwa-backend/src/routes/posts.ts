import express, { Request, Response } from 'express';
import { findAllPosts, findPostById, createPost, updatePost, deletePost } from '../db/posts.js';
import { getPostsCollection, getRestaurantsCollection } from '../db/connection.js';
import { publishPost } from '../services/publishing-service.js';
import { triggerManualPublish, getRecentPublishAttempts } from '../services/publishing-cron.js';
import { ApiResponse, Post } from '../models/types.js';

const router = express.Router();

// Get all posts
router.get('/', async (_req: Request, res: Response<ApiResponse<Post[]>>) => {
    try {
        const posts = await findAllPosts();
        res.json({
            success: true,
            data: posts
        });
    } catch (error) {
        console.error('Get posts error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Trigger manual publishing of all due posts (admin endpoint)
// NOTE: This route must be defined before /:id to avoid matching 'actions' as an id
router.post('/actions/publish-all', async (_req: Request, res: Response<ApiResponse>) => {
    try {
        const stats = await triggerManualPublish();
        res.json({
            success: true,
            data: stats,
            message: `Publishing complete: ${stats.published} published, ${stats.failed} failed`
        });
    } catch (error) {
        console.error('Manual publish error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get recent publishing activity (monitoring endpoint)
router.get('/actions/publish-log', async (_req: Request, res: Response<ApiResponse>) => {
    try {
        const attempts = getRecentPublishAttempts();
        res.json({
            success: true,
            data: attempts
        });
    } catch (error) {
        console.error('Get publish log error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Get post by ID
router.get('/:id', async (req: Request, res: Response<ApiResponse<Post>>) => {
    try {
        const { id } = req.params;
        const post = await findPostById(id);

        if (post) {
            res.json({
                success: true,
                data: post
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }
    } catch (error) {
        console.error('Get post error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Create new post (supports both strategy-generated and adhoc posts)
router.post('/', async (req: Request, res: Response<ApiResponse<Post>>) => {
    try {
        const postData = req.body;

        // Validate required fields
        if (!postData.caption || postData.caption.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Caption is required'
            });
        }

        // Set defaults for adhoc posts
        // Use picsum for placeholder images when no thumbnail provided
        const placeholderImage = `https://picsum.photos/seed/${Date.now()}/400/400`;

        const postWithDefaults = {
            type: postData.type || 'IMAGE',
            status: postData.status || 'PENDING_APPROVAL',
            platform: postData.platform || 'INSTAGRAM',
            thumbnail: postData.thumbnail || placeholderImage,
            ...postData,
            // Ensure restaurantId is always set (currently single-restaurant app)
            restaurantId: postData.restaurantId || 'r1',
            // Mark as adhoc if no strategyId
            isAdhoc: !postData.strategyId,
        };

        const newPost = await createPost(postWithDefaults);
        res.status(201).json({
            success: true,
            data: newPost,
            message: 'Post created successfully'
        });
    } catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Update post
router.put('/:id', async (req: Request, res: Response<ApiResponse<Post>>) => {
    try {
        const { id } = req.params;
        const post = await updatePost(id, req.body);

        if (post) {
            res.json({
                success: true,
                data: post,
                message: 'Post updated successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }
    } catch (error) {
        console.error('Update post error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Diagnostic: dry-run publish that returns full results without updating DB
// Use this to test the CDN upload + IG container flow in isolation
router.post('/:id/test-publish', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const post = await findPostById(id);

        if (!post) {
            return res.status(404).json({ success: false, error: 'Post not found' });
        }

        const restaurantId = (post as any).restaurantId;
        if (!restaurantId) {
            return res.status(400).json({ success: false, error: 'Post has no restaurantId' });
        }

        const restaurantsCol = getRestaurantsCollection();
        const restaurant = await restaurantsCol.findOne({ _id: restaurantId as any });

        if (!restaurant?.instagramCredentials) {
            return res.status(400).json({ success: false, error: 'Instagram not connected' });
        }

        const credentials = {
            userId: restaurant.instagramCredentials.userId,
            pageId: restaurant.instagramCredentials.pageId,
            accessToken: restaurant.instagramCredentials.accessToken
        };

        const publishablePost = {
            id: post.id,
            type: post.type,
            caption: post.caption,
            thumbnail: post.thumbnail,
            mediaUrls: post.mediaUrls,
            videoUrl: post.videoUrl,
            platform: post.platform
        };

        console.log('[Test Publish] Starting diagnostic publish for post', id);
        console.log('[Test Publish] Post data:', JSON.stringify(publishablePost, null, 2));
        console.log('[Test Publish] Credentials: userId=%s, pageId=%s, tokenLength=%d',
            credentials.userId, credentials.pageId, credentials.accessToken?.length || 0);

        const startTime = Date.now();
        const results = await publishPost(publishablePost, credentials);
        const duration = Date.now() - startTime;

        console.log('[Test Publish] Results:', JSON.stringify(results, null, 2));
        console.log(`[Test Publish] Duration: ${duration}ms`);

        // Return full raw results -- do NOT update the DB
        return res.json({
            success: true,
            message: 'Diagnostic publish complete (DB NOT updated)',
            duration: `${duration}ms`,
            post: publishablePost,
            results
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error('[Test Publish] Unhandled error:', message, stack);
        return res.status(500).json({
            success: false,
            error: message,
            stack: process.env.NODE_ENV === 'development' ? stack : undefined
        });
    }
});

// Publish a specific post immediately (manual trigger)
router.post('/:id/publish', async (req: Request, res: Response<ApiResponse>) => {
    try {
        const { id } = req.params;
        const post = await findPostById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }

        // Only allow publishing SCHEDULED or MISSED_DEADLINE posts
        if (post.status !== 'SCHEDULED' && post.status !== 'MISSED_DEADLINE') {
            return res.status(400).json({
                success: false,
                error: `Cannot publish a post with status ${post.status}. Post must be SCHEDULED or MISSED_DEADLINE.`
            });
        }

        // Get restaurant credentials from the post's restaurantId
        const restaurantId = (post as any).restaurantId;
        if (!restaurantId) {
            return res.status(400).json({
                success: false,
                error: 'Post has no associated restaurant'
            });
        }

        const restaurantsCol = getRestaurantsCollection();
        const restaurant = await restaurantsCol.findOne({ _id: restaurantId as any });

        if (!restaurant?.instagramCredentials) {
            return res.status(400).json({
                success: false,
                error: 'Instagram not connected. Please connect Instagram in Settings first.'
            });
        }

        const credentials = {
            userId: restaurant.instagramCredentials.userId,
            pageId: restaurant.instagramCredentials.pageId,
            accessToken: restaurant.instagramCredentials.accessToken
        };

        const publishablePost = {
            id: post.id,
            type: post.type,
            caption: post.caption,
            thumbnail: post.thumbnail,
            mediaUrls: post.mediaUrls,
            videoUrl: post.videoUrl,
            platform: post.platform
        };

        const results = await publishPost(publishablePost, credentials);

        const igSuccess = !results.instagram || results.instagram.success;
        const fbSuccess = !results.facebook || results.facebook.success;
        const overallSuccess = igSuccess && fbSuccess;

        if (overallSuccess) {
            // Update post status to POSTED
            const postsCol = getPostsCollection();
            await postsCol.updateOne(
                { _id: id as any },
                {
                    $set: {
                        status: 'POSTED',
                        postedAt: new Date().toISOString(),
                        publishError: null,
                        instagramMediaId: results.instagram?.instagramMediaId || null,
                        facebookPostId: results.facebook?.facebookPostId || null,
                        updatedAt: new Date()
                    },
                    $inc: { publishAttempts: 1 }
                }
            );

            const updatedPost = await findPostById(id);
            return res.json({
                success: true,
                data: updatedPost,
                message: 'Post published successfully'
            });
        } else {
            const errors: string[] = [];
            if (results.instagram && !results.instagram.success) {
                errors.push(`Instagram: ${results.instagram.error}`);
            }
            if (results.facebook && !results.facebook.success) {
                errors.push(`Facebook: ${results.facebook.error}`);
            }

            return res.status(502).json({
                success: false,
                error: `Publishing failed: ${errors.join('; ')}`
            });
        }
    } catch (error) {
        console.error('Publish post error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Delete post
router.delete('/:id', async (req: Request, res: Response<ApiResponse>) => {
    try {
        const { id } = req.params;
        const deleted = await deletePost(id);

        if (deleted) {
            res.json({
                success: true,
                message: 'Post deleted successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Post not found'
            });
        }
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

export default router;
