/**
 * Short-lived read cache for the Workflow Automation dashboards (analytics, list run stats,
 * campaign progress).
 *
 * Keys carry a generation counter that every service write bumps (publish, status changes,
 * campaign actions, manual run controls …), so a user's own action is visible on the next
 * read. Runs progressing in the background (runner/engine writes) are NOT tracked — those
 * reads tolerate up to TTL seconds of staleness, which is below every client poll interval.
 *
 * The generation lives in L1 and L2 (Redis), so a bump on one instance invalidates the
 * others as soon as their L1 copy of the generation expires (GEN_L1_TTL seconds).
 * Cache failures never fail a request: the loader runs uncached.
 */
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

const GEN_KEY = 'workflow:read:gen';
const GEN_L1_TTL = 3;
let localGen = `${Date.now().toString(36)}`;

export const READ_TTL = Object.freeze({ analytics: 30, runStats: 15, campaignProgress: 5 });

async function generation() {
  try {
    const shared = await cacheManager.get(GEN_KEY, { l1Ttl: GEN_L1_TTL });
    return shared ?? localGen;
  } catch {
    return localGen;
  }
}

/** Invalidate every cached workflow read (call after any service write). Never throws. */
export async function bumpWorkflowReadGeneration() {
  localGen = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await cacheManager.set(GEN_KEY, localGen, { l1Ttl: GEN_L1_TTL, l2Ttl: 7 * 86_400 });
  } catch (err) {
    logger.warn('Workflow read-cache generation bump failed', { module: 'workflow', error: err.message });
  }
}

/**
 * Cache-aside read. `ttl` in seconds (L1 and L2). The value must be JSON-serializable
 * (it round-trips through Redis); callers treat the result as read-only.
 */
export async function cachedRead(name, parts, ttl, loader) {
  let key;
  try {
    key = `workflow:read:${name}:${await generation()}:${parts.join(':')}`;
    const hit = await cacheManager.get(key, { l1Ttl: ttl });
    if (hit !== null && hit !== undefined) return hit;
  } catch {
    return loader();
  }
  const value = await loader();
  try {
    // JSON round trip: L1 and L2 hits return the same shape (ObjectIds/Dates → strings),
    // and a caller can never mutate the cached copy.
    await cacheManager.set(key, JSON.parse(JSON.stringify(value)), { l1Ttl: ttl, l2Ttl: ttl });
  } catch (err) {
    logger.warn('Workflow read-cache write failed', { module: 'workflow', error: err.message });
  }
  return value;
}

export default { cachedRead, bumpWorkflowReadGeneration, READ_TTL };
