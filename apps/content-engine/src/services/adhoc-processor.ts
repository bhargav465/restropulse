/**
 * Adhoc Post Processor
 *
 * Polls for posts with status PENDING_CONTENT and generates content for them.
 * These are posts created by users via the API's /posts/generate endpoint.
 */

import { getPostsCollection } from '@restropulse/db';
import type { PostType, Platform } from '@restropulse/shared';
import { createLogger } from '@restropulse/telemetry/server';
import { generateContent } from './content-generator.js';

const logger = createLogger('content-engine:adhoc-processor');

export async function processAdhocRequests(): Promise<{ processed: number; failed: number }> {
  const col = getPostsCollection();
  const stats = { processed: 0, failed: 0 };

  const pendingPosts = await col
    .find({ status: 'PENDING_CONTENT' })
    .sort({ createdAt: 1 })
    .toArray();

  if (pendingPosts.length === 0) {
    return stats;
  }

  logger.info({ count: pendingPosts.length }, 'Found adhoc posts pending content generation');

  for (const postDoc of pendingPosts) {
    const postId = postDoc._id.toString();

    try {
      // Generate content based on post metadata
      const content = await generateContent({
        concept: postDoc.caption || postDoc.concept || '',
        type: (postDoc.type as PostType) || 'IMAGE',
        platforms: (postDoc.platforms as Platform[]) || ['INSTAGRAM'],
      });

      // Update the post with generated content and advance status
      await col.updateOne(
        { _id: postDoc._id },
        {
          $set: {
            caption: content.caption,
            thumbnail: content.thumbnail,
            mediaUrls: content.mediaUrls || null,
            videoUrl: content.videoUrl || null,
            status: 'PENDING_APPROVAL',
            updatedAt: new Date(),
          },
        },
      );

      logger.info({ postId }, 'Generated content for post');
      stats.processed++;
    } catch (error) {
      logger.error({ postId, err: error }, 'Failed to generate content for post');
      stats.failed++;
    }
  }

  return stats;
}
