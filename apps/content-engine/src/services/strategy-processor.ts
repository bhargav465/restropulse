/**
 * Strategy Processor
 *
 * processPendingCycles: cycles in PENDING_GENERATION get a draft summary +
 * plannedPosts + focus from the content generator, then advance to PENDING_APPROVAL.
 *
 * Activation (APPROVED -> ACTIVE) is handled by the rolling-window processor
 * once the cycle's startDate enters the 48h window.
 */

import {
  getStrategyCyclesCollection,
  findRestaurantById,
} from '@restropulse/db';
import { createLogger } from '@restropulse/telemetry/server';
import { getContentGenerator, ContentGenerationError } from './content-generator/index.js';

const logger = createLogger('content-engine:strategy-processor');

export function parseDateOrFallback(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return new Date(fallback);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(fallback);
  }

  return parsed;
}

export function parseBestTime(value: unknown): { hours: number; minutes: number } {
  if (typeof value !== 'string') {
    return { hours: 10, minutes: 0 };
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hours: 10, minutes: 0 };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return { hours: 10, minutes: 0 };
  }

  return { hours, minutes };
}

/**
 * Draft new cycles by asking the generator for summary + plannedPosts + focus.
 * Looks for cycles with status PENDING_GENERATION.
 */
export async function processPendingCycles(): Promise<{ processed: number; failed: number }> {
  const cyclesCol = getStrategyCyclesCollection();
  const generator = getContentGenerator();
  const stats = { processed: 0, failed: 0 };

  const pendingCycles = await cyclesCol.find({ status: 'PENDING_GENERATION' }).toArray();

  if (pendingCycles.length === 0) {
    return stats;
  }

  logger.info(
    { count: pendingCycles.length, generator: generator.name },
    'Found cycles pending draft generation',
  );

  for (const cycleDoc of pendingCycles) {
    const cycleId = cycleDoc._id.toString();

    try {
      const restaurant = cycleDoc.restaurantId
        ? await findRestaurantById(cycleDoc.restaurantId)
        : null;

      const draft = await generator.draftCycle(
        {
          period: cycleDoc.period || '',
          strategyFocus: Array.isArray(cycleDoc.strategyFocus)
            ? (cycleDoc.strategyFocus as string[])
            : undefined,
        },
        {
          correlationId: cycleId,
          restaurantId: cycleDoc.restaurantId,
          restaurantName: restaurant?.name,
        },
      );

      const result = await cyclesCol.updateOne(
        { _id: cycleDoc._id, status: 'PENDING_GENERATION' },
        {
          $set: {
            status: 'PENDING_APPROVAL',
            summary: draft.summary,
            plannedPosts: draft.plannedPosts,
            focus: draft.focus,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        logger.warn({ cycleId }, 'Cycle no longer in PENDING_GENERATION; skipping advance');
        continue;
      }

      logger.info({ cycleId, generator: generator.name }, 'Drafted cycle');
      stats.processed++;
    } catch (error) {
      if (error instanceof ContentGenerationError) {
        logger.error({ cycleId, code: error.code, err: error }, 'Cycle draft failed');
      } else {
        logger.error({ cycleId, err: error }, 'Failed to draft cycle');
      }
      stats.failed++;
    }
  }

  return stats;
}

