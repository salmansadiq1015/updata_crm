import crypto from 'node:crypto';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

/**
 * Generation-keyed cache for the in-app notification feed, summary and unread
 * badge. Every InAppNotification write — through any module (feed API, mobile
 * API, in-app adapter, raw Mongoose updates) — bumps the owning user's
 * generation via model middleware (inAppNotification.model.js). Writes whose
 * user cannot be determined bump a global generation. Both generations are
 * part of every cache key, so a write invalidates all of that user's cached
 * reads at once, on every instance, without Redis SCAN or an L1 flush.
 *
 * With Redis (L2) the counters live there (INCR, read with one MGET), so a
 * write on any instance is seen by all. A per-process counter is appended so
 * a write on this instance invalidates its own entries even if Redis is
 * degraded. TTLs stay short to bound staleness for writes that bypass Mongoose.
 */

const USER_PREFIX = 'notif:gen:u:';
const GLOBAL_KEY = 'notif:gen:all';
const LOCAL_MAX_USERS = 10_000;

let localEpoch = 0;
let localGlobal = 0;
let localSeq = 0;
const localByUser = new Map();

function redisClient() {
  return cacheManager.l2?.client ?? null;
}

function userKeyOf(userId) {
  return String(userId?._id ?? userId);
}

function warn(error) {
  logger.warn('Notification cache generation bump failed (degraded)', { module: 'notifications', error: { message: error?.message } });
}

function incr(key) {
  const client = redisClient();
  if (!client) return Promise.resolve();
  try {
    return Promise.resolve(client.incr(key)).then(() => undefined, warn);
  } catch (error) {
    warn(error);
    return Promise.resolve();
  }
}

/**
 * Bump one user's generation (or the global one when userId is unknown).
 * The local part is bumped synchronously; the returned promise settles when
 * the shared (Redis) counter is bumped. Never rejects.
 */
export function bumpNotificationGeneration(userId) {
  if (userId === null || userId === undefined || userId === '') {
    localGlobal += 1;
    return incr(GLOBAL_KEY);
  }
  const id = userKeyOf(userId);
  if (localByUser.size >= LOCAL_MAX_USERS && !localByUser.has(id)) {
    // Bounded memory: start a new epoch so no old key can be reused.
    localByUser.clear();
    localEpoch += 1;
  }
  localSeq += 1;
  localByUser.set(id, localSeq);
  return incr(`${USER_PREFIX}${id}`);
}

/** Current composite generation for a user: shared (Redis) + local part. */
export async function currentNotificationGeneration(userId) {
  const id = userKeyOf(userId);
  const local = `${localEpoch}.${localGlobal}.${localByUser.get(id) || 0}`;
  const client = redisClient();
  if (!client) return local;
  try {
    const [user, global] = await client.mget(`${USER_PREFIX}${id}`, GLOBAL_KEY);
    return `${user ?? 0}.${global ?? 0}:${local}`;
  } catch {
    return `x:${local}`;
  }
}

export function paramsHash(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
}

/**
 * Cache-aside under `notif:${name}:${userId}:${generation}[:${hash}]`.
 * Cache failures fall through to `fetchFn`. Results are shared references
 * (L1 does not clone) — callers must not mutate them.
 */
export async function cachedNotificationRead(name, userId, params, fetchFn, { l1Ttl = 15, l2Ttl = 60 } = {}) {
  let key;
  try {
    const suffix = params === undefined ? '' : `:${paramsHash(params)}`;
    key = `notif:${name}:${userKeyOf(userId)}:${await currentNotificationGeneration(userId)}${suffix}`;
    const hit = await cacheManager.get(key, { l1Ttl });
    if (hit !== null && hit !== undefined) return hit;
  } catch (error) {
    logger.warn('Notification cache read failed (degraded)', { module: 'notifications', name, error: { message: error.message } });
  }
  const value = await fetchFn();
  if (key && value !== null && value !== undefined) {
    try {
      await cacheManager.set(key, value, { l1Ttl, l2Ttl });
    } catch (error) {
      logger.warn('Notification cache write failed (degraded)', { module: 'notifications', name, error: { message: error.message } });
    }
  }
  return value;
}
