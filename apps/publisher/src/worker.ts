/**
 * @restropulse/publisher - Worker Entry Point
 *
 * Standalone worker process that handles:
 *   1. Publishing scheduled posts to Instagram/Facebook (every 5 minutes)
 *   2. Refreshing expiring Instagram tokens (daily at 2 AM IST)
 *
 * This worker runs independently of the API server.
 * It connects to the same MongoDB database and reads/writes post statuses.
 *
 * Usage:
 *   npm run dev   -- development with hot-reload (tsx watch)
 *   npm run start -- production (node dist/worker.js)
 */

import path from 'node:path';
import { loadAndValidateEnv, z } from '@restropulse/shared';
import { connectDB, disconnectDB } from '@restropulse/db';
import { startPublishingCron, startTokenRefreshCron } from '@restropulse/publishing';

loadAndValidateEnv({
  serviceName: 'publisher',
  envPath: path.resolve(process.cwd(), '.env'),
  schema: z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z.string().min(1).default('restropulse'),
    INSTAGRAM_APP_ID: z.string().min(1),
    INSTAGRAM_APP_SECRET: z.string().min(1),
    ENCRYPTION_KEY: z.string().regex(/^[A-Fa-f0-9]{64}$/),
    INSTAGRAM_REDIRECT_URI: z.string().url().optional(),
  }).passthrough(),
});

const startWorker = async () => {
  try {
    console.log(`
  RestroPulse Publisher Worker
  
  Environment: ${process.env.NODE_ENV || 'development'}
  Database: Connecting...
`);

    await connectDB();

    // Start cron jobs
    startPublishingCron();
    startTokenRefreshCron();

    console.log(`  Publisher worker is running.
  - Publishing cron: every 5 minutes
  - Token refresh cron: daily at 2:00 AM IST
`);
  } catch (error) {
    console.error('[Publisher] Failed to start worker:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Publisher] Shutting down gracefully...');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Publisher] Shutting down gracefully...');
  await disconnectDB();
  process.exit(0);
});

startWorker();
