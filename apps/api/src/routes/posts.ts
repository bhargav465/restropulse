import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { findAllPosts, findPostById, createPosts, deletePostsByGroupId, updatePost, deletePost, getPostsCollection, getRestaurantsCollection, toObjectId, findActiveSubscription, deductCredits } from '@restropulse/db';
import { publishPost, applyPublishResult, triggerManualPublish, getRecentPublishAttempts } from '@restropulse/publishing';
import { ApiResponse, Post, isPostPastApprovalDeadline, Platform } from '@restropulse/shared';
import { handle } from '../middleware/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import { enforcePlanLimits } from '../middleware/enforce-plan-limits.js';
import { createLogger } from '@restropulse/telemetry/server';

const log = createLogger('posts');

/** Default platforms derived from ENABLED_PLATFORMS env var (same logic as content-engine). */
function getDefaultPlatforms(): Platform[] {
    return (process.env.ENABLED_PLATFORMS ?? 'INSTAGRAM,FACEBOOK')
        .split(',')
        .map(p => p.trim())
        .filter((p): p is Platform => p === 'INSTAGRAM' || p === 'FACEBOOK');
}

const router = express.Router();

// Get all posts
router.get('/', requireAuth, handle(async (req: Request, res: Response<ApiResponse<Post[]>>) => {
    const posts = await findAllPosts(req.user!.restaurantId);
    res.json({
        success: true,
        data: posts
    });
}));

// Trigger manual publishing of all due posts (admin endpoint)
// NOTE: This route must be defined before /:id to avoid matching 'actions' as an id
router.post('/actions/publish-all', handle(async (_req: Request, res: Response<ApiResponse>) => {
    const stats = await triggerManualPublish();
    res.json({
        success: true,
        data: stats,
        message: `Publishing complete: ${stats.published} published, ${stats.failed} failed`
    });
}));

// Get recent publishing activity (monitoring endpoint)
router.get('/actions/publish-log', handle(async (_req: Request, res: Response<ApiResponse>) => {
    const attempts = getRecentPublishAttempts();
    res.json({
        success: true,
        data: attempts
    });
}));

// Get post by ID
router.get('/:id', handle(async (req: Request, res: Response<ApiResponse<Post>>) => {
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
}));

// Create new post(s) (supports both strategy-generated and adhoc posts).
// A request may target multiple platforms; each platform becomes its own
// single-platform Post document, sharing a groupId for traceability and a
// single credit charge (charged once per request, not per resulting post).
router.post('/', requireAuth, enforcePlanLimits, handle(async (req: Request, res: Response<ApiResponse<Post[]>>) => {
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
    const targetPlatforms: Platform[] = postData.platforms || getDefaultPlatforms();
    const groupId = randomUUID();
    const { platforms: _requestPlatforms, ...postDataWithoutPlatforms } = postData;

    const docs = targetPlatforms.map((platform) => ({
        type: postData.type || 'IMAGE',
        status: postData.status || 'PENDING_APPROVAL',
        thumbnail: postData.thumbnail || placeholderImage,
        ...postDataWithoutPlatforms,
        platform,
        groupId,
        // Ensure restaurantId is always set from auth context
        restaurantId: req.user!.restaurantId,
        // Mark as adhoc if no cycleId
        isAdhoc: !postData.cycleId,
    }));

    let newPosts: Post[];
    try {
        newPosts = await createPosts(docs);
    } catch (err) {
        await deletePostsByGroupId(groupId);
        throw err;
    }

    // Deduct credits if middleware flagged it -- once per request, regardless
    // of how many platform-posts were created.
    if (req.creditCost) {
        const sub = await findActiveSubscription(req.user!.restaurantId);
        if (sub) {
            await deductCredits(sub.id, req.creditCost);
        }
    }

    res.status(201).json({
        success: true,
        data: newPosts,
        message: `${newPosts.length} post${newPosts.length === 1 ? '' : 's'} created successfully`
    });
}));

