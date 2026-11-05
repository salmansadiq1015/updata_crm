// Incoming calls: InboundWatcher + InboundCallRunner inside the daemon, against the protocol-level
// fake ESP32, a fake CRM and a fake LiveKit leg. Simulation only: proves the decision flow, safety
// rules and event reporting, not Bluetooth, cellular audio or a real voice agent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { Esp32Device } from '../src/esp32/device.js';
import { signDial } from '../src/esp32/dialAuth.js';
import { T } from '../src/esp32/protocol.js';
import { CrmClient, CrmError, EventOutbox } from '../src/gateway/crmClient.js';
import { GatewayDaemon } from '../src/gateway/daemon.js';
import { inboundCallRef } from '../src/gateway/inboundRunner.js';
import { createFakeEsp32 } from './helpers/fakeEsp32.js';

const KEY = Buffer.alloc(32, 9);
const CALL_ID = 'in_0123456789abcdef01234567';
const CALL_ID2 = 'in_fedcba9876543210fedcba98';
const CALLER2 = '+923004445566';
const CALLER = '+923001112233';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000, what = 'condition') => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(10);
  }
  throw new Error(`${what} not met in time`);
};

class FakeLeg extends EventEmitter {
  constructor({ ready = true, readyAfterMs = 0 } = {}) {
    super();
    this.ready = ready;
    this.readyAfterMs = readyAfterMs;
    this.statuses = [];
    this.phoneFrames = 0;
    this.connected = false;
    this.closed = false;
    this.agentConnected = true;
    this.stats = {};
  }

  async connect() { this.connected = true; }

  async setCallStatus(s) {
    if (!this.closed && this.statuses.at(-1) !== s) this.statuses.push(s);
  }

  waitForAgentReady(timeoutMs) {
    return new Promise((resolve, reject) => {
      if (this.ready) setTimeout(resolve, this.readyAfterMs);
      else setTimeout(() => reject(Object.assign(new Error('Voice agent did not finish startup'), { code: 'agent_not_ready' })), timeoutMs);
    });
  }

  pushPhoneAudio() { this.phoneFrames += 1; }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.emit('closed', 'client');
  }

  speak(ms = 300) {
    for (let t = 0; t < ms; t += 20) {
      this.emit('agentAudio', Int16Array.from({ length: 160 }, (_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 440 * (t * 8 + i)) / 8000))));
    }
  }
}

const aiJob = (over = {}) => ({
  callId: CALL_ID, status: 'QUEUED', action: 'answer_ai', ringTimeoutSeconds: 3, answerAfterMs: 200, maxCallSeconds: 30,
  roomName: `inbound-${CALL_ID}`, livekit: { url: 'wss://lk.test', identity: `sip-${CALL_ID}`, token: 'tok' }, ...over,
});
const humanJob = (action = 'let_ring') => ({ callId: CALL_ID, status: 'RINGING', action, ringTimeoutSeconds: 45 });

