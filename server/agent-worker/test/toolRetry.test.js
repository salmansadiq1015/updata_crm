import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolApi } from '../src/toolApi.js';

test('a lost acknowledgement reuses the request ID instead of consuming another question repeat', async t => {
  const bodies = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) throw new Error('acknowledgement lost');
    return { ok: true, json: async () => ({ data: { repeats: 1 } }) };
  });
  const api = new ToolApi({ apiBase: 'https://fixture.test/agent', token: 'fixture', callId: 'call-1' });
  assert.equal((await api.noResponse('name', 'silence')).repeats, 1);
  assert.equal(bodies.length, 2); assert.deepEqual(bodies[0], bodies[1]);
});

test('a rejected no-response control is never retried as another event', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return { ok: false, status: 409, json: async () => ({ error: { message: 'Question changed' } }) };
  });
  const api = new ToolApi({ apiBase: 'https://fixture.test/agent', token: 'fixture', callId: 'call-1' });
  await assert.rejects(api.noResponse('old-question', 'unrelated'), /Question changed/);
  assert.equal(requests, 1);
});
