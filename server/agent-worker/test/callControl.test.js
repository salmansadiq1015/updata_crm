import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { waitForSipAnswer, once, silenceAction, waitUntilQuiet, openCall } from '../src/callControl.js';
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

test('disclosure silence policy: three repeats, then stop without agreement', () => {
  assert.equal(silenceAction(1), 'prompt');
  assert.equal(silenceAction(2), 'prompt');
  assert.equal(silenceAction(3), 'prompt');
  assert.equal(silenceAction(4), 'end');
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

test('turn detection defaults to server VAD; semantic is opt-in', async () => {
  const { turnDetection, transcription } = await import('../src/agent.js');
  assert.equal(turnDetection({}).type, 'server_vad');
  assert.equal(turnDetection({}).silence_duration_ms, 1000);
  assert.equal(turnDetection({ OPENAI_REALTIME_SILENCE_MS: '800' }).silence_duration_ms, 800);
  assert.deepEqual(turnDetection({ OPENAI_REALTIME_TURN_DETECTION: 'semantic' }).type, 'semantic_vad');
  assert.equal(transcription('en', {}).language, undefined);
  assert.equal(transcription('ur', {}).language, undefined);
  assert.match(transcription('ur', {}).prompt, /language switches/);
  assert.ok(transcription('roman_ur', {}).prompt);
  assert.deepEqual(transcription('ur', { OPENAI_REALTIME_TRANSCRIBE_LANGUAGE: 'en' }).languages, ['en']);
});

test('answers in any language reach the server as options / digits it can validate', () => {
  const choice = actionToInstruction({ type: 'ask', question: { fieldKey: 'place', text: 'What kind of place?', type: 'single_choice', options: ['office', 'shop'] } });
  assert.match(choice, /exactly as one of: office \| shop/);
  const number = actionToInstruction({ type: 'clarify', question: { fieldKey: 'size', text: 'How big?', type: 'integer' } });
  assert.match(number, /as digits/);
  assert.doesNotMatch(actionToInstruction({ type: 'ask', question: { fieldKey: 'note', text: 'Anything else?', type: 'text' } }), /digits|exactly as one of/);
});

test('heard: confirmations use the transcript of the newest turn, waiting briefly for it', async () => {
  const { createHeard } = await import('../src/callControl.js');
  const heard = createHeard();
  heard.onSpeaking();
  heard.onTranscript('salman@outlook.com');
  assert.equal(await heard.latest(50), 'salman@outlook.com');
  heard.onSpeaking(); // the person says "Yes" — its transcript lands after the tool call
  const pending = heard.latest(1000);
  setTimeout(() => heard.onTranscript('Yes.'), 20);
  assert.equal(await pending, 'Yes.');
  heard.onSpeaking(); // transcript never arrives → no evidence, not the older sentence
  assert.equal(await heard.latest(30), null);
});

// ---- opening an answered phone call ----
function opener() {
  const session = new EventEmitter();
  const state = { user: 'listening', agent: 'listening', generated: 0 };
  const io = { userState: () => state.user, agentState: () => state.agent, generate: () => { state.generated += 1; } };
  const user = (s) => { state.user = s; session.emit('user_state_changed', { newState: s }); };
  const agent = (s) => { state.agent = s; session.emit('agent_state_changed', { newState: s }); };
  return { session, state, io, user, agent };
}

test('a silent callee gets the opener after the quiet period', async () => {
  const o = opener();
  const done = openCall(o.session, o.io, { quietMs: 30, maxGreetingMs: 500, retryAfterMs: 200 });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(o.state.generated, 1);
  o.agent('speaking');
  assert.equal(await done, 'spoke');
});

test('a callee saying "Hello?" is let finish before the agent speaks', async () => {
  const o = opener();
  const done = openCall(o.session, o.io, { quietMs: 30, maxGreetingMs: 500, retryAfterMs: 200 });
  o.user('speaking');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(o.state.generated, 0, 'never talks over the greeting');
  o.user('listening');
  assert.equal(o.state.generated, 1);
  o.agent('speaking');
  assert.equal(await done, 'spoke');
});

test('a swallowed opener is retried once instead of waiting for the silence timer', async () => {
  const o = opener();
  const done = openCall(o.session, o.io, { quietMs: 10, maxGreetingMs: 500, retryAfterMs: 40 });
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(o.state.generated, 2);
  o.agent('speaking');
  assert.equal(await done, 'retried');
});

test('an endless greeting (noise) does not block the opener forever', async () => {
  const o = opener();
  const done = openCall(o.session, o.io, { quietMs: 10, maxGreetingMs: 50, retryAfterMs: 200 });
  o.user('speaking');
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(o.state.generated, 1);
  o.agent('speaking');
  assert.equal(await done, 'spoke');
});

// ---- one questionnaire step per thing the person said ----
test('an answer the person never gave is refused; each new speech turn allows one step', async () => {
  const { createHeard, createAnswerGate } = await import('../src/callControl.js');
  const heard = createHeard();
  const gate = createAnswerGate(heard);
  heard.onSpeaking(); // "Hello?" before the opener
  gate.reset(); // the opener (disclosure) is sent
  assert.equal(gate.allow(), false, 'a "Hello?" is not agreement to continue');
  heard.onSpeaking(); // "Yes, go ahead."
  assert.equal(gate.allow(), true);
  gate.advance(); // disclose
  assert.equal(gate.allow(), false, 'the model cannot record an answer the lead has not given yet (E2E 2026-10-23)');
  heard.onSpeaking(); // "No, we closed the business last year."
  assert.equal(gate.allow(), true);
  gate.advance(); // record_answer
  heard.onSpeaking();
  heard.onSpeaking(); // a long answer split into two turns still allows the next step
  assert.equal(gate.allow(), true);
});

test('parallel tools cannot consume the same speech turn and delayed saves preserve newer speech', async () => {
  const { createHeard, createAnswerGate } = await import('../src/callControl.js');
  const heard = createHeard();
  const gate = createAnswerGate(heard);
  heard.onSpeaking();
  const first = gate.claim();
  assert.equal(first.turn, 1);
  assert.equal(gate.busy(), true);
  assert.equal(gate.claim(), null);
  heard.onSpeaking(); // A new reply arrives while the first save is in flight.
  first.complete(); first.release();
  assert.equal(gate.allow(), true);
  const next = gate.claim();
  assert.equal(next.turn, 2);
  next.release(); // Failed request: the same turn may be retried.
  const retry = gate.claim();
  retry.complete(); retry.release();
  assert.equal(gate.allow(), false);
});
