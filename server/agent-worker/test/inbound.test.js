import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createInboundTools, inboundInstructions, isInbound, INBOUND_FIRST_STEP } from '../src/inbound.js';

const llm = { tool: (def) => def };
const guarded = (fn) => async (args) => { try { return await fn(args || {}); } catch (e) { return `The CRM rejected that: ${e.message}`; } };

function setup({ said = 'My name is Sara, I want a CRM' } = {}) {
  const posts = [];
  const api = {
    _post: async (path, body) => { posts.push({ path, body }); return path === '/request-human' ? { instruction: 'Tell them a team member was alerted.' } : { instruction: 'Saved. Continue the conversation.' }; },
    _postEvent: async (path, body) => { posts.push({ path, body }); return { ok: true }; },
  };
  let notes = null; let finished = 0;
  const tools = createInboundTools({
    llm, z, api, guarded,
    heard: { latest: async () => said },
    finish: () => { finished += 1; },
    setNotes: (n) => { notes = n; },
    requestIds: (kind, text) => `${kind}:${text}`,
  });
  return { tools, posts, notes: () => notes, finished: () => finished };
}

test('detects inbound calls from job metadata or context', () => {
  assert.equal(isInbound({ direction: 'inbound' }), true);
  assert.equal(isInbound({}, { direction: 'inbound' }), true);
  assert.equal(isInbound({ mode: 'pstn' }, {}), false);
});

test('instructions carry the greeting once and private-notes guidance', () => {
  const text = inboundInstructions({ systemPrompt: 'You are Aria.', greeting: 'Hello, Updata here.' });
  assert.match(text, /You are Aria\./);
  assert.match(text, /"Hello, Updata here\."/);
  assert.match(text, /never spoken/);
  assert.match(INBOUND_FIRST_STEP, /Greet/);
});

test('record_caller_info sends explicit/inferred provenance with the caller\'s words as evidence', async () => {
  const { tools, posts } = setup();
  const out = await tools.record_caller_info.execute({ fields: [{ key: 'full_name', value: 'Sara' }, { key: 'budget', value: '20k', explicit: false, confidence: 0.4, asked_question: 'Budget?' }] });
  assert.equal(out, 'Saved. Continue the conversation.');
  assert.equal(posts[0].path, '/caller-info');
  assert.deepEqual(posts[0].body.fields[0], { key: 'full_name', value: 'Sara', explicit: true, evidence: 'My name is Sara, I want a CRM' });
  assert.equal(posts[0].body.fields[1].explicit, false);
  assert.equal(posts[0].body.fields[1].askedQuestion, 'Budget?');
});

test('a declined closing question is sent as declined, without a value', async () => {
  const { tools, posts } = setup({ said: 'I would rather not say' });
  await tools.record_caller_info.execute(tools.record_caller_info.parameters.parse({ fields: [{ key: 'custom_allergies', declined: true }] }));
  assert.deepEqual(posts[0].body.fields[0], { key: 'custom_allergies', value: '', declined: true, evidence: 'I would rather not say' });
});

test('nothing is saved before the caller has spoken', async () => {
  const { tools, posts } = setup({ said: '' });
  const out = await tools.record_caller_info.execute({ fields: [{ key: 'full_name', value: 'Guess' }] });
  assert.match(out, /Nothing saved/);
  assert.equal(posts.length, 0);
});

test('caller questions, intent, callback, human and DNC go to the inbound API', async () => {
  const { tools, posts } = setup();
  await tools.record_caller_question.execute({ question: 'How much?', category: 'PRICING_INQUIRY', answer_status: 'deferred' });
  await tools.set_call_intent.execute({ primary: 'SERVICE_INQUIRY', secondary: ['PRICING_INQUIRY'] });
  await tools.request_callback.execute({ when: 'tomorrow at 10' });
  const human = await tools.request_human.execute({ reason: 'wants a person', summary: 'CRM inquiry' });
  await tools.do_not_contact.execute({});
  assert.deepEqual(posts.map((p) => p.path), ['/caller-question', '/intent', '/request-callback', '/request-human', '/do-not-contact']);
  assert.equal(posts[0].body.requestId, 'question:How much?');
  assert.equal(posts[0].body.answerStatus, 'deferred');
  assert.match(human, /team member/);
  assert.throws(() => tools.set_call_intent.parameters.parse({ primary: 'MADE_UP' }));
});

test('finish_call stores private notes and ends without speaking', async () => {
  const { tools, notes, finished } = setup();
  const spoken = await tools.finish_call.execute(tools.finish_call.parameters.parse({ reason: 'CRM', summary: 'Wants a CRM', caller_tone: 'positive', tone_evidence: 'sounds great' }));
  assert.equal(spoken, undefined);
  assert.equal(finished(), 1);
  assert.deepEqual(notes().behavior, { tone: 'positive', evidence: 'sounds great' });
  assert.equal(notes().summary, 'Wants a CRM');
});
