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
import { loadAndValidateEnv, z } from '@restropulse/shared';
import { connectDB, disconnectDB } from '@restropulse/db';
import { createLogger, shutdownServerTelemetry } from '@restropulse/telemetry/server';
import { createSecretsProvider, hydrateEnvFromProvider } from '@restropulse/secrets';
import { CONTENT_ENGINE_SECRET_KEYS } from '../../../config/secrets-manifest.js';
import { processAdhocRequests } from './services/adhoc-processor.js';
import { processApprovedCycles, processStrategyRequests } from './services/strategy-processor.js';
import { startAssetServer } from './services/asset-server.js';

const logger = createLogger('content-engine');

if (process.env.SECRETS_BACKEND) {
  await hydrateEnvFromProvider(
    createSecretsProvider(process.env.SECRETS_BACKEND),
    CONTENT_ENGINE_SECRET_KEYS,
  );
}

const env = loadAndValidateEnv({
  serviceName: 'content-engine',
  envPath: path.resolve(process.cwd(), '.env'),
  schema: z.object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z.string().min(1).default('restropulse'),
    ASSET_SERVER_PORT: z.coerce.number().int().positive().default(3002),
    ASSET_SERVER_BASE_URL: z.string().url().optional(),
    SECRETS_BACKEND: z.enum(['env', 'azure-kv']).default('env'),
    AZURE_KEY_VAULT_URL: z.string().url().optional(),
    AZURE_KEY_VAULT_KEY_PREFIX: z.string().optional(),
  }).passthrough(),
});

const ASSET_PORT = env.ASSET_SERVER_PORT;

async function runContentJob(): Promise<void> {
  logger.info({ timestamp: new Date().toISOString() }, 'Running content generation job');

  try {
    // Process adhoc post requests
    const adhocStats = await processAdhocRequests();
    if (adhocStats.processed > 0 || adhocStats.failed > 0) {
      logger.info({ processed: adhocStats.processed, failed: adhocStats.failed }, 'Adhoc processing complete');
    }

    // Process approved strategy cycles
    const cycleStats = await processApprovedCycles();
    if (cycleStats.processed > 0 || cycleStats.failed > 0) {
      logger.info({ processed: cycleStats.processed, failed: cycleStats.failed }, 'Cycle processing complete');
    }

    // Process strategy generation requests
    const strategyStats = await processStrategyRequests();
    if (strategyStats.processed > 0 || strategyStats.failed > 0) {
      logger.info({ processed: strategyStats.processed, failed: strategyStats.failed }, 'Strategy processing complete');
    }
  } catch (error) {
    logger.error({ err: error }, 'Content generation job failed');
  }
}

let assetServer: http.Server | null = null;

const startWorker = async () => {
  try {
    logger.info({ environment: process.env.NODE_ENV || 'development' }, 'RestroPulse Content Engine starting');

    await connectDB();

    // Start local asset server for placeholder media
    assetServer = startAssetServer(ASSET_PORT);

    // Poll for content generation work every 2 minutes
    cron.schedule('*/2 * * * *', async () => {
      await runContentJob();
    }, {
      timezone: 'Asia/Kolkata',
    });

    logger.info({ assetServerUrl: `http://localhost:${ASSET_PORT}`, pollInterval: '2 minutes' }, 'Content engine is running -- Processes: adhoc posts, strategy cycles, strategy generation');

    // Run initial check in development
    if (process.env.NODE_ENV === 'development') {
      logger.info('Development mode: Running initial check in 5 seconds...');
      setTimeout(async () => {
        await runContentJob();
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
