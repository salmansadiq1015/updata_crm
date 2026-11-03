import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorPublisher } from '../src/behaviorPublisher.js';

test('audio event uploads preserve timestamps, order and stable IDs across an interrupted acknowledgement', async () => {
  const delivered = []; const ids = []; let fail = true;
  const publisher = createBehaviorPublisher({ behavior: async event => {
    ids.push(event.id);
    if (fail) { fail = false; throw new Error('network interrupted'); }
    delivered.push(event);
  } }, { retryMs: 1 });
  const waiting = publisher.add({ type: 'question_waiting', fieldKey: 'name' });
  const response = publisher.add({ type: 'response_started' });
  assert.equal((await publisher.flush(500)).remaining, 0); publisher.stop();
  assert.deepEqual(delivered.map(e => e.type), ['question_waiting', 'response_started']);
  assert.deepEqual(ids, [waiting.id, waiting.id, response.id]);
  assert.equal(delivered[0].at, waiting.at);
});

test('cleanup bounds pending uploads and reports undelivered evidence without blocking call termination', async () => {
  const publisher = createBehaviorPublisher({ behavior: async () => new Promise(() => {}) });
  publisher.add({ type: 'interruption' });
  const start = Date.now(); const result = await publisher.flush(10); publisher.stop();
  assert.equal(result.remaining, 1); assert.ok(Date.now() - start < 1000);
});
