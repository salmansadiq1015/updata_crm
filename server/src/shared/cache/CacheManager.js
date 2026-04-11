import l1Cache from './nodeCache.js';
import { RedisCache } from './redisCache.js';
import logger from '../logger/index.js';

/**
 * Two-layer cache manager.
 *
 * Lookup path: L1 (NodeCache) → L2 (Redis) → DB
 * Write path:  DB → L2 (Redis) → L1 (NodeCache)
 *
 * Cache layers:
 * - L1: in-process, zero latency, per-instance (warm-up cache)
 * - L2: distributed, ~1ms latency, shared across instances
 *
 * Metrics hooks: hit/miss counters for Prometheus.
 */
class CacheManager {
  constructor() {
    this.l1 = l1Cache;
    this.l2 = null;
    this._metrics = { l1Hits: 0, l1Misses: 0, l2Hits: 0, l2Misses: 0 };
  }

  /**
   * Initialize L2 with a Redis client.
   * Called during server bootstrap after Redis connects.
   */
  initL2(redisClient) {
    this.l2 = new RedisCache(redisClient);
    logger.info('CacheManager L2 (Redis) initialized', { module: 'cache' });
  }

  /**
   * Get a value from cache.
   * Checks L1 first, then L2. Populates lower layers on miss.
   *
   * @param {string} key - Cache key
   * @param {object} options - { l1Ttl, l2Ttl, skipL1 }
   */
  async get(key, options = {}) {
    // L1 lookup
    if (!options.skipL1) {
      const l1Value = this.l1.get(key);
      if (l1Value !== null) {
        this._metrics.l1Hits++;
        return l1Value;
      }
      this._metrics.l1Misses++;
    }

    // L2 lookup
    if (this.l2) {
      const l2Value = await this.l2.get(key);
      if (l2Value !== null) {
        this._metrics.l2Hits++;
        // Backfill L1
        if (!options.skipL1) {
          this.l1.set(key, l2Value, options.l1Ttl || 60);
        }
        return l2Value;
      }
      this._metrics.l2Misses++;
    }

    return null;
  }

  /**
   * Set a value in cache.
   * Writes to both L1 and L2 by default.
   *
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {object} options - { l1Ttl (seconds), l2Ttl (seconds), skipL1, skipL2 }
   */
  async set(key, value, options = {}) {
    const l1Ttl = options.l1Ttl ?? 60;
    const l2Ttl = options.l2Ttl ?? 300;

    if (!options.skipL1) {
      this.l1.set(key, value, l1Ttl);
    }

    if (this.l2 && !options.skipL2) {
      await this.l2.set(key, value, l2Ttl);
    }
  }

  /**
   * Delete a key from both cache layers.
   */
  async del(key) {
    this.l1.del(key);
    if (this.l2) {
      await this.l2.del(key);
    }
  }

  /**
   * Invalidate keys matching a pattern (L2 only — L1 doesn't support patterns).
   * Also flushes L1 entirely for the safest invalidation.
   */
  async invalidatePattern(pattern) {
    // L1: no pattern support, so we flush related keys manually
    // For simplicity, we flush all L1 (acceptable given short TTLs)
    this.l1.flush();

    if (this.l2) {
      return this.l2.invalidatePattern(pattern);
    }
    return 0;
  }

  /**
   * Get-or-set pattern (cache-aside).
   * If cache miss, calls fetchFn to get data, caches result, returns it.
   */
  async getOrSet(key, fetchFn, options = {}) {
    const cached = await this.get(key, options);
    if (cached !== null) return cached;

    const value = await fetchFn();
    if (value !== null && value !== undefined) {
      await this.set(key, value, options);
    }
    return value;
  }

  getMetrics() {
    return { ...this._metrics, l1Stats: this.l1.stats() };
  }

  resetMetrics() {
    this._metrics = { l1Hits: 0, l1Misses: 0, l2Hits: 0, l2Misses: 0 };
  }
}

// Singleton
const cacheManager = new CacheManager();
export default cacheManager;
