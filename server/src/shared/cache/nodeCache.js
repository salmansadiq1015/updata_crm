import NodeCache from 'node-cache';
import logger from '../logger/index.js';

/**
 * L1 In-process cache (NodeCache).
 *
 * Purpose: ultra-hot reads with zero network latency.
 * Used for: health check results, config values, permission lookups.
 *
 * Tradeoff: not shared across instances. Only cache data where
 * brief staleness (< TTL seconds) is acceptable.
 */
const cache = new NodeCache({
  stdTTL: 300,           // Default 5 minutes
  checkperiod: 60,       // Cleanup scan every 60s
  maxKeys: 5000,         // Prevent memory bloat
  useClones: false,      // Perf: return references, not deep clones
  deleteOnExpire: true,
});

cache.on('expired', (key) => {
  logger.debug('L1 cache key expired', { module: 'cache:l1', key });
});

export const l1Cache = {
  get(key) {
    const value = cache.get(key);
    return value !== undefined ? value : null;
  },

  set(key, value, ttl) {
    return cache.set(key, value, ttl || 0);
  },

  del(key) {
    return cache.del(key);
  },

  flush() {
    cache.flushAll();
  },

  stats() {
    return cache.getStats();
  },

  keys() {
    return cache.keys();
  },
};

export default l1Cache;