/** Daemon + fake board + fake CRM. `ring(body, n)` is the CRM's /inbound/ring handler. */
async function harness(t, { fakeOpts = {}, ring = () => humanJob(), answerJob = () => aiJob({ answerAfterMs: 0 }), legOpts = {}, claim = async () => null } = {}) {
  const fake = createFakeEsp32({ key: KEY, ...fakeOpts });
  const crm = {
    rings: [], events: [], stats: [], claims: [], answerJobs: 0, pending: [],
    async heartbeat() { return { voicePaused: false, activeCampaigns: 0, readiness: { ok: true }, commands: [...crm.pending] }; },
    async claim(nonce) { crm.claims.push({ at: Date.now(), ringing: fake.state.callsetup === 1 }); return claim(nonce); },
    async ringInbound(body) { crm.rings.push(body); return ring(body, crm.rings.length); },
    async inboundAnswerJob(callId) { crm.answerJobs += 1; return answerJob(callId); },
    async sendEvent(callId, e) {
      if (e.type === 'stats') { crm.stats.push(e); return; }
      crm.events.push({ callId, ...e });
      // The CRM stops re-delivering a command once the gateway acknowledges it.
      if (e.type === 'command_done') crm.pending = crm.pending.filter((c) => c.type !== e.data.type);
    },
  };
  const logs = [];
  const daemon = new GatewayDaemon({
    crm, outbox: new EventOutbox({ client: crm }), log: (event, data) => logs.push({ event, ...data }), keepAwake: { set() {} }, rtc: null,
    openDevice: async () => {
      const device = new Esp32Device(fake.stream, { ackTimeoutMs: 300, keepaliveMs: 100, lostAfterMs: 400 });
      return { device, info: await device.hello() };
    },
    closeDevice: async ({ device }) => device.close(),
    options: {
      heartbeatIdleMs: 50, heartbeatCallMs: 40, claimEveryMs: 40, hfpRetryMs: 0,
      inbound: { clipWaitMs: 100, reportRetryMs: [40, 80], waitingSettleMs: 50 },
      inboundRunner: { audioWaitMs: 100, audioFailMs: 400, audioGraceMs: 150, audioRecoverMs: 50, remoteHangupConfirmMs: 75, hangupConfirmMs: 500, agentLeftMs: 200, statsEveryMs: 100, answerConfirmMs: 300 },
    },
  });
  const legs = [];
  daemon.makeLeg = (job) => {
    const leg = new FakeLeg(legOpts);
    leg.job = job;
    legs.push(leg);
    return leg;
  };
  t.after(async () => {
    await daemon.stop();
    fake.stop();
  });
  await daemon.start();
  await until(() => daemon.conn?.device.state?.hfp === 'slc' && daemon.settingsLoaded, 3000, 'phone link');
  const types = (callId = null) => crm.events.filter((e) => !callId || e.callId === callId).map((e) => e.type);
  const event = (type) => crm.events.find((e) => e.type === type);
  const answersSent = () => fake.log.commands.filter((c) => c === T.ANSWER).length;
  const eventOf = (callId, type) => crm.events.find((e) => e.callId === callId && e.type === type);
  return { fake, crm, daemon, legs, logs, types, event, eventOf, answersSent };
}

test('AI answer: waits for the agent and answerAfterMs, answers once, bridges audio, reports in order', async (t) => {
  const h = await harness(t, { ring: () => aiJob() });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('answered'), 4000, 'answered');
  assert.equal(h.crm.rings.length, 1);
  const [ring] = h.crm.rings;
  assert.match(ring.sessionId, /^[A-Za-z0-9_-]{8,80}$/);
  assert.equal(ring.number, CALLER, 'CLIP collected before reporting');
  assert.equal(ring.simSlot, null);
  assert.ok(Date.parse(h.event('answering').at) - Date.parse(ring.at) >= 180, 'answered no earlier than answerAfterMs after the first ring');
  assert.equal(h.daemon.conn.device.state.hostOwned, true, 'the firmware marks an answered call host-owned');

  await until(() => h.types().includes('audio_opened'), 2000, 'audio');
  await sleep(100);
  h.legs[0].speak(400);
  await sleep(400);
  assert.ok(h.legs[0].phoneFrames > 5, 'caller audio reached the room');
  assert.ok(h.fake.played().some((b) => b !== 0), 'agent audio reached the phone');
  assert.equal(h.legs[0].job.livekit.identity, `sip-${CALL_ID}`);

  h.fake.callerHangup();
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(), ['ringing', 'answering', 'answered', 'audio_opened', 'ended']);
  assert.equal(h.event('ended').data.reason, 'remote_hangup');
  assert.equal(h.answersSent(), 1, 'ANSWER sent exactly once');
  assert.deepEqual(h.legs[0].statuses, ['ringing', 'active', 'hangup']);
  assert.ok(h.crm.stats.length > 0, 'live stats while the AI call is up');
  assert.ok(h.crm.events.every((e) => e.callId === CALL_ID));
  // Idle again: the watcher releases the line and outbound claims resume.
  const claimsBefore = h.crm.claims.length;
  await until(() => !h.daemon.inbound.busy && !h.daemon.runner && h.crm.claims.length > claimsBefore, 2000, 'claims resumed');
  assert.equal(h.crm.claims.filter((c) => c.ringing).length, 0, 'never claimed an outbound call while the phone rang');
});

