import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

// A shared fake L2 (Redis) and per-test L1 maps stand in for CacheManager.
const store = new Map();
const redis = {
  get: jest.fn(async (key) => (store.has(key) ? String(store.get(key)) : null)),
  incr: jest.fn(async (key) => { store.set(key, Number(store.get(key) || 0) + 1); return store.get(key); }),
};
const cacheManagerMock = {
  l2: { client: redis },
  get: jest.fn(async (key) => (store.has(`v:${key}`) ? store.get(`v:${key}`) : null)),
  set: jest.fn(async (key, value) => { store.set(`v:${key}`, value); }),
};

jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({ default: cacheManagerMock }));
jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let createNamespaceCache;

beforeAll(async () => {
  ({ createNamespaceCache } = await import('../../src/shared/cache/namespaceCache.js'));
});

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  cacheManagerMock.l2 = { client: redis };
});

describe('namespace generation cache', () => {
  test('serves from cache until any instance bumps the generation', async () => {
    // Two "instances" share Redis but have their own local counters.
    const a = createNamespaceCache('ns:test');
    const b = createNamespaceCache('ns:test');
    let calls = 0;
    const fetch = async () => { calls += 1; return { n: calls }; };

    expect(await a.getOrSet('list', { q: 1 }, fetch)).toEqual({ n: 1 });
    expect(await b.getOrSet('list', { q: 1 }, fetch)).toEqual({ n: 1 }); // shared L2 hit
    expect(calls).toBe(1);

    await b.bump(); // write handled by instance B
    expect(await a.getOrSet('list', { q: 1 }, fetch)).toEqual({ n: 2 }); // A sees it via Redis
    expect(await a.getOrSet('list', { q: 2 }, fetch)).toEqual({ n: 3 }); // scopes are distinct keys
  });

  test('degrades to the fetch function when the cache layer throws', async () => {
    const c = createNamespaceCache('ns:broken');
    cacheManagerMock.get.mockRejectedValueOnce(new Error('redis down'));
    cacheManagerMock.set.mockRejectedValueOnce(new Error('redis down'));
    await expect(c.getOrSet('x', {}, async () => 'fresh')).resolves.toBe('fresh');
  });

  test('a hanging Redis INCR never holds a write longer than the bump timeout', async () => {
    const c = createNamespaceCache('ns:slow');
    cacheManagerMock.l2 = { client: { get: async () => '0', incr: () => new Promise(() => {}) } };
    const started = Date.now();
    await c.bump();
    expect(Date.now() - started).toBeLessThan(1000);
    // the local counter still moved, so this instance stops serving the old entries
    expect(await c.generation()).toBe('0.1');
  });
});
