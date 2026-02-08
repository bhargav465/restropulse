import express, { Request, Response } from 'express';
import { findAllPosts, findPostById, createPost, updatePost, deletePost } from '../db/posts.js';
import { getPostsCollection, getRestaurantsCollection, toObjectId } from '../db/connection.js';
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

// Generate post with AI-created content (for adhoc posts)
router.post('/generate', async (req: Request, res: Response<ApiResponse<Post>>) => {
    try {
        const { concept, type, platform, scheduledFor } = req.body;

        // Validate required fields
        if (!concept || concept.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Concept/description is required'
            });
        }

        if (!type) {
            return res.status(400).json({
                success: false,
                error: 'Post type is required'
            });
        }

        console.log(`[Content Generation] Creating ${type} post for: ${concept.substring(0, 50)}...`);

        // TODO: Replace with actual AI content generation service
        // For now, generate placeholder media based on type
        const seed = Date.now();
        const placeholderImage = `https://picsum.photos/seed/${seed}/1080/1080`;

        // IMPORTANT: This placeholder video URL may not work with Facebook's API
        // Facebook requires videos to be:
        // 1. Publicly accessible
        // 2. In supported formats (MP4, MOV)
        // 3. Hosted on reliable servers
        // Replace with actual video generation service in production
        const placeholderVideo = `https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4`;

        let thumbnail: string;
        let videoUrl: string | undefined;
        let mediaUrls: string[] | undefined;

        switch (type) {
            case 'REEL':
            case 'STORY':
            case 'VIDEO':
                // Video content types - use actual video URL
                thumbnail = placeholderImage;
                videoUrl = placeholderVideo;
                console.log(`[Content Generation] Generated video content with URL: ${videoUrl}`);
                break;

            case 'CAROUSEL':
                // Multiple images for carousel
                thumbnail = placeholderImage;
                mediaUrls = [
                    `https://picsum.photos/seed/${seed}/1080/1080`,
                    `https://picsum.photos/seed/${seed + 1}/1080/1080`,
                    `https://picsum.photos/seed/${seed + 2}/1080/1080`
                ];
                console.log(`[Content Generation] Generated carousel with ${mediaUrls.length} images`);
                break;

            case 'IMAGE':
            default:
                // Single image
                thumbnail = placeholderImage;
                console.log(`[Content Generation] Generated image content`);
                break;
        }

        // Create the post with generated content
        const postData = {
            type: type as Post['type'],
            status: 'PENDING_APPROVAL' as const,
            platform: platform || 'INSTAGRAM',
            caption: concept,
            thumbnail,
            videoUrl,
            mediaUrls,
            restaurantId: 'r1',
            scheduledFor: scheduledFor || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            isAdhoc: true
        };

        const newPost = await createPost(postData);

        console.log(`[Content Generation] Post created successfully: ${newPost.id}`);

        res.status(201).json({
            success: true,
            data: newPost,
            message: 'Post generated with content successfully'
        });
    } catch (error) {
        console.error('Generate post error:', error);
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
    const postsCol = getPostsCollection();
    let postId: string | null = null;

    try {
        const { id } = req.params;
        postId = id;
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

        // Atomically mark post as PUBLISHING to prevent race conditions with cron
        // Try SCHEDULED first, then MISSED_DEADLINE (workaround for test DB operator issues)
        let updateResult = await postsCol.findOneAndUpdate(
            {
                _id: toObjectId(id) as any,
                status: 'SCHEDULED'
            },
            {
                $set: {
                    status: 'PUBLISHING',
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );

        // If not SCHEDULED, try MISSED_DEADLINE
        if (!updateResult) {
            updateResult = await postsCol.findOneAndUpdate(
                {
                    _id: toObjectId(id) as any,
                    status: 'MISSED_DEADLINE'
                },
                {
                    $set: {
                        status: 'PUBLISHING',
                        updatedAt: new Date()
                    }
                },
                { returnDocument: 'after' }
            );
        }

        // If update failed, another process is already publishing this post
        if (!updateResult) {
            return res.status(409).json({
                success: false,
                error: 'Post is already being published or status changed'
            });
        }

        // Get restaurant credentials from the post's restaurantId
        const restaurantId = (post as any).restaurantId;
        if (!restaurantId) {
            // Update DB with error before returning
            await postsCol.updateOne(
                { _id: toObjectId(id) as any },
                {
                    $set: {
                        status: 'MISSED_DEADLINE',
                        publishError: 'Post has no associated restaurant',
                        updatedAt: new Date()
                    },
                    $inc: { publishAttempts: 1 }
                }
            );
            return res.status(400).json({
                success: false,
                error: 'Post has no associated restaurant'
            });
        }

        const restaurantsCol = getRestaurantsCollection();
        const restaurant = await restaurantsCol.findOne({ _id: restaurantId as any });

        if (!restaurant?.instagramCredentials) {
            // Update DB with error before returning
            await postsCol.updateOne(
                { _id: toObjectId(id) as any },
                {
                    $set: {
                        status: 'SCHEDULED',
                        publishError: 'Instagram not connected. Please connect Instagram in Settings first.',
                        updatedAt: new Date()
                    },
                    $inc: { publishAttempts: 1 }
                }
            );
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

        // Publish the post
        const results = await publishPost(publishablePost, credentials);

        const igSuccess = !results.instagram || results.instagram.success;
        const fbSuccess = !results.facebook || results.facebook.success;
        const overallSuccess = igSuccess && fbSuccess;

        if (overallSuccess) {
            // Update post status to POSTED
            await postsCol.updateOne(
                { _id: toObjectId(id) as any },
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

            // Ensure DB update completes before responding
            const updatedPost = await findPostById(id);
            return res.json({
                success: true,
                data: updatedPost,
                message: 'Post published successfully'
            });
        } else {
            // Publishing failed - check if retryable
            const errors: string[] = [];
            const retryableFailures: boolean[] = [];

            if (results.instagram && !results.instagram.success) {
                errors.push(`Instagram: ${results.instagram.error}`);
                retryableFailures.push(results.instagram.retryable || false);
            }
            if (results.facebook && !results.facebook.success) {
                errors.push(`Facebook: ${results.facebook.error}`);
                retryableFailures.push(results.facebook.retryable || false);
            }

            const anyRetryable = retryableFailures.some(r => r);
            const combinedError = errors.join('; ');

            // Update DB with failure status
            await postsCol.updateOne(
                { _id: toObjectId(id) as any },
                {
                    $set: {
                        status: anyRetryable ? 'SCHEDULED' : 'MISSED_DEADLINE',
                        publishError: combinedError,
                        updatedAt: new Date()
                    },
                    $inc: { publishAttempts: 1 }
                }
            );

            return res.status(502).json({
                success: false,
                error: `Publishing failed: ${combinedError}. ${anyRetryable ? 'Will retry automatically.' : 'Manual intervention required.'}`
            });
        }
    } catch (error) {
        console.error('Publish post error:', error);

        // Ensure we revert the PUBLISHING status on unexpected errors
        if (postId) {
            try {
                await postsCol.updateOne(
                    { _id: toObjectId(postId) as any, status: 'PUBLISHING' },
                    {
                        $set: {
                            status: 'SCHEDULED',
                            publishError: 'Unexpected error during publishing',
                            updatedAt: new Date()
                        },
                        $inc: { publishAttempts: 1 }
                    }
                );
            } catch (dbError) {
                console.error('Failed to revert PUBLISHING status:', dbError);
            }
        }

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
