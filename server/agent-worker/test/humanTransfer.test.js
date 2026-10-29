import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHumanTransfer, fallbackInstruction, waitForHumanParticipant } from '../src/humanTransfer.js';

/** Fake CRM tool API: scripted /transfer responses, records calls. */
function fakeApi({ request, statuses = [], execute = { status: 'transferred' } }) {
  const calls = [];
  return {
    calls,
    async requestTransfer(reason, summary) { calls.push(['request', reason, summary]); if (request instanceof Error) throw request; return request; },
    async transferStatus() { calls.push(['status']); const next = statuses.length > 1 ? statuses.shift() : statuses[0]; if (next instanceof Error) throw next; return next; },
    async executeTransfer() { calls.push(['execute']); return execute; },
    async transferJoined() { calls.push(['joined']); return { acknowledged: true }; },
  };
}
function fakeIo({ joined = true } = {}) {
  const log = [];
  return {
    log,
    async say(text) { log.push(['say', text]); },
    async waitForHuman() { log.push(['wait']); return joined; },
    async handOff(mode) { log.push(['handOff', mode]); },
    fallback(text) { log.push(['fallback', text]); },
  };
}
const fastClock = () => { let t = 0; return { now: () => t, sleep: async (ms) => { t += ms; } }; };

test('nobody available: the tool result is the scripted fallback and nothing is polled', async () => {
  const api = fakeApi({ request: { status: 'unavailable', fallback: { script: 'معذرت، اس وقت کوئی ساتھی کال نہیں لے سکتا۔', language: 'ur' } } });
  const transfer = createHumanTransfer({ api, ...fastClock() });
  const res = await transfer.request({ reason: 'asked for a person', summary: 'wants pricing' });
  assert.equal(res.watch, false);
  assert.equal(res.status, 'unavailable');
  assert.match(res.instruction, /معذرت/);
  assert.match(res.instruction, /request_callback/);
  assert.equal(transfer.phase(), 'fallback');
  assert.deepEqual(api.calls.map((c) => c[0]), ['request']);
});

test('a second transfer request on the same call is refused', async () => {
  const api = fakeApi({ request: { status: 'unavailable', fallback: null } });
  const transfer = createHumanTransfer({ api, ...fastClock() });
  await transfer.request({});
  const again = await transfer.request({});
  assert.equal(again.watch, false);
  assert.match(again.instruction, /already attempted/);
});

test('ringing then timeout → fallback with the server script, agent held quiet while ringing', async () => {
  const api = fakeApi({ request: { status: 'ringing', timeoutSeconds: 30, hold: { text: 'Please hold.' } }, statuses: [{ status: 'ringing' }, { status: 'ringing' }, { status: 'timeout', fallback: { script: 'Sorry, nobody is free. When can we call you?' } }] });
  const transfer = createHumanTransfer({ api, ...fastClock() });
  const res = await transfer.request({ reason: 'r', summary: 's' });
  assert.equal(res.watch, true);
  assert.match(res.instruction, /Please hold/);
  assert.equal(transfer.holding(), true);
  const io = fakeIo();
  const out = await transfer.watch(io);
  assert.equal(out.status, 'timeout');
  assert.equal(io.log.at(-1)[0], 'fallback');
  assert.match(io.log.at(-1)[1], /nobody is free/);
  assert.equal(transfer.holding(), false);
});

test('worker stops waiting after the deadline even if the CRM keeps saying ringing', async () => {
  const api = fakeApi({ request: { status: 'ringing', timeoutSeconds: 10 }, statuses: [{ status: 'ringing' }] });
  const transfer = createHumanTransfer({ api, pollMs: 1000, graceMs: 2000, ...fastClock() });
  await transfer.request({});
  const io = fakeIo();
  const out = await transfer.watch(io);
  assert.equal(out.status, 'timeout');
  assert.ok(api.calls.filter((c) => c[0] === 'status').length <= 14);
});

test('accepted in the CRM (web): handover line, waits for the person, reports joined, steps back', async () => {
  const api = fakeApi({ request: { status: 'ringing', timeoutSeconds: 30 }, statuses: [{ status: 'ringing' }, { status: 'accepted', mode: 'web', targetName: 'Sara Khan' }] });
  const transfer = createHumanTransfer({ api, ...fastClock() });
  await transfer.request({});
  const io = fakeIo({ joined: true });
  const out = await transfer.watch(io);
  assert.deepEqual(out, { status: 'accepted', mode: 'web' });
  assert.match(io.log[0][1], /Sara Khan is joining/);
  assert.deepEqual(io.log.slice(1).map((l) => l[0]), ['wait', 'handOff']);
  assert.ok(api.calls.some((c) => c[0] === 'joined'));
  assert.equal(transfer.handedOff(), true);
});

test('accepted but the person never joins → fallback', async () => {
  const api = fakeApi({ request: { status: 'ringing' }, statuses: [{ status: 'accepted', mode: 'web', fallback: null }] });
  const transfer = createHumanTransfer({ api, ...fastClock() });
  await transfer.request({});
  const io = fakeIo({ joined: false });
  const out = await transfer.watch(io);
  assert.equal(out.status, 'failed');
  assert.equal(io.log.at(-1)[0], 'fallback');
  assert.equal(transfer.handedOff(), false);
});

test('accepted to phone: speaks first, THEN asks the CRM to transfer the SIP leg', async () => {
  const api = fakeApi({ request: { status: 'ringing' }, statuses: [{ status: 'accepted', mode: 'phone', targetName: 'Ali' }] });
  const transfer = createHumanTransfer({ api, ...fastClock() });
  await transfer.request({});
  const io = fakeIo();
  const order = [];
  const say = io.say; io.say = async (t) => { order.push('say'); return say(t); };
  const exec = api.executeTransfer; api.executeTransfer = async () => { order.push('execute'); return exec(); };
  const out = await transfer.watch(io);
  assert.deepEqual(out, { status: 'accepted', mode: 'phone' });
  assert.deepEqual(order, ['say', 'execute']);
  assert.deepEqual(io.log.at(-1), ['handOff', 'phone']);
});

test('a failed SIP transfer falls back instead of dropping the caller', async () => {
  const api = fakeApi({ request: { status: 'ringing' }, statuses: [{ status: 'accepted', mode: 'phone' }], execute: { status: 'failed', fallback: { script: 'Sorry, the transfer did not work.' } } });
  const transfer = createHumanTransfer({ api, ...fastClock() });
  await transfer.request({});
  const io = fakeIo();
  const out = await transfer.watch(io);
  assert.equal(out.status, 'failed');
  assert.match(io.log.at(-1)[1], /transfer did not work/);
});

test('CRM unreachable on request → fallback, never a silent hold', async () => {
  const api = fakeApi({ request: new Error('ECONNREFUSED') });
  const transfer = createHumanTransfer({ api, ...fastClock() });
  const res = await transfer.request({});
  assert.equal(res.watch, false);
  assert.equal(res.instruction, fallbackInstruction(null));
});

test('waitForHumanParticipant only reacts to human- identities', async () => {
  const room = new EventEmitter();
  room.remoteParticipants = new Map();
  const pending = waitForHumanParticipant(room, 500);
  room.emit('participantConnected', { identity: 'monitor-1' });
  room.emit('participantConnected', { identity: 'human-abc' });
  assert.equal(await pending, true);
  assert.equal(room.listenerCount('participantConnected'), 0);
  const empty = new EventEmitter(); empty.remoteParticipants = new Map();
  assert.equal(await waitForHumanParticipant(empty, 30), false);
});