test('agent not ready before the ring timeout: no ANSWER, agent_unavailable, tracked as a human call', async (t) => {
  const h = await harness(t, { ring: () => aiJob({ ringTimeoutSeconds: 1, answerAfterMs: 100 }), legOpts: { ready: false } });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('agent_unavailable'), 3000, 'agent_unavailable');
  assert.equal(h.event('agent_unavailable').data.code, 'agent_not_ready');
  assert.equal(h.answersSent(), 0);
  await until(() => h.legs[0].closed, 1000, 'room left');
  assert.equal(h.fake.state.callsetup, 1, 'still ringing for a person');
  h.fake.stopRinging();
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(), ['ringing', 'agent_unavailable', 'ended']);
  assert.equal(h.event('ended').data.reason, 'not_answered');
  assert.equal(h.answersSent(), 0);
});

test('a person answers on the handset first: answered_elsewhere, room left, audio handed back, no ANSWER', async (t) => {
  const h = await harness(t, { ring: () => aiJob({ answerAfterMs: 1500, ringTimeoutSeconds: 5 }) });
  h.fake.incoming({ number: CALLER });
  await until(() => h.legs[0]?.statuses.includes('ringing'), 2000, 'agent joined');
  h.fake.answerOnHandset({ audio: true }); // Android routed the call audio to the bridge
  await until(() => h.types().includes('answered_elsewhere'), 2000, 'answered_elsewhere');
  await until(() => h.legs[0].closed, 1000, 'room left');
  await until(() => h.fake.log.audioReleases === 1, 1000, 'audio released to the handset');
  await sleep(1600); // past answerAfterMs: must still not answer
  assert.equal(h.answersSent(), 0);
  assert.equal(h.fake.state.call, 1);
  h.fake.callerHangup();
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(), ['ringing', 'answered_elsewhere', 'ended']);
  assert.equal(h.event('ended').data.reason, 'remote_hangup');
});

test('let_ring: the caller gives up → ended not_answered; no room, no ANSWER', async (t) => {
  const h = await harness(t, { ring: () => humanJob('let_ring') });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('ringing'), 2000, 'ringing');
  await sleep(150);
  h.fake.stopRinging();
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(), ['ringing', 'ended']);
  assert.equal(h.event('ended').data.reason, 'not_answered');
  assert.equal(h.legs.length, 0);
  assert.equal(h.answersSent(), 0);
});

test('ignore + person answers then hangs up → answered_elsewhere, ended remote_hangup', async (t) => {
  const h = await harness(t, { ring: () => humanJob('ignore') });
  h.fake.incoming({ clip: false }); // withheld number
  await until(() => h.types().includes('ringing'), 2000, 'ringing');
  assert.equal(h.crm.rings[0].number, '');
  h.fake.answerOnHandset();
  await until(() => h.types().includes('answered_elsewhere'), 2000, 'answered_elsewhere');
  h.fake.callerHangup();
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(), ['ringing', 'answered_elsewhere', 'ended']);
  assert.equal(h.event('ended').data.reason, 'remote_hangup');
});

test('owner reject command: HANGUP once while ringing → command_done reject, ended rejected', async (t) => {
  const h = await harness(t, { ring: () => humanJob('let_ring') });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('ringing'), 2000, 'ringing');
  h.crm.pending.push({ type: 'reject', callId: CALL_ID, inbound: true });
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(), ['ringing', 'command_done', 'ended']);
  assert.equal(h.event('command_done').data.type, 'reject');
  assert.equal(h.event('ended').data.reason, 'rejected');
  assert.equal(h.fake.log.hangups, 1, 'one HANGUP although the heartbeat repeated the command');
});

test('owner answer command: fetches the answer job once and the AI answers immediately', async (t) => {
  const h = await harness(t, { ring: () => humanJob('let_ring'), answerJob: () => aiJob({ answerAfterMs: 4000 }) });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('ringing'), 2000, 'ringing');
  await sleep(100);
  const askedAt = Date.now();
  h.crm.pending.push({ type: 'answer', callId: CALL_ID, inbound: true });
  await until(() => h.types().includes('answered'), 3000, 'answered');
  assert.ok(Date.now() - askedAt < 2000, 'answered promptly, not after answerAfterMs');
  assert.equal(h.crm.answerJobs, 1);
  assert.equal(h.answersSent(), 1);
  await until(() => h.types().includes('audio_opened'), 2000, 'audio');
  h.fake.callerHangup();
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(), ['ringing', 'command_done', 'answering', 'answered', 'audio_opened', 'ended']);
  assert.equal(h.event('command_done').data.type, 'answer');
});

