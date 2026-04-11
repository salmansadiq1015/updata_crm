import mongoose from 'mongoose';
import config from './index.js';

/**
 * MongoDB connection with optimized pool settings.
 *
 * Pool sizing rationale:
 * - maxPoolSize 10: single API instance handles ~10 concurrent DB ops.
 *   At 5 instances = 50 connections total, well within Atlas / standalone limits.
 * - minPoolSize 2: keeps warm connections to avoid cold-start latency.
 * - serverSelectionTimeoutMS 5000: fail fast if DB unreachable (health check depends on this).
 * - socketTimeoutMS 45000: allow long-running aggregations (analytics).
 */
const POOL_OPTIONS = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4, // Force IPv4 — avoids DNS resolution delays on dual-stack hosts
};

let isConnected = false;

export async function connectDatabase(logger) {
  if (isConnected) return;

  try {
    mongoose.set('strictQuery', true);

    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('MongoDB connected', { module: 'database', action: 'connect' });
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', {
        module: 'database',
        action: 'error',
        error: { message: err.message, stack: err.stack },
      });
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected', { module: 'database', action: 'disconnect' });
    });

    await mongoose.connect(config.db.uri, POOL_OPTIONS);
  } catch (err) {
    logger.error('MongoDB initial connection failed', {
      module: 'database',
      action: 'connect',
      error: { message: err.message, stack: err.stack },
    });
    throw err;
  }
}

export async function disconnectDatabase(logger) {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB disconnected gracefully', { module: 'database', action: 'disconnect' });
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

export default { connectDatabase, disconnectDatabase, isDatabaseConnected };
