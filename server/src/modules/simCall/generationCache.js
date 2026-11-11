import { randomUUID } from 'node:crypto';
import cacheManager from '../../shared/cache/CacheManager.js';

/**
 * Short-lived per-owner cache for aggregates (stats/badges), invalidated by a
 * generation bump on every write that can change them.
 *
 * The cache key embeds the owner's generation: the local counter makes a write
 * visible at once on this instance; the L2 (Redis) value makes it visible on
 * every other instance (read with skipL1, so a stale L1 copy can never hide a
 * bump). Cache failures are never fatal — the value is then computed directly.
 */
export function generationCache(prefix, { ttlSeconds = 30 } = {}) {
  const local = new Map();
  const genKey = (owner) => `${prefix}:gen:${owner}`;

  async function generation(owner) {
    let remote = null;
    try { remote = await cacheManager.get(genKey(owner), { skipL1: true }); } catch { /* best-effort */ }
    return `${local.get(String(owner)) || 0}.${remote ?? 0}`;
  }

  return {
    async get(owner, compute) {
      const key = `${prefix}:${owner}:${await generation(owner)}`;
      const options = { l1Ttl: ttlSeconds, l2Ttl: ttlSeconds };
      let cached = null;
      try { cached = await cacheManager.get(key, options); } catch { /* best-effort */ }
      if (cached !== null && cached !== undefined) return cached;
      const value = await compute();
      try { await cacheManager.set(key, value, options); } catch { /* best-effort */ }
      return value;
    },
    async bump(owner) {
      if (!owner) return;
      local.set(String(owner), (local.get(String(owner)) || 0) + 1);
      try {
        await cacheManager.set(genKey(owner), `${Date.now()}-${randomUUID().slice(0, 8)}`, { skipL1: true, l2Ttl: 7 * 24 * 3600 });
      } catch { /* best-effort */ }
    },
  };
}