test('owner takeover and hangup on an AI-answered call', async (t) => {
  const h = await harness(t, { ring: () => aiJob({ answerAfterMs: 0 }) });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('audio_opened'), 3000, 'audio');
  h.crm.pending.push({ type: 'takeover', callId: CALL_ID, inbound: true });
  await until(() => h.types().includes('command_done'), 2000, 'takeover');
  assert.equal(h.legs[0].closed, true, 'agent room left on takeover');
  assert.equal(h.fake.log.audioReleases, 1, 'audio moved to the handset');
  assert.equal(h.fake.state.owned, false, 'a taken-over call belongs to the person (watchdog will not end it)');
  h.crm.pending.push({ type: 'hangup', callId: CALL_ID, inbound: true });
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(), ['ringing', 'answering', 'answered', 'audio_opened', 'command_done', 'command_done', 'ended']);
  assert.equal(h.event('ended').data.reason, 'owner_hangup');
  assert.equal(h.fake.log.hangups, 1);
});

test('ring report is retried with the SAME sessionId', async (t) => {
  const h = await harness(t, {
    ring: (body, n) => {
      if (n === 1) throw new CrmError('CRM unreachable', { code: 'CRM_UNREACHABLE', retryable: true });
      return humanJob('let_ring');
    },
  });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('ringing'), 3000, 'ringing');
  assert.equal(h.crm.rings.length, 2);
  assert.equal(h.crm.rings[0].sessionId, h.crm.rings[1].sessionId);
  assert.equal(h.crm.rings[0].at, h.crm.rings[1].at);
  h.fake.stopRinging();
  await until(() => h.types().includes('ended'), 2000, 'ended');
});

test('CRM unreachable: never answers; phone keeps ringing; no outbound claim until it is idle', async (t) => {
  const h = await harness(t, { ring: () => { throw new CrmError('CRM unreachable', { code: 'CRM_UNREACHABLE', retryable: true }); } });
  h.fake.incoming({ number: CALLER });
  await until(() => h.crm.rings.length >= 3, 3000, 'ring retries');
  await sleep(300);
  assert.equal(h.answersSent(), 0);
  assert.equal(h.fake.state.callsetup, 1, 'still ringing for a person');
  assert.equal(h.crm.events.length, 0);
  assert.equal(h.daemon.inbound.busy, true);
  assert.equal(new Set(h.crm.rings.map((r) => r.sessionId)).size, 1);
  h.fake.stopRinging();
  await until(() => !h.daemon.inbound.busy, 2000, 'watcher released');
  const claimsBefore = h.crm.claims.length;
  await until(() => h.crm.claims.length > claimsBefore, 2000, 'claims resumed');
  assert.equal(h.crm.claims.filter((c) => c.ringing).length, 0);
});

test('a ring during an in-flight outbound claim: the claimed call is refused, never dialed', async (t) => {
  let release;
  let claims = 0;
  const h = await harness(t, {
    ring: () => humanJob('let_ring'),
    claim: () => {
      claims += 1;
      return claims === 1 ? new Promise((resolve) => { release = resolve; }) : null;
    },
  });
  await until(() => release, 2000, 'claim in flight');
  h.fake.incoming({ number: CALLER });
  await until(() => h.daemon.inbound.busy, 2000, 'ring noticed');
  release({ callId: 'call_out_1', callRef: 3, counter: 1, number: '+923009999999', mac: '00'.repeat(32), livekit: { url: 'wss://lk.test', token: 't' } });
  await until(() => h.crm.events.some((e) => e.type === 'dial_refused'), 2000, 'dial_refused');
  const refused = h.crm.events.find((e) => e.type === 'dial_refused');
  assert.equal(refused.callId, 'call_out_1');
  assert.equal(refused.data.code, 'incoming_call');
  assert.equal(h.fake.log.dials.length, 0);
  h.fake.stopRinging();
  await until(() => h.crm.events.some((e) => e.type === 'ended'), 2000, 'ended');
});

test('old firmware (no ANSWER capability): agent_unavailable firmware_no_answer, no room, no ANSWER', async (t) => {
  const h = await harness(t, { fakeOpts: { answerSupported: false }, ring: () => aiJob({ answerAfterMs: 0 }) });
  assert.equal(h.daemon.conn.device.supportsAnswer, false);
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('agent_unavailable'), 2000, 'agent_unavailable');
  assert.equal(h.event('agent_unavailable').data.code, 'firmware_no_answer');
  assert.equal(h.legs.length, 0);
  assert.equal(h.answersSent(), 0);
  h.fake.stopRinging();
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(), ['ringing', 'agent_unavailable', 'ended']);
});

