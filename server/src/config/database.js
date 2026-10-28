import mongoose from 'mongoose';
import { setTimeout as delay } from 'node:timers/promises';
import config from './index.js';

/**
 * MongoDB connection with optimized pool settings.
 *
 * Pool sizing rationale:
 * - maxPoolSize 10: single API instance handles ~10 concurrent DB ops.
 *   At 5 instances = 50 connections total, well within Atlas / standalone limits.
 * - minPoolSize 2: keeps warm connections to avoid cold-start latency.
 * - serverSelectionTimeoutMS: bound each startup attempt (10s by default).
 * - socketTimeoutMS 45000: allow long-running aggregations (analytics).
 */
const POOL_OPTIONS = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: config.db.serverSelectionTimeoutMS,
  socketTimeoutMS: 45000,
  family: 4, // Force IPv4 — avoids DNS resolution delays on dual-stack hosts
};

let connectionPromise;
let listenersAttached = false;
let hasConnected = false;

function redact(value) {
  return String(value).replace(/mongodb(?:\+srv)?:\/\/[^\s'"<>]+/gi, '[REDACTED_MONGODB_URI]');
}

function errorSummary(error) {
  return {
    name: error?.name,
    message: redact(error?.message ?? 'Unknown database error'),
    code: error?.code,
    ...(error?.cause ? { cause: redact(error.cause.message) } : {}),
  };
}

function errorDetails(error) {
  return {
    ...errorSummary(error),
    stack: error.stack ? redact(error.stack) : undefined,
    topology: error.reason?.type,
    // Mongoose's Atlas message is generic. The per-server errors distinguish
    // DNS, TCP and TLS failures without exposing the connection URI.
    servers: [...(error.reason?.servers?.values() ?? [])].map((server) => ({
      address: server.address,
      type: server.type,
      ...(server.error ? { error: errorSummary(server.error) } : {}),
    })),
  };
}

function isRetryable(error) {
  const serverErrors = [...(error.reason?.servers?.values() ?? [])].map((s) => s.error);
  if ([error, error.cause, ...serverErrors].some((e) => e?.code === 18 || e?.codeName === 'AuthenticationFailed')) {
    return false;
  }
  return ['MongooseServerSelectionError', 'MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError'].includes(error.name)
    || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ETIMEOUT'].includes(error.code);
}

export function connectDatabase(logger) {
  if (isDatabaseConnected()) return Promise.resolve();
  if (connectionPromise) return connectionPromise;

  hasConnected = false;
  mongoose.set('strictQuery', true);
  if (!listenersAttached) {
    mongoose.connection.on('connected', () => {
      hasConnected = true;
      logger.info('MongoDB connected', { module: 'database', action: 'connect' });
    });

    mongoose.connection.on('error', (err) => {
      // Mongoose can emit an initial error after connect() has rejected.
      // The retry loop already logs those failures with topology details.
      if (!hasConnected || connectionPromise) return;
      logger.error('MongoDB connection error', {
        module: 'database',
        action: 'error',
        error: errorDetails(err),
      });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected', { module: 'database', action: 'disconnect' });
    });
    listenersAttached = true;
  }

  connectionPromise = connectWithRetry(logger).finally(() => {
    connectionPromise = undefined;
  });
  return connectionPromise;
}

async function connectWithRetry(logger) {
  for (let attempt = 1; attempt <= config.db.connectAttempts; attempt += 1) {
    try {
      await mongoose.connect(config.db.uri, POOL_OPTIONS);
      return;
    } catch (err) {
      const retry = attempt < config.db.connectAttempts && isRetryable(err);
      logger[retry ? 'warn' : 'error'](
        retry ? 'MongoDB connection failed; retrying' : 'MongoDB initial connection failed',
        {
          module: 'database',
          action: 'connect',
          attempt,
          maxAttempts: config.db.connectAttempts,
          ...(retry ? { retryDelayMS: config.db.connectRetryDelayMS } : {}),
          error: errorDetails(err),
          ...(/mongodb\.net(?=[:/?]|$)/i.test(config.db.uri) ? {
            hint: 'Check Atlas cluster availability, the current public IP in Network Access, outbound connectivity, and DNS/TLS. The Atlas server-selection message alone does not confirm an IP access-list problem.',
          } : {}),
        },
      );
      if (!retry) throw err;
      await delay(config.db.connectRetryDelayMS);
    }
  }
}

export async function disconnectDatabase(logger) {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected gracefully', { module: 'database', action: 'disconnect' });
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

export default { connectDatabase, disconnectDatabase, isDatabaseConnected };