// Create adhoc post stub(s) for content generation by the content-engine.
// A request may target multiple platforms; each becomes its own single-platform
// PENDING_CONTENT post sharing a groupId. The content-engine picks up each one
// independently and calls generator.generatePost(concept, type, platform) to
// fill caption + media, then advances it to PENDING_APPROVAL for user review.
router.post('/generate', requireAuth, enforcePlanLimits, handle(async (req: Request, res: Response<ApiResponse<Post[]>>) => {
    const { concept, type, platforms, scheduledFor, asap } = req.body;

    if (!concept || concept.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Concept/description is required' });
    }

    if (!type) {
        return res.status(400).json({ success: false, error: 'Post type is required' });
    }

    const minAheadMins = parseInt(process.env.MIN_SCHEDULE_AHEAD_MINS ?? '150', 10);

    let resolvedScheduledFor: string;

    if (asap || !scheduledFor) {
        // API computes the time from its own clock — immune to client/server clock skew and
        // network latency. Used for all ASAP posts and as the fallback when no time is given.
        resolvedScheduledFor = new Date(Date.now() + minAheadMins * 60 * 1000).toISOString();
    } else {
        const provided = new Date(scheduledFor);
        const minScheduledFor = new Date(Date.now() + minAheadMins * 60 * 1000);
        if (isNaN(provided.getTime()) || provided < minScheduledFor) {
            const minDisplay = minAheadMins % 60 === 0
                ? `${minAheadMins / 60} hour${minAheadMins / 60 === 1 ? '' : 's'}`
                : minAheadMins >= 60
                    ? `${minAheadMins / 60} hours`
                    : `${minAheadMins} minute${minAheadMins === 1 ? '' : 's'}`;
            return res.status(400).json({
                success: false,
                error: `Posts must be scheduled at least ${minDisplay} from now`,
            });
        }
        resolvedScheduledFor = provided.toISOString();
    }

    const targetPlatforms: Platform[] = platforms || getDefaultPlatforms();
    const groupId = randomUUID();

    log.info({ type, concept: concept.substring(0, 50), platformCount: targetPlatforms.length }, 'Queueing adhoc post(s) for content generation');

    const docs = targetPlatforms.map((platform) => ({
        type: type as Post['type'],
        status: 'PENDING_CONTENT' as const,
        platform,
        groupId,
        concept: concept.trim(),
        caption: '',
        thumbnail: '',
        restaurantId: req.user!.restaurantId,
        scheduledFor: resolvedScheduledFor,
        isAdhoc: true,
    }));

    let newPosts: Post[];
    try {
        newPosts = await createPosts(docs);
    } catch (err) {
        await deletePostsByGroupId(groupId);
        throw err;
    }

    // Deduct credits if middleware flagged it -- once per request, regardless
    // of how many platform-posts were created.
    if (req.creditCost) {
        const sub = await findActiveSubscription(req.user!.restaurantId);
        if (sub) {
            await deductCredits(sub.id, req.creditCost);
        }
    }

    log.info({ postIds: newPosts.map(p => p.id), groupId }, 'Adhoc post stub(s) created, queued for content-engine');

    res.status(201).json({
        success: true,
        data: newPosts,
        message: `${newPosts.length} post${newPosts.length === 1 ? '' : 's'} queued for content generation`,
    });
}));

// Update post
router.put('/:id', requireAuth, handle(async (req: Request, res: Response<ApiResponse<Post>>) => {
    const { id } = req.params;

    // Block CHANGES_REQUESTED transitions past the approval deadline.
    // Approval transitions (APPROVED/SCHEDULED) remain allowed so the
    // content-engine's auto-advance can proceed without racing the UI.
    if (req.body?.status === 'CHANGES_REQUESTED') {
        const existing = await findPostById(id);
        const postBufferHours = parseInt(process.env.POST_APPROVAL_BUFFER_MINS ?? '120', 10) / 60;
        if (existing && isPostPastApprovalDeadline(existing, new Date(), postBufferHours)) {
            return res.status(409).json({
                success: false,
                error: 'Post is past the approval deadline'
            });
        }
    }

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
}));

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
        const restaurant = await restaurantsCol.findOne({ _id: toObjectId(restaurantId) as any });

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

        log.info({ postId: id }, 'Starting diagnostic publish');
        log.debug({ post: publishablePost }, 'Test publish post data');
        log.debug({ userId: credentials.userId, pageId: credentials.pageId, tokenLength: credentials.accessToken?.length || 0 }, 'Test publish credentials');

        const startTime = Date.now();
        const result = await publishPost(publishablePost, credentials);
        const duration = Date.now() - startTime;

        log.debug({ result }, 'Test publish result');
        log.info({ postId: id, durationMs: duration }, 'Test publish completed');

        // Return full raw result -- do NOT update the DB
        return res.json({
            success: true,
            message: 'Diagnostic publish complete (DB NOT updated)',
            duration: `${duration}ms`,
            post: publishablePost,
            result
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        log.error({ err: message, stack }, 'Test publish unhandled error');
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
        const restaurant = await restaurantsCol.findOne({ _id: toObjectId(restaurantId) as any });

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
        const result = await publishPost(publishablePost, credentials);
        const applied = applyPublishResult(result);

        if (result.success) {
            // Update post status to POSTED
            await postsCol.updateOne(
                { _id: toObjectId(id) as any },
                {
                    $set: {
                        status: applied.status,
                        postedAt: new Date().toISOString(),
                        publishError: applied.publishError,
                        externalPostId: applied.externalPostId,
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
            // Update DB with failure status
            await postsCol.updateOne(
                { _id: toObjectId(id) as any },
                {
                    $set: {
                        status: applied.status,
                        publishError: applied.publishError,
                        updatedAt: new Date()
                    },
                    $inc: { publishAttempts: 1 }
                }
            );

            return res.status(502).json({
                success: false,
                error: `Publishing failed: ${result.error}. ${applied.status === 'SCHEDULED' ? 'Will retry automatically.' : 'Manual intervention required.'}`
            });
        }
    } catch (error) {
        log.error({ err: error }, 'Publish post error');

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
                log.error({ err: dbError, postId }, 'Failed to revert PUBLISHING status');
            }
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Delete post
router.delete('/:id', requireAuth, handle(async (req: Request, res: Response<ApiResponse>) => {
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
}));

export default router;
