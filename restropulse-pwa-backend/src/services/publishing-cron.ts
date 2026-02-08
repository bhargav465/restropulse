/**
 * Publishing Cron Service
 * Automatically publishes scheduled posts when their scheduled time arrives.
 * Runs every 5 minutes to check for posts due for publishing.
 *
 * Flow:
 *   1. Query posts with status SCHEDULED and scheduledFor <= now
 *   2. For each post, look up the restaurant's Instagram credentials
 *   3. Call the publishing service to publish to Instagram/Facebook
 *   4. Update post status to POSTED (success) or MISSED_DEADLINE (permanent failure)
 *   5. Track retry attempts for transient failures
 */

import cron from 'node-cron';
import { getPostsCollection, getRestaurantsCollection, toApiFormat } from '../db/connection.js';
import { publishPost, PublishResult } from './publishing-service.js';
import { Post } from '../models/types.js';

// Constants
const MAX_PUBLISH_ATTEMPTS = 3;
const CRON_SCHEDULE = '*/5 * * * *'; // Every 5 minutes

// Track publishing attempts for monitoring
interface PublishAttempt {
    postId: string;
    restaurantId: string;
    timestamp: Date;
    success: boolean;
    platform: string;
    error?: string;
    instagramMediaId?: string;
    facebookPostId?: string;
}

const publishAttempts: PublishAttempt[] = [];

/**
 * Get scheduled posts that are due for publishing.
 * Returns posts with status SCHEDULED whose scheduledFor time has passed.
 * Excludes posts with PUBLISHING status to avoid race conditions.
 */
export async function getPostsDueForPublishing(): Promise<any[]> {
    const col = getPostsCollection();
    const now = new Date();

    const posts = await col.find({
        status: 'SCHEDULED',
        scheduledFor: { $lte: now.toISOString() },
        $or: [
            { publishAttempts: { $exists: false } },
            { publishAttempts: { $lt: MAX_PUBLISH_ATTEMPTS } }
        ]
    }).sort({ scheduledFor: 1 }).toArray();

    return posts;
}

/**
 * Get restaurant credentials for publishing.
 * Returns the restaurant document with Instagram credentials.
 */
export async function getRestaurantCredentials(restaurantId: string): Promise<any | null> {
    const col = getRestaurantsCollection();
    const restaurant = await col.findOne({
        _id: restaurantId as any,
        'instagramCredentials.accessToken': { $exists: true, $ne: null }
    });

    return restaurant;
}

/**
 * Process a single post for publishing.
 * Handles the full lifecycle: credential lookup, publish, status update.
 */
