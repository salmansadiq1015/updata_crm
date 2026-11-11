import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/** generationCache: per-owner aggregate cache invalidated by generation bumps (L1 + shared L2 key). */
const store = new Map();
const l2 = new Map();
const cache = {
  get: jest.fn(async (key, opts = {}) => (opts.skipL1 ? (l2.get(key) ?? null) : (store.get(key) ?? l2.get(key) ?? null))),
  set: jest.fn(async (key, value, opts = {}) => { if (!opts.skipL1) store.set(key, value); if (!opts.skipL2) l2.set(key, value); }),
};
jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({ default: cache }));
const { generationCache } = await import('../../src/modules/simCall/generationCache.js');

beforeEach(() => { store.clear(); l2.clear(); cache.get.mockClear(); cache.set.mockClear(); });

describe('generationCache', () => {
  it('serves cached values until the owner generation is bumped', async () => {
    const c = generationCache('t:stats', { ttlSeconds: 30 });
    let n = 0;
    const compute = jest.fn(async () => ({ n: ++n }));
    expect(await c.get('u1', compute)).toEqual({ n: 1 });
    expect(await c.get('u1', compute)).toEqual({ n: 1 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(expect.stringMatching(/^t:stats:u1:/), { n: 1 }, { l1Ttl: 30, l2Ttl: 30 });

    await c.bump('u1');
    expect(await c.get('u1', compute)).toEqual({ n: 2 });
    // Other owners are unaffected.
    expect(await c.get('u2', compute)).toEqual({ n: 3 });
    expect(await c.get('u2', compute)).toEqual({ n: 3 });
  });

  it('a bump on another instance (shared L2 generation) invalidates this instance', async () => {
    const here = generationCache('t:shared');
    const there = generationCache('t:shared');
    let n = 0;
    const compute = async () => ++n;
    expect(await here.get('u1', compute)).toBe(1);
    await there.bump('u1');
    expect(await here.get('u1', compute)).toBe(2);
  });

  it('falls back to computing when the cache layer fails', async () => {
    const c = generationCache('t:fail');
    cache.get.mockRejectedValueOnce(new Error('redis down')).mockRejectedValueOnce(new Error('redis down'));
    cache.set.mockRejectedValueOnce(new Error('redis down'));
    expect(await c.get('u1', async () => 42)).toBe(42);
  });
});