test('firmware answering unknown_type to ANSWER → firmware_no_answer, call left ringing', async (t) => {
  const h = await harness(t, { fakeOpts: { answerAck: 2 }, ring: () => aiJob({ answerAfterMs: 0 }) });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('agent_unavailable'), 2000, 'agent_unavailable');
  assert.deepEqual(h.types(), ['ringing', 'answering', 'agent_unavailable']);
  assert.equal(h.event('agent_unavailable').data.code, 'firmware_no_answer');
  await until(() => h.legs[0].closed, 1000, 'room left');
  assert.equal(h.fake.state.callsetup, 1);
  h.fake.stopRinging();
  await until(() => h.types().includes('ended'), 2000, 'ended');
  assert.equal(h.event('ended').data.reason, 'not_answered');
});

test('ESP32 lost during an AI-answered call → outcome_unknown', async (t) => {
  const h = await harness(t, { ring: () => aiJob({ answerAfterMs: 0 }) });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types().includes('audio_opened'), 3000, 'audio');
  h.fake.unplug();
  await until(() => h.types().includes('outcome_unknown'), 2000, 'outcome_unknown');
  assert.equal(h.types().includes('ended'), false);
});

// ---- call waiting: a second call while the phone is in a call ---------------------------------------

const outboundJob = (nonce) => ({
  callId: 'call_out_1', callRef: 3, counter: 1, number: '+923009999999',
  mac: signDial(KEY, { sessionNonce: nonce, counter: 1, callRef: 3, number: '+923009999999' }).toString('hex'),
  livekit: { url: 'wss://lk.test', token: 't', identity: 'sip-call_out_1' }, ringTimeoutSeconds: 5, maxCallSeconds: 30,
});

test('call waiting during an AI-answered call: reported waiting, never answered; caller gives up → ended not_answered', async (t) => {
  const h = await harness(t, {
    // Even if a CRM said answer_ai for a waiting call, the gateway must not answer it.
    ring: (body) => (body.waiting ? aiJob({ callId: CALL_ID2, answerAfterMs: 0 }) : aiJob({ answerAfterMs: 0 })),
  });
  h.fake.incoming({ number: CALLER });
  await until(() => h.types(CALL_ID).includes('audio_opened'), 3000, 'first call up');
  h.fake.incoming({ number: CALLER2 }); // call=1 + callsetup=1 + CALL_WAITING
  await until(() => h.types(CALL_ID2).includes('ringing'), 2000, 'waiting call reported');
  assert.equal(h.crm.rings.length, 2);
  assert.deepEqual({ ...h.crm.rings[1], sessionId: 'x', at: 'x' }, { sessionId: 'x', number: CALLER2, simSlot: null, at: 'x', waiting: true });
  assert.notEqual(h.crm.rings[1].sessionId, h.crm.rings[0].sessionId);
  assert.equal(h.daemon.inbound.busy, true);
  await sleep(300);
  assert.equal(h.answersSent(), 1, 'the waiting call is never answered');
  assert.equal(h.legs.length, 1, 'no voice room for the waiting call');
  h.fake.stopRinging(); // the waiting caller gives up; the AI call stays up
  await until(() => h.types(CALL_ID2).includes('ended'), 2000, 'waiting call ended');
  assert.deepEqual(h.types(CALL_ID2), ['ringing', 'ended']);
  assert.equal(h.eventOf(CALL_ID2, 'ended').data.reason, 'not_answered');
  assert.equal(h.types(CALL_ID).includes('ended'), false, 'the AI call continues');
  assert.equal(h.fake.state.call, 1);
  h.fake.callerHangup();
  await until(() => h.types(CALL_ID).includes('ended'), 2000, 'first call ended');
  assert.equal(h.eventOf(CALL_ID, 'ended').data.reason, 'remote_hangup');
  assert.equal(h.crm.rings.length, 2, 'nothing re-reported');
});

