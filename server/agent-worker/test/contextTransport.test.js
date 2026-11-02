import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { initializeLogger, llm } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { compactItems } from '../src/contextManagement.js';

initializeLogger({ pretty: false, level: 'fatal' });

test('installed OpenAI SDK compacts by item differences while preserving recent IDs and frozen instructions', { timeout: 10000 }, async t => {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const sent = []; const sockets = [];
  server.on('connection', socket => {
    sockets.push(socket);
    socket.on('message', data => {
      const e = JSON.parse(data); sent.push(e);
      if (e.type === 'session.update') socket.send(JSON.stringify({ type: 'session.updated', session: e.session }));
      if (e.type === 'conversation.item.create') socket.send(JSON.stringify({ type: 'conversation.item.created', item: e.item, previous_item_id: e.previous_item_id || null }));
      if (e.type === 'conversation.item.delete') socket.send(JSON.stringify({ type: 'conversation.item.deleted', item_id: e.item_id }));
    });
  });
  const model = new openai.realtime.RealtimeModel({ apiKey: 'local-fixture', baseURL: `http://127.0.0.1:${server.address().port}/v1`, connOptions: { maxRetry: 0, timeoutMs: 3000, retryIntervalMs: 0 } });
  const raw = model.session();
  t.after(async () => {
    await raw.close();
    for (const socket of sockets) socket.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  await raw.updateInstructions('Stable qualification instructions. Use the latest tool result.');
  const original = new llm.ChatContext();
  original.addMessage({ role: 'developer', id: 'updata_initial_step', content: 'Initial step: disclose.', createdAt: 1 });
  for (let i = 0; i < 60; i++) original.addMessage({ id: `item_${i}`, role: i % 2 ? 'assistant' : 'user', content: i % 2 ? 'Earlier explanation and questionnaire guidance. '.repeat(12) : `Answer ${i}`, createdAt: i + 2 });
  await raw.updateChatCtx(original);
  const compacted = compactItems(original.items, { answers: { email: { value: 'exact@example.com' } } }, 'Ask city', 12);
  assert.ok(compacted);
  const next = new llm.ChatContext();
  next.addMessage({ id: 'updata_context_checkpoint', role: 'developer', content: compacted.checkpoint, createdAt: compacted.recent[0].createdAt - 1 });
  next.items.push(...compacted.recent);
  const start = sent.length;
  await raw.updateChatCtx(next);
  const changes = sent.slice(start);
  assert.ok(changes.some(e => e.type === 'conversation.item.delete'));
  assert.ok(changes.some(e => e.type === 'conversation.item.create' && e.item.id === 'updata_context_checkpoint'));
  assert.equal(changes.some(e => e.type === 'session.update'), false);
  for (const item of compacted.recent) {
    assert.equal(changes.some(e => e.type === 'conversation.item.delete' && e.item_id === item.id), false);
    assert.equal(changes.some(e => e.type === 'conversation.item.create' && e.item.id === item.id), false);
  }
  assert.equal(raw.chatCtx.items.length, 13);
});
