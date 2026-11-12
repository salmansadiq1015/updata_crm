import crypto from 'node:crypto';
import cacheManager from './CacheManager.js';
import logger from '../logger/index.js';

/**
 * Generation-keyed read cache for one data namespace (e.g. "tasks", "deploy:calendar").
 *
 * Every cached value's key embeds the namespace's current generation; a write anywhere
 * bumps the generation, so every older entry becomes unreachable at once — no SCAN over
 * Redis and no L1 flushAll (which `cacheManager.invalidatePattern` does and which empties
 * every other module's L1 as a side effect).
 *
 * - Generation = `${redis}.${local}`: the Redis counter (INCR, shared by all instances)
 *   makes a write on one instance visible to all; the process-local counter makes it
 *   visible on this instance even if Redis is down or the INCR is lost.
 * - `registerInvalidation(schema)` hooks every Mongoose write path of a schema (must be
 *   called before `mongoose.model()` compiles it), so writes from any module — services,
 *   jobs, AI/workflow tools — invalidate without each call site remembering to.
 * - Writes that bypass Mongoose (raw driver, migrations) are bounded by the TTL.
 * - Cache failures never fail a request: reads/writes degrade to the fetch function.
 * - Cached values are shared references (L1 does not clone): treat them as read-only.
 */

const BUMP_TIMEOUT_MS = 250;

function redisClient() {
  return cacheManager.l2?.client ?? null;
}

/** Stable short hash of a JSON-able scope (filters, ids, dates). */
export function scopeHash(value) {
  const json = JSON.stringify(value ?? null, (_key, v) => (v instanceof RegExp ? `/${v.source}/${v.flags}` : v));
  return crypto.createHash('sha1').update(json).digest('hex').slice(0, 20);
}

export function createNamespaceCache(namespace, { l1Ttl = 30, l2Ttl = 60 } = {}) {
  const generationKey = `${namespace}:generation`;
  let localGeneration = 0;

  async function bump() {
    localGeneration += 1;
    const client = redisClient();
    if (!client) return;
    // Awaited (bounded) so a client that refetches right after the write response —
    // possibly served by another instance — already sees the new generation. A slow
    // or offline Redis never holds a write for longer than BUMP_TIMEOUT_MS.
    let timer;
    try {
      await Promise.race([
        Promise.resolve(client.incr(generationKey)),
        new Promise((resolve) => { timer = setTimeout(resolve, BUMP_TIMEOUT_MS); }),
      ]);
    } catch (error) {
      logger.warn('Cache generation bump failed (degraded)', { module: 'cache', namespace, error: { message: error.message } });
    } finally {
      clearTimeout(timer);
    }
  }

  async function generation() {
    const client = redisClient();
    if (!client) return String(localGeneration);
    try {
      const value = await client.get(generationKey);
      return `${value ?? 0}.${localGeneration}`;
    } catch {
      return `x.${localGeneration}`;
    }
  }

  /**
   * Cache-aside under `${namespace}:${name}:${generation}:${hash(scope)}`.
   * `null`/`undefined` results are not cached.
   */
  async function getOrSet(name, scope, fetchFn, ttl = {}) {
    const options = { l1Ttl: ttl.l1Ttl ?? l1Ttl, l2Ttl: ttl.l2Ttl ?? l2Ttl };
    let key = null;
    try {
      key = `${namespace}:${name}:${await generation()}:${scopeHash(scope)}`;
      const hit = await cacheManager.get(key, options);
      if (hit !== null && hit !== undefined) return hit;
    } catch (error) {
      logger.warn('Namespace cache read failed (degraded)', { module: 'cache', namespace, name, error: { message: error.message } });
    }
    const value = await fetchFn();
    if (key && value !== null && value !== undefined) {
      try {
        await cacheManager.set(key, value, options);
      } catch (error) {
        logger.warn('Namespace cache write failed (degraded)', { module: 'cache', namespace, name, error: { message: error.message } });
      }
    }
    return value;
  }

  /** Bump the generation on every write path Mongoose exposes on `schema`. */
  function registerInvalidation(schema) {
    const hook = () => bump();
    schema.post('save', hook);
    schema.post('insertMany', hook);
    schema.post('bulkWrite', hook);
    schema.post(['updateOne', 'deleteOne'], { document: true, query: true }, hook);
    schema.post(
      ['updateMany', 'replaceOne', 'deleteMany', 'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete'],
      hook,
    );
  }

  return { namespace, bump, generation, getOrSet, registerInvalidation };
}

export default createNamespaceCache;
