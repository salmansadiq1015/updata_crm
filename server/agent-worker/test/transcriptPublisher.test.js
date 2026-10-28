import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriptPublisher } from '../src/transcriptPublisher.js';

test('publishes both speakers in order, ignores tools, and deduplicates event replay', async () => {
  const uploads = [];
  const publisher = createTranscriptPublisher({ transcript: async (...args) => { uploads.push(args); } });
  const agent = { id: 'a1', role: 'assistant', textContent: 'Hello, how can I help?', interrupted: true };
  publisher.add(agent);
  publisher.add({ id: 'c1', role: 'user', textContent: 'I need a quote.' });
  publisher.add(agent);
  publisher.add({ id: 'tool-1', role: 'tool', textContent: 'private tool data' });
  await publisher.flush();
  assert.deepEqual(uploads, [['assistant', 'Hello, how can I help?', 'a1', true], ['customer', 'I need a quote.', 'c1', false]]);
});

test('a failed upload retries with the same id before uploading the next utterance', async () => {
  const attempts = [];
  let fail = true;
  const publisher = createTranscriptPublisher({ transcript: async (...args) => {
    attempts.push(args);
    if (fail) { fail = false; throw new Error('Temporary network error'); }
  } }, { retryMs: 1 });
  publisher.add({ id: 'c1', role: 'user', textContent: 'Please call tomorrow.' });
  publisher.add({ id: 'a1', role: 'assistant', textContent: 'What time works for you?' });
  await publisher.flush();
  assert.deepEqual(attempts.map(a => a[2]), ['c1', 'c1', 'a1']);
});

test('a slow transcript service does not hold up hang-up indefinitely', async () => {
  const publisher = createTranscriptPublisher({ transcript: async () => new Promise(() => {}) });
  publisher.add({ id: 'a1', role: 'assistant', textContent: 'Goodbye.' });
  const started = Date.now();
  await publisher.flush(15);
  assert.ok(Date.now() - started < 500);
});

test('retains speech across an extended outage and resumes uploading in order', async () => {
  const ids = []; let attempts = 0;
  const publisher = createTranscriptPublisher({ transcript: async (_role, _text, id) => { if (++attempts <= 5) throw new Error('offline'); ids.push(id); } }, { retryMs: 1 });
  publisher.add({ id: 'first', role: 'assistant', textContent: 'Question one?' });
  publisher.add({ id: 'second', role: 'user', textContent: 'My answer.' });
  await publisher.flush(1000);
  assert.deepEqual(ids, ['first', 'second']);
});

test('supports structured message content, safe stable IDs and speech timestamps', async () => {
  const uploads = [];
  const publisher = createTranscriptPublisher({ transcript: async (...args) => uploads.push(args) });
  const item = { id: 'message with spaces', role: 'assistant', content: [{ text: 'Hello there.' }], createdAt: 1793190000000 };
  publisher.add(item); publisher.add(item); await publisher.flush();
  assert.equal(uploads.length, 1); assert.equal(uploads[0][1], 'Hello there.');
  assert.match(uploads[0][2], /^item-[a-f0-9]{64}$/);
  assert.equal(uploads[0][4], new Date(item.createdAt).toISOString());
});
