import config from './index.js';

/**
 * BullMQ connection config.
 *
 * BullMQ requires its own Redis connections (separate from cache).
 * We export the connection options; QueueManager creates connections.
 *
 * maxRetriesPerRequest must be null for BullMQ compatibility.
 */
export const queueConnection = {
  host: new URL(config.redis.url).hostname || '127.0.0.1',
  port: parseInt(new URL(config.redis.url).port || '6379', 10),
  password: config.redis.password || undefined,
  db: config.redis.db,
  maxRetriesPerRequest: null,
};

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 30000, // 30s initial, then 60s, 120s
  },
  removeOnComplete: {
    age: 86400, // 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 604800, // 7 days
  },
};

export const queueConfig = {
  prefix: config.queue.prefix,
};

export default { queueConnection, defaultJobOptions, queueConfig };
