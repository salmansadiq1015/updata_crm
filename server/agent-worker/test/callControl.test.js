import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { waitForSipAnswer, once, silenceAction, waitUntilQuiet } from '../src/callControl.js';
import { actionToInstruction, withCurrentStep } from '../src/toolApi.js';

class FakeRoom extends EventEmitter {
  constructor() { super(); this.remoteParticipants = new Map(); }
}
const sip = (status) => ({ identity: 'sip-c1', attributes: { 'sip.callStatus': status } });

test('does not treat a dialling/ringing SIP leg as answered', async () => {
  const room = new FakeRoom();
  const pending = waitForSipAnswer(room, 'sip-c1', 200);
  room.emit('participantConnected', sip('dialing'));
  room.emit('participantAttributesChanged', {}, sip('ringing'));
  assert.equal(await pending, 'timeout');
});

test('resolves "answered" once sip.callStatus becomes active', async () => {
  const room = new FakeRoom();
  const pending = waitForSipAnswer(room, 'sip-c1', 1000);
  room.emit('participantConnected', sip('ringing'));
  room.emit('participantAttributesChanged', {}, sip('active'));
  assert.equal(await pending, 'answered');
  assert.equal(room.listenerCount('participantAttributesChanged'), 0, 'listeners cleaned up');
});

test('an already-active participant resolves immediately; other identities are ignored', async () => {
  const room = new FakeRoom();
  room.remoteParticipants.set('sip-c1', sip('active'));
  assert.equal(await waitForSipAnswer(room, 'sip-c1', 1000), 'answered');
  const room2 = new FakeRoom();
  const pending = waitForSipAnswer(room2, 'sip-c1', 100);
  room2.emit('participantAttributesChanged', {}, { identity: 'sip-other', attributes: { 'sip.callStatus': 'active' } });
  assert.equal(await pending, 'timeout');
});

test('the callee hanging up before answering resolves "hangup"', async () => {
  const room = new FakeRoom();
  const pending = waitForSipAnswer(room, 'sip-c1', 1000);
  room.emit('participantDisconnected', { identity: 'sip-c1' });
  assert.equal(await pending, 'hangup');
});

test('once() runs the end-of-call report exactly once under concurrent triggers', async () => {
  let calls = 0;
  const end = once(async () => { calls += 1; return 'done'; });
  const results = await Promise.all([end('a'), end('b'), end('c')]);
  assert.deepEqual(results, ['done', 'done', 'done']);
  assert.equal(calls, 1);
});

test('silence policy: prompt first, then end', () => {
  assert.equal(silenceAction(1), 'prompt');
  assert.equal(silenceAction(2), 'end');
});

test('engine actions render to constrained instructions', () => {
  assert.match(actionToInstruction({ type: 'ask', question: { text: 'Are you open?', fieldKey: 'open' } }), /fieldKey="open"/);
  assert.match(actionToInstruction({ type: 'end', reason: 'do_not_contact' }), /finish_call/);
  assert.match(actionToInstruction(null), /Wait/);
});

test('the current step is appended to the standing instructions', () => {
  const step = actionToInstruction({ type: 'ask', question: { text: 'What do you need?', fieldKey: 'need' } });
  const text = withCurrentStep('BASE', step);
  assert.ok(text.startsWith('BASE'));
  assert.match(text, /CURRENT STEP .*fieldKey="need"/s);
});

test('disclosure step tells the model to call disclose as soon as they agree', () => {
  assert.match(actionToInstruction({ type: 'disclose' }), /As soon as they agree.*call the disclose tool/s);
});

test('hang-up waits for the goodbye to finish playing', async () => {
  const session = new EventEmitter();
  let state = 'thinking';
  let resolved = false;
  const p = waitUntilQuiet(session, () => state, { minMs: 20, maxMs: 1000 }).then(() => { resolved = true; });
  await new Promise((r) => setTimeout(r, 40));
  state = 'speaking'; session.emit('agent_state_changed', { newState: 'speaking' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(resolved, false, 'still speaking: must not hang up');
  state = 'listening'; session.emit('agent_state_changed', { newState: 'listening' });
  await p;
  assert.equal(resolved, true);
});

test('hang-up does not wait forever when the agent never goes quiet', async () => {
  const session = new EventEmitter();
  const started = Date.now();
  await waitUntilQuiet(session, () => 'speaking', { minMs: 10, maxMs: 60 });
  assert.ok(Date.now() - started >= 55);
});

test('hang-up proceeds after the minimum when the agent is already quiet', async () => {
  const session = new EventEmitter();
  const started = Date.now();
  await waitUntilQuiet(session, () => 'listening', { minMs: 30, maxMs: 1000 });
  assert.ok(Date.now() - started < 500);
});

test('a silent "thinking" agent after finish_call only delays hang-up by the grace period', async () => {
  const session = new EventEmitter();
  const started = Date.now();
  await waitUntilQuiet(session, () => 'thinking', { minMs: 10, maxMs: 2000, thinkingGraceMs: 40 });
  const took = Date.now() - started;
  assert.ok(took >= 45 && took < 1000, `took ${took} ms`);
});

test('thinking that turns into speech waits for the speech to end', async () => {
  const session = new EventEmitter();
  let resolved = false;
  const p = waitUntilQuiet(session, () => 'thinking', { minMs: 10, maxMs: 2000, thinkingGraceMs: 50 }).then(() => { resolved = true; });
  await new Promise((r) => setTimeout(r, 20));
  session.emit('agent_state_changed', { newState: 'speaking' });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(resolved, false);
  session.emit('agent_state_changed', { newState: 'listening' });
  await p;
});
