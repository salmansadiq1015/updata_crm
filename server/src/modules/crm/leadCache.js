import crypto from 'node:crypto';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

/**
 * Generation-keyed cache for lead/follow-up aggregates (list KPIs, geography
 * facets). Every Lead / LeadFollowUp write — through any module — bumps one
 * generation counter (Mongoose middleware in lead.model.js and
 * leadFollowUp.model.js), and the generation is part of every cache key, so a
 * write invalidates every cached aggregate at once without pattern scans.
 *
 * With Redis (L2) the counter lives there (INCR), so all API instances see a
 * write made on any instance. Without Redis it is a per-process counter. A
 * short TTL (≤ 60 s) bounds staleness for writes that bypass Mongoose (raw
 * driver calls, migrations).
 */

const GENERATION_KEY = 'crm:leads:generation';
let localGeneration = 0;

function redisClient() {
  return cacheManager.l2?.client ?? null;
}

/** Bump on every lead / follow-up write. Fire-and-forget; never throws. */
export function bumpLeadCacheGeneration() {
  localGeneration += 1;
  const client = redisClient();
  if (!client) return;
  try {
    Promise.resolve(client.incr(GENERATION_KEY)).catch((error) => {
      logger.warn('Lead cache generation bump failed (degraded)', { module: 'crm', error: { message: error.message } });
    });
  } catch (error) {
    logger.warn('Lead cache generation bump failed (degraded)', { module: 'crm', error: { message: error.message } });
  }
}

/** Current generation: Redis when available (shared), else the process counter. */
export async function currentLeadCacheGeneration() {
  const client = redisClient();
  if (client) {
    try {
      const value = await client.get(GENERATION_KEY);
      // The local counter is appended so a write on this instance invalidates
      // its own entries even if the Redis INCR was lost (degraded Redis).
      return `${value ?? 0}.${localGeneration}`;
    } catch {
      return `x.${localGeneration}`;
    }
  }
  return String(localGeneration);
}

/** Stable short hash of a JSON-able scope (access filter, query params). */
export function scopeHash(value) {
  // RegExp has no JSON form ({}), so two different searches would collide;
  // ObjectIds/Dates serialize through their own toJSON.
  const json = JSON.stringify(value ?? null, (_key, v) => (v instanceof RegExp ? `/${v.source}/${v.flags}` : v));
  return crypto.createHash('sha1').update(json).digest('hex').slice(0, 16);
}

/**
 * Cache-aside keyed by `${name}:${generation}:${hash(scope)}`. `ttlSeconds` is
 * capped at 60. Cached values are shared references (L1 does not clone), so
 * callers must treat the result as read-only. A cache failure falls through to
 * `fetchFn`.
 */
export async function cachedLeadAggregate(name, scope, fetchFn, { ttlSeconds = 60 } = {}) {
  const ttl = Math.min(Math.max(1, ttlSeconds), 60);
  let key;
  try {
    key = `crm:leads:${name}:${await currentLeadCacheGeneration()}:${scopeHash(scope)}`;
    const hit = await cacheManager.get?.(key, { l1Ttl: ttl });
    if (hit !== null && hit !== undefined) return hit;
  } catch (error) {
    logger.warn('Lead aggregate cache read failed (degraded)', { module: 'crm', name, error: { message: error.message } });
  }
  const value = await fetchFn();
  if (key && value !== null && value !== undefined) {
    Promise.resolve().then(() => cacheManager.set(key, value, { l1Ttl: ttl, l2Ttl: ttl })).catch(() => {});
  }
  return value;
}

/**
 * Register generation bumps for every write path Mongoose exposes on a schema:
 * document saves/deletes, query updates/deletes, insertMany and bulkWrite.
 */
export function registerLeadCacheInvalidation(schema) {
  const bump = () => bumpLeadCacheGeneration();
  schema.post('save', bump);
  schema.post('insertMany', bump);
  schema.post('bulkWrite', bump);
  schema.post(
    ['updateOne', 'deleteOne'],
    { document: true, query: true },
    bump,
  );
  schema.post(
    ['updateMany', 'replaceOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete'],
    bump,
  );
}

export default {
  bumpLeadCacheGeneration, currentLeadCacheGeneration, cachedLeadAggregate, registerLeadCacheInvalidation, scopeHash,
};
