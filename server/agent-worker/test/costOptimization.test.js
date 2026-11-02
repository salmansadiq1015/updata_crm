import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llm } from '@livekit/agents';
import { contextOptions, createContextBudget, compactItems } from '../src/contextManagement.js';
import { createResponseUsage } from '../src/responseUsage.js';
import { closeVoiceSession } from '../src/sessionCleanup.js';
import { turnDetection } from '../src/transcription.js';
import { once } from '../src/callControl.js';

const metric = id => ({ type: 'realtime_model_metrics', requestId: id, inputTokens: 13000, outputTokens: 100,
  inputTokenDetails: { audioTokens: 1000, textTokens: 12000, cachedTokens: 8000, cachedTokensDetails: { audioTokens: 500, textTokens: 7500 } },
  outputTokenDetails: { audioTokens: 80, textTokens: 20 }, ttftMs: 120, cancelled: false });
const messages = n => Array.from({ length: n }, (_, i) => new llm.ChatMessage({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: i % 2 ? 'Earlier questionnaire discussion and answer requirements. '.repeat(8) : `Statement ${i}`, createdAt: i + 1 }));

test('short qualification preserves original history; long sessions compact with headroom', () => {
  const budget = createContextBudget(contextOptions({}));
  budget.observe({ ...metric('1'), inputTokens: 1000 }); assert.equal(budget.due(), false);
  for (let i = 0; i < 8; i++) budget.observe(metric(String(i)));
  assert.equal(budget.due(), true); budget.compacted(); assert.equal(budget.due(), false);
  assert.equal(compactItems(messages(20), { answers: {} }, 'ask', 12), null);
  const compact = compactItems(messages(60), { answers: { email: 'a@example.com' } }, 'ask', 12);
  assert.equal(compact.recent.length, 12); assert.equal(compact.removed, 48);
  assert.equal(compact.recent[0].id, 'm48');
});

test('eight-question workflow retains every exact collected value and current question', () => {
  const answers = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`q${i}`, { value: `Exact value ${i}`, confirmed: i < 7 }]));
  const result = compactItems(messages(60), { answers }, 'Confirm q7', 12);
  for (const entry of Object.values(answers)) assert.ok(result.checkpoint.includes(entry.value));
  assert.match(result.checkpoint, /Confirm q7/);
});

test('interrupted conversation retains recent audio identity, partial spelling and corrections', () => {
  const history = messages(60); history[58].content = ['Email starts with a l i']; history[59].interrupted = true;
  const result = compactItems(history, { answers: {} }, 'Ask remaining letters', 12);
  assert.equal(result.recent.at(-1), history.at(-1));
  assert.equal(result.recent.at(-2).content[0], 'Email starts with a l i');
  assert.equal(result.recent.at(-1).interrupted, true);
});

test('multiple and repeated answers survive checkpoints without adding instructions or losing earlier facts', () => {
  const archive = new Map(); const history = messages(60);
  history[0].content = ['Call me tomorrow; I prefer Urdu.'];
  history[1].content = ['The approved introductory price was fifty dollars.'];
  const a = compactItems(history, { answers: { name: 'Ali', email: 'ali@example.com' } }, 'Next', 12, archive);
  const b = compactItems(messages(80), { answers: { name: 'Ali', email: 'ali@example.com' } }, 'Next', 12, archive);
  assert.match(a.checkpoint, /Call me tomorrow/); assert.match(b.checkpoint, /I prefer Urdu/);
  assert.match(b.checkpoint, /approved introductory price was fifty dollars/);
  assert.equal(b.recent.some(i => i.id === 'updata_initial_step'), false);
});

test('unclear untranscribed audio is never discarded for compaction', () => {
  const history = messages(60); history[0].content = [{ type: 'audio_content', frame: [] }];
  assert.equal(compactItems(history, { answers: {} }, 'Clarify', 12), null);
});

test('a checkpoint that would increase context is deferred without losing answers', () => {
  assert.equal(compactItems(messages(60), { answers: { long: 'x'.repeat(30000) } }, 'Next', 12), null);
});

test('in-flight tools are never compacted and complete function pairs stay valid', () => {
  const history = messages(60);
  const call = new llm.FunctionCall({ id: 'call', callId: 'tool1', name: 'record_answer', args: '{}' });
  history.push(call); assert.equal(compactItems(history, { answers: {} }, 'Next', 12), null);
  history.push(new llm.FunctionCallOutput({ id: 'out', callId: 'tool1', name: 'record_answer', output: 'Next', isError: false }));
  const compact = compactItems(history, { answers: {} }, 'Next', 12);
  assert.ok(compact); assert.ok(compact.recent.includes(call));
  // Updating through the installed SDK's ChatContext preserves object IDs.
  const ctx = new llm.ChatContext(compact.recent);
  assert.equal(ctx.copy().items.at(-1).callId, 'tool1');
  assert.equal(llm.validateChatContextStructure(ctx).errors, 0);
});

test('reconnected and cancelled provider responses retain billable usage once', () => {
  const usage = createResponseUsage({ model: 'gpt-realtime' });
  assert.equal(usage.observe(metric('r1')), true); assert.equal(usage.observe(metric('r1')), false);
  usage.reconnected(); usage.observe({ ...metric('r2'), cancelled: true });
  const s = usage.snapshot(); assert.equal(s.responseCount, 2);
  assert.equal(s.responses[1].contextChange, 'room_reconnected'); assert.equal(s.responses[1].inputCachedTextTokens, 7500);
  assert.equal(s.responses[1].cancelled, true);
});

test('failed calls flush evidence even if provider close fails', async () => {
  const seen = []; const snapshot = { modelUsage: [] };
  const result = await closeVoiceSession({ close: async () => { seen.push('close'); throw new Error('network'); }, usage: snapshot }, async () => seen.push('flush'), () => seen.push('fault'));
  assert.deepEqual(seen, ['close', 'fault', 'flush']); assert.equal(result, snapshot);
});

test('call completion stops capture before final usage and reports once under competing hangups', async () => {
  const order = []; let usage = null;
  const session = { close: async () => { order.push('close'); usage = { final: true }; }, get usage() { order.push('usage'); return usage; } };
  const finish = once(() => closeVoiceSession(session, async () => order.push('transcript')));
  await Promise.all([finish(), finish(), finish()]);
  assert.deepEqual(order, ['close', 'transcript', 'usage']);
});

test('budgets and barge-in are configurable without overly restrictive tool output', () => {
  assert.equal(contextOptions({ OPENAI_REALTIME_MAX_OUTPUT_TOKENS: '10' }).maxResponseOutputTokens, 1024);
  assert.equal(contextOptions({ OPENAI_REALTIME_MAX_OUTPUT_TOKENS: '2048' }).maxResponseOutputTokens, 2048);
  const budget = createContextBudget(contextOptions({ OPENAI_REALTIME_COMPACTION: 'false' }));
  for (let i = 0; i < 50; i++) budget.observe(metric(String(i)));
  assert.equal(budget.due(), false);
  for (const env of [{}, { OPENAI_REALTIME_TURN_DETECTION: 'semantic' }]) assert.equal(turnDetection(env, { allowBargeIn: false }).interrupt_response, false);
});
