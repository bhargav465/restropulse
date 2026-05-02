/**
 * @restropulse/content-engine - Worker Entry Point
 *
 * Standalone worker process that polls for content generation work:
 *   1. Adhoc post requests (status: PENDING_CONTENT) -- every 2 minutes
 *   2. Approved strategy cycles needing posts -- every 5 minutes
 *   3. Strategy generation requests (status: PENDING_GENERATION) -- every 5 minutes
 *
 * Also starts a local HTTP server to serve placeholder media assets
 * so that generated content URLs resolve correctly for the publishing service.
 *
 * This worker runs independently of the API server and publisher.
 * It connects to the same MongoDB database and reads/writes post and cycle data.
 *
 * Usage:
 *   npm run dev   -- development with hot-reload (tsx watch)
 *   npm run start -- production (node dist/worker.js)
 *
 * First-time setup:
 *   npm run download-assets  -- download placeholder images and videos to assets/
 */

import './instrument.js';

import http from 'node:http';
import path from 'node:path';
import cron from 'node-cron';
import { loadAndValidateEnv, z, ROLLING_WINDOW_HOURS, POST_APPROVAL_BUFFER_HOURS, CYCLE_APPROVAL_BUFFER_HOURS, validateTimingConstraints } from '@restropulse/shared';
import { connectDB, disconnectDB } from '@restropulse/db';
import { createLogger, shutdownServerTelemetry } from '@restropulse/telemetry/server';
import { processPendingPosts } from './services/adhoc-processor.js';
import { processPendingCycles } from './services/strategy-processor.js';
import { processRollingWindow } from './services/rolling-window/processor.js';
import { processRevisions } from './services/revision-processor.js';
import { processDeadlines } from './services/deadline-processor.js';
import { startAssetServer } from './services/asset-server.js';
import {
  PlaceholderContentGenerator,
  setContentGenerator,
} from './services/content-generator/index.js';

const logger = createLogger('content-engine');

const env = loadAndValidateEnv({
  serviceName: 'content-engine',
  envPath: path.resolve(process.cwd(), '.env'),
  schema: z.object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z.string().min(1).default('restropulse'),
    ASSET_SERVER_PORT: z.coerce.number().int().positive().default(3002),
    ASSET_SERVER_BASE_URL: z.string().url().optional(),
    // Time window configuration in MINUTES — easier to set small values for testing.
    // Default values mirror the shared constants (converted to mins).
    // node-cron v4 supports 6-field cron (seconds) for the CRON_* vars:
    //   5-field: */2 * * * *   = every 2 minutes  (production)
    //   6-field: */30 * * * * * = every 30 seconds (local testing)
    ROLLING_WINDOW_MINS: z.coerce.number().positive().default(ROLLING_WINDOW_HOURS * 60),
    POST_APPROVAL_BUFFER_MINS: z.coerce.number().positive().default(POST_APPROVAL_BUFFER_HOURS * 60),
    CYCLE_APPROVAL_BUFFER_MINS: z.coerce.number().positive().default(CYCLE_APPROVAL_BUFFER_HOURS * 60),
    // Per-processor cron schedules.
    CRON_PENDING_POSTS: z.string().default('*/2 * * * *'),
    CRON_PENDING_CYCLES: z.string().default('*/2 * * * *'),
    CRON_ROLLING_WINDOW: z.string().default('*/2 * * * *'),
    CRON_REVISIONS: z.string().default('*/2 * * * *'),
    CRON_DEADLINES: z.string().default('*/2 * * * *'),
    ENABLED_PLATFORMS: z.string().default('INSTAGRAM,FACEBOOK'),
  }).passthrough(),
});

validateTimingConstraints({
  postApprovalBufferMins: env.POST_APPROVAL_BUFFER_MINS,
  rollingWindowMins: env.ROLLING_WINDOW_MINS,
  cycleApprovalBufferMins: env.CYCLE_APPROVAL_BUFFER_MINS,
});

const ASSET_PORT = env.ASSET_SERVER_PORT;

const rollingWindowConfig = { rollingWindowHours: env.ROLLING_WINDOW_MINS / 60 };
const deadlineConfig = {
  postApprovalBufferHours: env.POST_APPROVAL_BUFFER_MINS / 60,
  cycleApprovalBufferHours: env.CYCLE_APPROVAL_BUFFER_MINS / 60,
};

function schedule(cronExpr: string, name: string, job: () => Promise<unknown>): void {
  cron.schedule(cronExpr, async () => {
    try {
      await job();
    } catch (error) {
      logger.error({ err: error, processor: name }, 'Processor job failed');
    }
  }, { timezone: 'Asia/Kolkata' });
}

async function runAllProcessors(): Promise<void> {
  await processPendingPosts();
  await processPendingCycles();
  await processRollingWindow(rollingWindowConfig);
  await processRevisions();
  await processDeadlines(deadlineConfig);
}

let assetServer: http.Server | null = null;

const startWorker = async () => {
  try {
    logger.info({ environment: process.env.NODE_ENV || 'development' }, 'RestroPulse Content Engine starting');

    await connectDB();

    // Register the default content generator backend. Tests swap this via setContentGenerator().
    setContentGenerator(new PlaceholderContentGenerator());
    logger.info({ generator: 'placeholder' }, 'Content generator registered');

    // Start local asset server for placeholder media
    assetServer = startAssetServer(ASSET_PORT);

    // Schedule each processor independently so their frequencies can be tuned via env.
    schedule(env.CRON_PENDING_POSTS,   'pending-posts',   () => processPendingPosts());
    schedule(env.CRON_PENDING_CYCLES,  'pending-cycles',  () => processPendingCycles());
    schedule(env.CRON_ROLLING_WINDOW,  'rolling-window',  () => processRollingWindow(rollingWindowConfig));
    schedule(env.CRON_REVISIONS,       'revisions',       () => processRevisions());
    schedule(env.CRON_DEADLINES,       'deadlines',       () => processDeadlines(deadlineConfig));

    logger.info(
      {
        assetServerUrl: `http://localhost:${ASSET_PORT}`,
        rollingWindowMins: env.ROLLING_WINDOW_MINS,
        postApprovalBufferMins: env.POST_APPROVAL_BUFFER_MINS,
        cycleApprovalBufferMins: env.CYCLE_APPROVAL_BUFFER_MINS,
        schedules: {
          pendingPosts: env.CRON_PENDING_POSTS,
          pendingCycles: env.CRON_PENDING_CYCLES,
          rollingWindow: env.CRON_ROLLING_WINDOW,
          revisions: env.CRON_REVISIONS,
          deadlines: env.CRON_DEADLINES,
        },
      },
      'Content engine is running',
    );

    // Run all processors once immediately in development so local smoke tests
    // do not need to wait for the first cron tick.
    if (process.env.NODE_ENV === 'development') {
      logger.info('Development mode: Running initial check in 5 seconds...');
      setTimeout(async () => {
        await runAllProcessors();
      }, 5000);
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to start worker');
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  assetServer?.close();
  await disconnectDB();
  await shutdownServerTelemetry();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  assetServer?.close();
  await disconnectDB();
  await shutdownServerTelemetry();
  process.exit(0);
});

startWorker();