test('call waiting during an outbound call: when that call ends, the SAME session is re-reported (waiting:false) and the AI answers', async (t) => {
  let claimed = 0;
  const h = await harness(t, {
    claim: async (nonce) => (claimed++ ? null : outboundJob(nonce)),
    ring: (body) => (body.waiting ? { ...humanJob('let_ring'), callId: CALL_ID2 } : aiJob({ callId: CALL_ID2, answerAfterMs: 0 })),
  });
  await until(() => h.types('call_out_1').includes('audio_opened'), 3000, 'outbound call up');
  h.fake.incoming({ number: CALLER2 });
  await until(() => h.types(CALL_ID2).includes('ringing'), 2000, 'waiting call reported');
  assert.equal(h.crm.rings[0].waiting, true);
  assert.equal(h.crm.rings[0].number, CALLER2);
  assert.equal(h.answersSent(), 0);
  h.fake.callerHangup(); // the lead hangs up; the waiting call now rings on its own
  await until(() => h.types('call_out_1').includes('ended'), 3000, 'outbound call ended');
  assert.equal(h.eventOf('call_out_1', 'ended').data.reason, 'remote_hangup');
  await until(() => h.types(CALL_ID2).includes('answered'), 4000, 'AI answered the released call');
  assert.equal(h.crm.rings.length, 2);
  assert.equal(h.crm.rings[1].sessionId, h.crm.rings[0].sessionId, 'same session: the CRM re-decides, no duplicate');
  assert.equal(h.crm.rings[1].waiting, false);
  assert.equal(h.crm.rings[1].number, CALLER2);
  assert.equal(h.answersSent(), 1);
  assert.equal(h.types(CALL_ID2).includes('ended'), false, 'the waiting session is not ended when handed over');
  await until(() => h.types(CALL_ID2).includes('audio_opened'), 2000, 'audio');
  h.fake.callerHangup();
  await until(() => h.types(CALL_ID2).includes('ended'), 2000, 'ended');
  assert.deepEqual(h.types(CALL_ID2), ['ringing', 'ringing', 'answering', 'answered', 'audio_opened', 'ended']);
  assert.equal(h.fake.log.dials.length, 1);
});

test('call waiting: both calls end at once → waiting call ended not_answered, outbound call remote_hangup', async (t) => {
  let claimed = 0;
  const h = await harness(t, {
    claim: async (nonce) => (claimed++ ? null : outboundJob(nonce)),
    ring: (body) => ({ ...humanJob('let_ring'), callId: CALL_ID2 }),
  });
  await until(() => h.types('call_out_1').includes('audio_opened'), 3000, 'outbound call up');
  h.fake.incoming({ clip: false });
  await until(() => h.types(CALL_ID2).includes('ringing'), 2000, 'waiting call reported');
  assert.equal(h.crm.rings[0].number, '', 'withheld waiting number');
  h.fake.allCallsEnd();
  await until(() => h.types(CALL_ID2).includes('ended') && h.types('call_out_1').includes('ended'), 3000, 'both ended');
  assert.equal(h.eventOf(CALL_ID2, 'ended').data.reason, 'not_answered');
  assert.equal(h.eventOf('call_out_1', 'ended').data.reason, 'remote_hangup');
  assert.equal(h.answersSent(), 0);
  await until(() => !h.daemon.inbound.busy, 1000, 'watcher released');
});

// ---- firmware host-owned watchdog semantics (modelled by the fake; C twin in test_main.c) --------

async function board(t, opts = {}) {
  const fake = createFakeEsp32({ key: KEY, hostTimeoutMs: 120, ...opts });
  const device = new Esp32Device(fake.stream, { ackTimeoutMs: 300, keepaliveMs: 30, lostAfterMs: 2000 });
  await device.hello();
  await device.hfpConnect();
  await device.waitForState((s) => s.hfp === 'slc', 500);
  t.after(() => { device.close(); fake.stop(); });
  return { fake, device };
}

test('watchdog: a ringing call left for a person survives a dead host', async (t) => {
  const { fake, device } = await board(t);
  fake.incoming({ number: CALLER });
  await device.waitForState((s) => s.callsetup === 1, 500);
  device.close(); // host goes silent
  await sleep(400);
  assert.equal(fake.state.callsetup, 1, 'still ringing');
  assert.equal(fake.log.watchdogHangups, 0);
});

