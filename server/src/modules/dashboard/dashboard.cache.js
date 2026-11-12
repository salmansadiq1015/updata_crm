import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

/**
 * Dashboard read cache — L1 (in-process NodeCache) + L2 (Redis) via cacheManager,
 * bounded by a short TTL, with in-process single-flight.
 *
 * Why TTL and not generation counters: the snapshot aggregates ~12 collections
 * (customers, projects, quotes, orders, invoices, tasks, assignments, AP, bank,
 * journal, users, audit log) that are written from dozens of modules, background
 * jobs and raw driver/bulk paths, and the audit log is appended on nearly every
 * authenticated request. A generation counter would have to be bumped from all of
 * those write paths (hooks in other modules' models) and would still change on
 * practically every request because of the audit log, so the cache would never
 * hit. The intelligence sources (call records, inbound calls, agent runs) change
 * state continuously during live calls for the same reason. A short TTL bounds
 * staleness instead: worst case ≈ l2Ttl + l1Ttl seconds (an instance may copy an
 * L2 value into L1 just before it expires), which stays below the client's 60 s
 * staleTime / 120 s refetch interval.
 *
 * Single-flight: concurrent cold requests for the same key on one instance share
 * one computation, so a dashboard full of users after an expiry costs one
 * aggregation run, not one per request.
 */

export const DASHBOARD_CACHE_TTL = Object.freeze({
  // System-wide business analytics (same for every viewer).
  analytics: Object.freeze({ l1Ttl: 20, l2Ttl: 40 }),
  // Per-viewer AI/lead intelligence; live call state churns, keep it tighter.
  intelligence: Object.freeze({ l1Ttl: 15, l2Ttl: 30 }),
  // Legacy KPI tiles and the mobile CRM snapshot.
  stats: Object.freeze({ l1Ttl: 30, l2Ttl: 30 }),
});

const inflight = new Map();

/**
 * Cache-aside with single-flight. Cache failures (Redis down, L1 full) never fail
 * the request — the value is computed directly. Cached values are shared
 * references (L1 does not clone): treat them as read-only.
 */
export async function cachedDashboardRead(key, compute, ttl) {
  try {
    const hit = await cacheManager.get(key, ttl);
    if (hit !== null && hit !== undefined) return hit;
  } catch (error) {
    logger.warn('Dashboard cache read failed (degraded)', { module: 'dashboard', key, error: { message: error.message } });
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const value = await compute();
    if (value !== null && value !== undefined) {
      try {
        await cacheManager.set(key, value, ttl);
      } catch (error) {
        logger.warn('Dashboard cache write failed (degraded)', { module: 'dashboard', key, error: { message: error.message } });
      }
    }
    return value;
  })();
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

export default { cachedDashboardRead, DASHBOARD_CACHE_TTL };
