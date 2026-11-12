import { randomUUID } from 'node:crypto';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';

/**
 * Cache coordination for the Employee Management read paths.
 * - User list pages live under `auth:users:list:*` and are pattern-invalidated.
 * - Directory KPIs live under `auth:users:stats:<generation>`; bumping the generation
 *   makes every instance miss on its next L2 read (L1 holds the generation ≤ 15 s).
 */
const GEN_KEY = 'auth:users:gen';
const GEN_TTL = { l1Ttl: 15, l2Ttl: 86400 };
export const USER_STATS_TTL = { l1Ttl: 30, l2Ttl: 60 };

export async function userStatsKey() {
  const gen = await cacheManager.getOrSet(GEN_KEY, async () => randomUUID(), GEN_TTL);
  return `auth:users:stats:${gen}`;
}

/** Call after any write that changes user rows, their status/role, or the role set. */
export async function invalidateUserListCache() {
  // Dropping the generation makes the next reader mint a fresh one (new stats key).
  await cacheManager.del(GEN_KEY);
  await cacheManager.invalidatePattern(`${config.redis.keyPrefix}auth:users:list:*`);
}