test('watchdog: a call a person answered on the handset survives a dead host', async (t) => {
  const { fake, device } = await board(t);
  fake.incoming({ number: CALLER });
  fake.answerOnHandset();
  await device.waitForState((s) => s.call === 1, 500);
  assert.equal(device.state.hostOwned, false);
  device.close();
  await sleep(400);
  assert.equal(fake.state.call, 1);
  assert.equal(fake.log.watchdogHangups, 0);
});

test('watchdog: an AI-answered call is ended when the host dies, and reported to the next session', async (t) => {
  const { fake, device } = await board(t);
  fake.incoming({ number: CALLER });
  await device.waitForState((s) => s.callsetup === 1, 500);
  const ack = await device.answer(inboundCallRef(CALL_ID));
  assert.equal(ack.result, 'ok');
  await device.waitForState((s) => s.call === 1 && s.hostOwned === true, 500);
  // Answer is only for a plain incoming call.
  assert.equal((await device.answer(5)).result, 'bad_state');
  device.close();
  await until(() => fake.log.watchdogHangups === 1, 1000, 'watchdog hang-up');
  assert.equal(fake.state.call, 0);
  const next = new Esp32Device(fake.stream, { ackTimeoutMs: 300 });
  t.after(() => next.close());
  const lostEvent = new Promise((resolve) => next.on('event', (e) => { if (e.name === 'host_lost_hangup') resolve(e); }));
  await next.hello();
  await lostEvent;
});

test('watchdog: after an AI call with a call waiting ends, the waiting call ringing alone survives a dead host', async (t) => {
  const { fake, device } = await board(t);
  fake.incoming({ number: CALLER });
  await device.waitForState((s) => s.callsetup === 1, 500);
  assert.equal((await device.answer(inboundCallRef(CALL_ID))).result, 'ok');
  await device.waitForState((s) => s.call === 1 && s.callsetup === 0, 500);
  fake.incoming({ number: CALLER2 });
  await device.waitForState((s) => s.call === 1 && s.callsetup === 1, 500);
  assert.equal(device.state.hostOwned, true, 'the AI call is still the host\'s');
  assert.equal((await device.answer(9)).result, 'bad_state', 'a waiting call cannot be answered');
  fake.callerHangup(); // the AI call ends; the waiting call rings on its own
  await device.waitForState((s) => s.call === 0 && s.callsetup === 1, 500);
  assert.equal(device.state.hostOwned, false);
  device.close();
  await sleep(400);
  assert.equal(fake.state.callsetup, 1, 'still ringing for a person');
  assert.equal(fake.log.watchdogHangups, 0);
});

test('heartbeat reports whether the firmware can answer', async (t) => {
  const h = await harness(t);
  assert.equal(h.daemon.heartbeatBody().board.canAnswer, true);
});

test('heartbeat reports canAnswer=false for old firmware', async (t) => {
  const h = await harness(t, { fakeOpts: { answerSupported: false } });
  assert.equal(h.daemon.heartbeatBody().board.canAnswer, false);
});

test('crm client routes incoming-call events and endpoints to the inbound API', async () => {
  const calls = [];
  const client = new CrmClient({
    apiBase: 'https://crm.test/api/v1', token: 'tok',
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return globalThis.Response.json({ success: true, data: { ok: true } }); },
  });
  await client.sendEvent(CALL_ID, { eventId: 'e1234567', type: 'ringing' });
  await client.sendEvent('call_abc', { eventId: 'e1234567', type: 'dialing' });
  await client.ringInbound({ sessionId: 'ring_abcdefgh', number: CALLER, simSlot: null, at: '2026-11-04T00:00:00.000Z' });
  await client.inboundAnswerJob(CALL_ID);
  assert.deepEqual(calls.map((c) => c.url), [
    `https://crm.test/api/v1/paired-phone/gateway/inbound/calls/${CALL_ID}/events`,
    'https://crm.test/api/v1/paired-phone/gateway/calls/call_abc/events',
    'https://crm.test/api/v1/paired-phone/gateway/inbound/ring',
    `https://crm.test/api/v1/paired-phone/gateway/inbound/calls/${CALL_ID}/answer-job`,
  ]);
  assert.deepEqual(calls[2].body, { sessionId: 'ring_abcdefgh', number: CALLER, simSlot: null, at: '2026-11-04T00:00:00.000Z', waiting: false });
  assert.ok(inboundCallRef(CALL_ID) > 0 && inboundCallRef(CALL_ID) <= 0xffffffff);
});
