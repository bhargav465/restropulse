/**
 * @restropulse/content-engine - Worker Entry Point
 *
 * Standalone worker process that polls for content generation work:
 *   1. Adhoc post requests (status: PENDING_CONTENT) -- every 2 minutes
 *   2. Approved strategy cycles needing posts -- every 5 minutes
 *   3. Strategy generation requests (status: PENDING_GENERATION) -- every 5 minutes
 *
 * This worker runs independently of the API server and publisher.
 * It connects to the same MongoDB database and reads/writes post and cycle data.
 *
 * Usage:
 *   npm run dev   -- development with hot-reload (tsx watch)
 *   npm run start -- production (node dist/worker.js)
 */

import 'dotenv/config';
import cron from 'node-cron';
import { connectDB, disconnectDB } from '@restropulse/db';
import { processAdhocRequests } from './services/adhoc-processor.js';
import { processApprovedCycles, processStrategyRequests } from './services/strategy-processor.js';

async function runContentJob(): Promise<void> {
  console.log(`[Content Engine] Running content generation job at ${new Date().toISOString()}`);

  try {
    // Process adhoc post requests
    const adhocStats = await processAdhocRequests();
    if (adhocStats.processed > 0 || adhocStats.failed > 0) {
      console.log(`[Content Engine] Adhoc: ${adhocStats.processed} processed, ${adhocStats.failed} failed`);
    }

    // Process approved strategy cycles
    const cycleStats = await processApprovedCycles();
    if (cycleStats.processed > 0 || cycleStats.failed > 0) {
      console.log(`[Content Engine] Cycles: ${cycleStats.processed} processed, ${cycleStats.failed} failed`);
    }

    // Process strategy generation requests
    const strategyStats = await processStrategyRequests();
    if (strategyStats.processed > 0 || strategyStats.failed > 0) {
      console.log(`[Content Engine] Strategies: ${strategyStats.processed} processed, ${strategyStats.failed} failed`);
    }
  } catch (error) {
    console.error('[Content Engine] Job failed:', error);
  }
}

const startWorker = async () => {
  try {
    console.log(`
  RestroPulse Content Engine
  
  Environment: ${process.env.NODE_ENV || 'development'}
  Database: Connecting...
`);

    await connectDB();

    // Poll for content generation work every 2 minutes
    cron.schedule('*/2 * * * *', async () => {
      await runContentJob();
    }, {
      timezone: 'Asia/Kolkata',
    });

    console.log(`  Content engine is running.
  - Content generation poll: every 2 minutes
  - Processes: adhoc posts, strategy cycles, strategy generation
`);

    // Run initial check in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Content Engine] Development mode: Running initial check in 5 seconds...');
      setTimeout(async () => {
        await runContentJob();
      }, 5000);
    }
  } catch (error) {
    console.error('[Content Engine] Failed to start worker:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Content Engine] Shutting down gracefully...');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Content Engine] Shutting down gracefully...');
  await disconnectDB();
  process.exit(0);
});

startWorker();