export async function processPostForPublishing(postDoc: any): Promise<boolean> {
    const postsCol = getPostsCollection();
    const postId = postDoc._id.toString();
    const restaurantId = postDoc.restaurantId;
    const currentAttempts = postDoc.publishAttempts || 0;

    console.log(`[Publishing Cron] Processing post ${postId} (attempt ${currentAttempts + 1}/${MAX_PUBLISH_ATTEMPTS})`);

    // Atomically mark post as PUBLISHING to prevent race conditions
    const updateResult = await postsCol.findOneAndUpdate(
        {
            _id: postDoc._id,
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

    // If update failed, post is already being processed or status changed
    if (!updateResult) {
        console.log(`[Publishing Cron] Post ${postId} is already being processed or status changed, skipping`);
        return false;
    }

    // Validate restaurant ID exists
    if (!restaurantId) {
        console.error(`[Publishing Cron] Post ${postId} has no restaurantId, marking as MISSED_DEADLINE`);
        await postsCol.updateOne(
            { _id: postDoc._id },
            {
                $set: {
                    status: 'MISSED_DEADLINE',
                    publishError: 'No restaurant associated with this post',
                    updatedAt: new Date()
                },
                $inc: { publishAttempts: 1 }
            }
        );
        return false;
    }

    // Get restaurant credentials
    const restaurant = await getRestaurantCredentials(restaurantId);
    if (!restaurant || !restaurant.instagramCredentials) {
        console.error(`[Publishing Cron] No Instagram credentials for restaurant ${restaurantId}`);

        const newAttempts = currentAttempts + 1;
        const isFinalAttempt = newAttempts >= MAX_PUBLISH_ATTEMPTS;

        await postsCol.updateOne(
            { _id: postDoc._id },
            {
                $set: {
                    ...(isFinalAttempt ? { status: 'MISSED_DEADLINE' } : {}),
                    publishError: 'Instagram not connected. Please connect Instagram in Settings.',
                    updatedAt: new Date()
                },
                $inc: { publishAttempts: 1 }
            }
        );

        publishAttempts.push({
            postId,
            restaurantId,
            timestamp: new Date(),
            success: false,
            platform: postDoc.platform || 'INSTAGRAM',
            error: 'No Instagram credentials'
        });

        return false;
    }

    // Prepare post data for publishing
    const publishablePost = {
        id: postId,
        type: postDoc.type || 'IMAGE',
        caption: postDoc.caption || '',
        thumbnail: postDoc.thumbnail || '',
        mediaUrls: postDoc.mediaUrls,
        videoUrl: postDoc.videoUrl,
        platform: postDoc.platform || 'INSTAGRAM'
    };

    const credentials = {
        userId: restaurant.instagramCredentials.userId,
        pageId: restaurant.instagramCredentials.pageId,
        accessToken: restaurant.instagramCredentials.accessToken
    };

    // Publish the post
    const results = await publishPost(publishablePost, credentials);

    // Determine overall success
    const igSuccess = !results.instagram || results.instagram.success;
    const fbSuccess = !results.facebook || results.facebook.success;
    const overallSuccess = igSuccess && fbSuccess;

    // Check if any failures are retryable
    const igRetryable = results.instagram && !results.instagram.success && results.instagram.retryable;
    const fbRetryable = results.facebook && !results.facebook.success && results.facebook.retryable;
    const anyRetryable = igRetryable || fbRetryable;

    const newAttempts = currentAttempts + 1;
    const isFinalAttempt = newAttempts >= MAX_PUBLISH_ATTEMPTS;

    if (overallSuccess) {
        // Success - update post status
        console.log(`[Publishing Cron] Post ${postId} published successfully`);

        // Ensure database update completes before returning
        const updateResult = await postsCol.updateOne(
            { _id: postDoc._id },
            {
                $set: {
                    status: 'POSTED',
                    postedAt: new Date().toISOString(),
                    publishAttempts: newAttempts,
                    publishError: null,
                    instagramMediaId: results.instagram?.instagramMediaId || null,
                    facebookPostId: results.facebook?.facebookPostId || null,
                    updatedAt: new Date()
                }
            }
        );

        if (updateResult.modifiedCount === 0) {
            console.warn(`[Publishing Cron] Warning: Post ${postId} database update may have failed`);
        }

        publishAttempts.push({
            postId,
            restaurantId,
            timestamp: new Date(),
            success: true,
            platform: publishablePost.platform,
            instagramMediaId: results.instagram?.instagramMediaId,
            facebookPostId: results.facebook?.facebookPostId
        });

        return true;
    } else {
        // Failure
        const errorMessages: string[] = [];
        if (results.instagram && !results.instagram.success) {
            errorMessages.push(`Instagram: ${results.instagram.error}`);
        }
        if (results.facebook && !results.facebook.success) {
            errorMessages.push(`Facebook: ${results.facebook.error}`);
        }
        const combinedError = errorMessages.join('; ');

        console.error(`[Publishing Cron] Post ${postId} publish failed: ${combinedError}`);

        // If not retryable or final attempt, mark as MISSED_DEADLINE
        const shouldFail = isFinalAttempt || !anyRetryable;

        // Ensure database update completes before returning
        const updateResult = await postsCol.updateOne(
            { _id: postDoc._id },
            {
                $set: {
                    status: shouldFail ? 'MISSED_DEADLINE' : 'SCHEDULED',
                    publishError: combinedError,
                    updatedAt: new Date()
                },
                $inc: { publishAttempts: 1 }
            }
        );

        if (updateResult.modifiedCount === 0) {
            console.warn(`[Publishing Cron] Warning: Post ${postId} failure status update may have failed`);
        }

        if (shouldFail) {
            console.error(`[Publishing Cron] Post ${postId} permanently failed after ${newAttempts} attempts`);
        } else {
            console.log(`[Publishing Cron] Post ${postId} will be retried (attempt ${newAttempts}/${MAX_PUBLISH_ATTEMPTS})`);
        }

        publishAttempts.push({
            postId,
            restaurantId,
            timestamp: new Date(),
            success: false,
            platform: publishablePost.platform,
            error: combinedError
        });

        return false;
    }
}

/**
 * Run the publishing job - processes all posts due for publishing.
 */
export async function runPublishingJob(): Promise<{ published: number; failed: number; skipped: number }> {
    console.log(`[Publishing Cron] Starting publishing job at ${new Date().toISOString()}`);

    const stats = { published: 0, failed: 0, skipped: 0 };

    try {
        const posts = await getPostsDueForPublishing();

        if (posts.length === 0) {
            console.log('[Publishing Cron] No posts due for publishing');
            return stats;
        }

        console.log(`[Publishing Cron] Found ${posts.length} posts due for publishing`);

        for (const postDoc of posts) {
            try {
                const success = await processPostForPublishing(postDoc);
                if (success) {
                    stats.published++;
                } else {
                    stats.failed++;
                }
            } catch (error) {
                console.error(`[Publishing Cron] Unexpected error processing post ${postDoc._id}:`, error);
                stats.failed++;
            }

            // Small delay between publishes to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log(`[Publishing Cron] Completed: ${stats.published} published, ${stats.failed} failed`);
    } catch (error) {
        console.error('[Publishing Cron] Job failed:', error);
    }

    return stats;
}

/**
 * Get recent publishing attempts for monitoring.
 */
export function getRecentPublishAttempts(limit: number = 50): PublishAttempt[] {
    return publishAttempts.slice(-limit);
}

/**
 * Start the publishing cron job.
 * Runs every 5 minutes to check for scheduled posts due for publishing.
 */
export function startPublishingCron(): void {
    const job = cron.schedule(CRON_SCHEDULE, async () => {
        await runPublishingJob();
    }, {
        timezone: 'Asia/Kolkata'
    });

    console.log('[Publishing Cron] Cron job scheduled: Every 5 minutes');

    // In development, run initial check after a short delay
    if (process.env.NODE_ENV === 'development') {
        console.log('[Publishing Cron] Development mode: Running initial check in 10 seconds...');
        setTimeout(async () => {
            await runPublishingJob();
        }, 10000);
    }
}

/**
 * Manually trigger the publishing job (for admin/testing).
 */
export async function triggerManualPublish(): Promise<{ published: number; failed: number; skipped: number }> {
    console.log('[Publishing Cron] Manual publish triggered');
    return await runPublishingJob();
}
