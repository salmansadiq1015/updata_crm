import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';

const Redis = jest.fn(() => new EventEmitter());
jest.unstable_mockModule('ioredis', () => ({ default: Redis }));
const { createRedisClient, getRedisClient, waitForRedisReady } = await import('../../src/config/redis.js');
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

afterEach(() => jest.useRealTimers());

test('HTTP Redis commands have finite deadlines while worker connections keep their retry policy', () => {
  createRedisClient(logger);
  expect(Redis.mock.calls.at(-1)[1].maxRetriesPerRequest).toBeNull();
  getRedisClient(logger);
  expect(Redis.mock.calls.at(-1)[1]).toMatchObject({ maxRetriesPerRequest: 1, commandTimeout: 3000, connectTimeout: 5000 });
});

test('a stalled Redis connection rejects on time and releases its listeners', async () => {
  jest.useFakeTimers();
  const client = new EventEmitter();
  const waiting = expect(waitForRedisReady(client, 50)).rejects.toThrow('Redis readiness timed out');
  await jest.advanceTimersByTimeAsync(50);
  await waiting;
  expect(client.listenerCount('ready')).toBe(0);
  expect(client.listenerCount('error')).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['ready', 'error'])('Redis %s settles readiness and cleans up the timeout', async (event) => {
  jest.useFakeTimers();
  const client = new EventEmitter();
  const waiting = waitForRedisReady(client);
  const result = event === 'ready' ? expect(waiting).resolves.toBeUndefined() : expect(waiting).rejects.toThrow('offline');
  client.emit(event, new Error('offline'));
  await result;
  expect(client.listenerCount('ready')).toBe(0);
  expect(client.listenerCount('error')).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});
