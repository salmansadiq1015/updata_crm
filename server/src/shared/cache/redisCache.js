import logger from '../logger/index.js';

/**
 * L2 Distributed cache (Redis).
 *
 * Purpose: shared cache across all API instances.
 * Used for: entity caches, file metadata, list results.
 *
 * Graceful degradation: if Redis is down, all methods return null/false
 * and log a warning. The system falls through to MongoDB — slower but functional.
 */
export class RedisCache {
  constructor(redisClient) {
    this.client = redisClient;
  }

  async get(key) {
    try {
      const data = await this.client.get(key);
      if (data === null) return null;
      return JSON.parse(data);
    } catch (err) {
      logger.warn('L2 cache GET failed (degraded)', {
        module: 'cache:l2',
        action: 'get',
        key,
        error: { message: err.message },
      });
      return null;
    }
  }

  async set(key, value, ttl = 300) {
    try {
      const serialized = JSON.stringify(value);
      if (ttl > 0) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (err) {
      logger.warn('L2 cache SET failed (degraded)', {
        module: 'cache:l2',
        action: 'set',
        key,
        error: { message: err.message },
      });
      return false;
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
      return true;
    } catch (err) {
      logger.warn('L2 cache DEL failed (degraded)', {
        module: 'cache:l2',
        action: 'del',
        key,
        error: { message: err.message },
      });
      return false;
    }
  }

  /**
   * Pattern-based invalidation.
   * Uses SCAN (not KEYS) to avoid blocking Redis on large keyspaces.
   */
  async invalidatePattern(pattern) {
    try {
      let cursor = '0';
      let totalDeleted = 0;
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          // Strip keyPrefix before deleting since ioredis adds it automatically
          const strippedKeys = keys.map((k) => {
            const prefix = this.client.options?.keyPrefix || '';
            return k.startsWith(prefix) ? k.slice(prefix.length) : k;
          });
          await this.client.del(...strippedKeys);
          totalDeleted += keys.length;
        }
      } while (cursor !== '0');

      logger.info('L2 cache pattern invalidation', {
        module: 'cache:l2',
        action: 'invalidatePattern',
        pattern,
        keysDeleted: totalDeleted,
      });
      return totalDeleted;
    } catch (err) {
      logger.warn('L2 cache pattern invalidation failed', {
        module: 'cache:l2',
        action: 'invalidatePattern',
        pattern,
        error: { message: err.message },
      });
      return 0;
    }
  }

  async flush() {
    try {
      await this.client.flushdb();
      return true;
    } catch (err) {
      logger.warn('L2 cache FLUSH failed', {
        module: 'cache:l2',
        action: 'flush',
        error: { message: err.message },
      });
      return false;
    }
  }
}

export default RedisCache;
