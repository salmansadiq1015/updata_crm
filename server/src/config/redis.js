import Redis from 'ioredis';
import config from './index.js';

/**
 * Redis client (ioredis) — used for:
 * 1. L2 distributed cache (CacheManager)
 * 2. Rate limiting (sliding window counters)
 * 3. BullMQ job queue backend
 * 4. Session store (future)
 *
 * ioredis over node-redis: built-in reconnection, Cluster support,
 * Lua scripting, and better TypeScript ergonomics.
 *
 * We export a factory so BullMQ can create its own connections
 * (BullMQ requires separate client connections per queue).
 */

let sharedClient = null;

export function createRedisClient(logger, options = {}) {
  const client = new Redis(config.redis.url, {
    password: config.redis.password || undefined,
    db: config.redis.db,
    keyPrefix: options.keyPrefix ?? config.redis.keyPrefix,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times) {
      // Exponential backoff: 50ms, 100ms, 200ms... max 30s
      const delay = Math.min(times * 50, 30000);
      return delay;
    },
    ...options,
  });

  client.on('connect', () => {
    logger.info('Redis connected', { module: 'redis', action: 'connect' });
  });

  client.on('error', (err) => {
    logger.error('Redis connection error', {
      module: 'redis',
      action: 'error',
      error: { message: err.message },
    });
  });

  client.on('close', () => {
    logger.warn('Redis connection closed', { module: 'redis', action: 'close' });
  });

  return client;
}

export function getRedisClient(logger) {
  if (!sharedClient) {
    // HTTP requests and startup must settle when Redis is unavailable.
    // BullMQ uses separate connections and retains its unlimited retry policy.
    sharedClient = createRedisClient(logger, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 3000,
    });
  }
  return sharedClient;
}

export function waitForRedisReady(client, timeoutMS = 5000) {
  if (client.status === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      client.removeListener('ready', onReady);
      client.removeListener('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = (error) => finish(error);
    const timer = setTimeout(() => finish(new Error('Redis readiness timed out')), timeoutMS);
    client.once('ready', onReady);
    client.once('error', onError);
  });
}

export async function disconnectRedis(logger) {
  if (sharedClient) {
    await sharedClient.quit();
    sharedClient = null;
    logger.info('Redis disconnected gracefully', { module: 'redis', action: 'disconnect' });
  }
}

export function isRedisConnected() {
  return sharedClient?.status === 'ready';
}

export default { createRedisClient, getRedisClient, disconnectRedis, isRedisConnected };
