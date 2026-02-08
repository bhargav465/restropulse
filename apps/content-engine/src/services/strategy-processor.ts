/**
 * Strategy Processor
 *
 * Handles two jobs:
 *   1. Process approved strategy cycles -- generate posts for each day in the cycle
 *   2. Process strategy generation requests -- create strategies from user input
 */

import {
  getPostsCollection,
  getStrategyCyclesCollection,
  getContentStrategiesCollection,
  findRestaurantById,
} from '@restropulse/db';
import type { PostType } from '@restropulse/shared';
import { generateContent, generateCycleContent } from './content-generator.js';

/**
 * Process approved strategy cycles that need content generated.
 * Looks for cycles with status APPROVED that don't yet have posts linked.
 */
export async function processApprovedCycles(): Promise<{ processed: number; failed: number }> {
  const cyclesCol = getStrategyCyclesCollection();
  const postsCol = getPostsCollection();
  const stats = { processed: 0, failed: 0 };

  // Find approved cycles that haven't been processed yet
  const approvedCycles = await cyclesCol
    .find({
      status: 'APPROVED',
      contentGenerated: { $ne: true },
    })
    .toArray();

  if (approvedCycles.length === 0) {
    return stats;
  }

  console.log(`[Content Engine] Found ${approvedCycles.length} approved cycles needing content generation`);

  for (const cycleDoc of approvedCycles) {
    const cycleId = cycleDoc._id.toString();
    const restaurantId = cycleDoc.restaurantId;

    try {
      // Get restaurant info for context
      const restaurant = restaurantId ? await findRestaurantById(restaurantId) : null;

      // Get the content strategy for posting frequency
      const strategiesCol = getContentStrategiesCollection();
      const strategy = await strategiesCol.findOne({ restaurantId });

      const postsPerWeek = strategy?.postsPerWeek || 3;
      const themes = cycleDoc.focus || ['Food & Menu', 'Offers', 'Behind the Scenes'];
      const contentTypes: PostType[] = ['IMAGE', 'CAROUSEL', 'REEL'];

      // Generate content for the cycle
      const contents = await generateCycleContent({
        startDate: cycleDoc.startDate,
        endDate: cycleDoc.endDate,
        postsPerWeek,
        themes,
        contentTypes,
        restaurantName: restaurant?.name,
      });

      // Calculate posting schedule
      const start = new Date(cycleDoc.startDate);
      const daysBetweenPosts = Math.floor(7 / postsPerWeek);

      // Create posts in the database
      for (let i = 0; i < contents.length; i++) {
        const content = contents[i];
        const postDate = new Date(start);
        postDate.setDate(postDate.getDate() + i * daysBetweenPosts);

        // Set posting time to strategy's bestTime or default 10:00 AM
        const bestTime = strategy?.bestTime || '10:00';
        const [hours, minutes] = bestTime.split(':').map(Number);
        postDate.setHours(hours, minutes, 0, 0);

        const type = contentTypes[i % contentTypes.length];

        await postsCol.insertOne({
          type,
          status: 'PENDING_APPROVAL',
          caption: content.caption,
          thumbnail: content.thumbnail,
          mediaUrls: content.mediaUrls || null,
          videoUrl: content.videoUrl || null,
          platform: 'BOTH',
          restaurantId,
          strategyId: cycleId,
          isAdhoc: false,
          scheduledFor: postDate.toISOString(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Mark cycle as content generated
      await cyclesCol.updateOne(
        { _id: cycleDoc._id },
        {
          $set: {
            contentGenerated: true,
            status: 'ACTIVE',
            updatedAt: new Date(),
          },
        },
      );

      console.log(`[Content Engine] Generated ${contents.length} posts for cycle ${cycleId}`);
      stats.processed++;
    } catch (error) {
      console.error(`[Content Engine] Failed to process cycle ${cycleId}:`, error);
      stats.failed++;
    }
  }

  return stats;
}

/**
 * Process strategy generation requests.
 * Looks for strategy cycles with status PENDING_GENERATION.
 */
export async function processStrategyRequests(): Promise<{ processed: number; failed: number }> {
  const cyclesCol = getStrategyCyclesCollection();
  const stats = { processed: 0, failed: 0 };

  const pendingCycles = await cyclesCol
    .find({ status: 'PENDING_GENERATION' })
    .toArray();

  if (pendingCycles.length === 0) {
    return stats;
  }

  console.log(`[Content Engine] Found ${pendingCycles.length} strategy generation requests`);

  for (const cycleDoc of pendingCycles) {
    const cycleId = cycleDoc._id.toString();

    try {
      // TODO: Use AI to generate strategy recommendations based on restaurant profile
      // For now, create a basic strategy structure

      const themes = ['Food & Menu', 'Chef Specials', 'Behind the Scenes', 'Customer Stories', 'Offers'];
      const plannedPosts = themes.slice(0, 3).map((category) => ({
        category,
        count: 2,
      }));

      await cyclesCol.updateOne(
        { _id: cycleDoc._id },
        {
          $set: {
            status: 'PENDING_APPROVAL',
            summary: `Content strategy for ${cycleDoc.period}: ${themes.slice(0, 3).join(', ')} focus`,
            plannedPosts,
            focus: themes.slice(0, 3),
            updatedAt: new Date(),
          },
        },
      );

      console.log(`[Content Engine] Generated strategy for cycle ${cycleId}`);
      stats.processed++;
    } catch (error) {
      console.error(`[Content Engine] Failed to generate strategy for ${cycleId}:`, error);
      stats.failed++;
    }
  }

  return stats;
}
