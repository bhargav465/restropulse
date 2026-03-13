/**
 * Telemetry bootstrap -- MUST be the first import in server.ts.
 *
 * Initializes Azure Monitor OpenTelemetry auto-instrumentation
 * (Express, MongoDB, HTTP) and the structured pino logger.
 */

import { initServerTelemetry, initLogger } from '@restropulse/telemetry/server';

const environment = process.env.NODE_ENV || 'development';

initServerTelemetry({
    serviceName: 'api',
    environment,
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
    samplingRatio: environment === 'production' ? 0.1 : 1.0,
});

initLogger({
    serviceName: 'api',
    environment,
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || (environment === 'development' ? 'debug' : 'info'),
});
