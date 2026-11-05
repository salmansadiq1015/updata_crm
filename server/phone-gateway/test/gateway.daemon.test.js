import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Esp32Device } from '../src/esp32/device.js';
import { signDial } from '../src/esp32/dialAuth.js';
import { CrmClient, CrmError, EventOutbox } from '../src/gateway/crmClient.js';
import { GatewayDaemon } from '../src/gateway/daemon.js';
import { KeepAwake } from '../src/gateway/system.js';
import { createFakeEsp32 } from './helpers/fakeEsp32.js';

const KEY = Buffer.alloc(32, 9);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(20);
  }
  throw new Error('condition not met in time');
};

test('outbox: persists before sending, retries transient failures, drops permanent ones, survives restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'outbox-'));
  const file = join(dir, 'outbox.jsonl');
  let fail = true;
  const sent = [];
  const client = { sendEvent: async (callId, e) => {
    if (e.type === 'bad') throw new CrmError('unknown call', { status: 404 });
    if (fail) throw new CrmError('offline', { retryable: true });
    sent.push(e.type);
  } };
  let clock = 0;
  const ob = new EventOutbox({ client, file, now: () => clock });
  ob.push('call_a', 'dialing');
  ob.push('call_a', 'ended', { reason: 'remote_hangup' });
  await ob.flush();
  assert.equal(ob.pending, 2);
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 2);
  // A restarted gateway picks the events up again.
  const reborn = new EventOutbox({ client, file, now: () => clock });
  assert.equal(reborn.pending, 2);
  fail = false;
  clock = 60_000;
  await reborn.flush();
  assert.deepEqual(sent, ['dialing', 'ended']);
  assert.equal(reborn.pending, 0);
  reborn.push('call_a', 'bad');
  await reborn.flush();
  assert.equal(reborn.pending, 0);
  assert.equal(readFileSync(file, 'utf8'), '');
});

test('CRM client refuses plain http except localhost, and maps errors', async () => {
  assert.throws(() => new CrmClient({ apiBase: 'http://crm.example.com/api/v1' }), /https/);
  const ok = new CrmClient({ apiBase: 'http://127.0.0.1:9097/api/v1', fetchImpl: async () => globalThis.Response.json({ success: false, error: { code: 'GATEWAY_UNAUTHORIZED', message: 'revoked' } }, { status: 401 }) });
  await assert.rejects(ok.heartbeat({}), (e) => e.status === 401 && e.code === 'GATEWAY_UNAUTHORIZED' && !e.retryable);
  const down = new CrmClient({ apiBase: 'https://crm.test/api/v1', fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(down.claim('00'.repeat(16)), (e) => e.retryable);
});

test('keep-awake: caffeinate on macOS while needed, released after; unsupported OS says so', () => {
  const spawned = [];
  const child = { killed: false, on() {}, kill() { this.killed = true; } };
  const k = new KeepAwake({ platform: 'darwin', spawn: (cmd, args) => { spawned.push([cmd, ...args]); return child; } });
  k.set(true);
  k.set(true);
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0][0], 'caffeinate');
  k.set(false);
  assert.ok(child.killed);
  const logs = [];
  new KeepAwake({ platform: 'win32', log: (e) => logs.push(e) }).set(true);
  assert.deepEqual(logs, ['keep_awake_unsupported']);
});

test('daemon: connects the board, keeps the phone linked, reports health, claims and runs one call', async () => {
  const fake = createFakeEsp32({ key: KEY, remoteHangupAfterMs: 150 });
  const heartbeats = [];
  const events = [];
  let jobs = 1;
  const crm = {
    async heartbeat(body) {
      heartbeats.push(body);
      return { voicePaused: false, activeCampaigns: 1, commands: [], readiness: { ok: true } };
    },
    async claim(nonce) {
      if (!jobs) return null;
      jobs -= 1;
      return {
        callId: 'call_daemon_1', callRef: 3, counter: 1, number: '+923001234567',
        mac: signDial(KEY, { sessionNonce: nonce, counter: 1, callRef: 3, number: '+923001234567' }).toString('hex'),
        livekit: { url: 'wss://lk.test', token: 't', identity: 'sip-call_daemon_1' }, ringTimeoutSeconds: 5, maxCallSeconds: 30,
      };
    },
    async sendEvent(callId, e) { events.push(e.type); },
  };
  const outbox = new EventOutbox({ client: crm });
  const awake = [];
  const daemon = new GatewayDaemon({
    crm, outbox, log: () => {}, portLabel: '/dev/cu.fake',
    keepAwake: { set: (v) => awake.push(v) },
    rtc: fakeRtc(),
    openDevice: async () => {
      const device = new Esp32Device(fake.stream, { ackTimeoutMs: 300, keepaliveMs: 100, lostAfterMs: 400 });
      return { device, info: await device.hello() };
    },
    closeDevice: async ({ device }) => device.close(),
    options: { heartbeatIdleMs: 50, heartbeatCallMs: 50, claimEveryMs: 50, hfpRetryMs: 0 },
  });
  await daemon.start();
  await until(() => fake.log.dials.length === 1);
  await until(() => events.includes('ended'));
  const hb = heartbeats.find((h) => h.state?.hfp === 'slc');
  assert.ok(hb, 'heartbeat reported the phone link');
  assert.equal(hb.board.firmware, '0.1.0-fake');
  assert.equal(hb.gateway.monitorSafe, true);
  assert.match(hb.board.sessionNonce, /^[0-9a-f]{32}$/);
  assert.ok(awake.includes(true));
  assert.deepEqual(events.filter((t) => t !== 'stats').slice(0, 3), ['dialing', 'ringing', 'answered']);
  await sleep(200);
  assert.equal(fake.log.dials.length, 1, 'one claim → one dial');
  await daemon.stop();
  assert.equal(awake.at(-1), false);
  fake.stop();
});

test('daemon: a revoked gateway stops itself', async () => {
  const fake = createFakeEsp32({ key: KEY });
  const daemon = new GatewayDaemon({
    crm: { heartbeat: async () => { throw new CrmError('revoked', { status: 401 }); }, claim: async () => null, sendEvent: async () => {} },
    outbox: new EventOutbox({ client: { sendEvent: async () => {} } }), log: () => {}, keepAwake: { set() {} }, rtc: fakeRtc(),
    openDevice: async () => {
      const device = new Esp32Device(fake.stream, { ackTimeoutMs: 300 });
      return { device, info: await device.hello() };
    },
    closeDevice: async ({ device }) => device.close(),
    options: { heartbeatIdleMs: 50 },
  });
  await daemon.start();
  await until(() => daemon.stopped);
  fake.stop();
});

test('daemon checks the control session before reserving a call and reconnects an expired session', async t => {
  let claims = 0, closed = 0;
  const daemon = new GatewayDaemon({
    crm: { claim: async () => { claims++; }, heartbeat: async () => ({}) },
    outbox: { flush: async () => {} }, keepAwake: { set() {} },
    closeDevice: async () => { closed++; },
  });
  daemon.settingsLoaded = true; daemon.crmConnected = true;
  daemon.scheduleHeartbeat = () => {};
  daemon.conn = { info: { keyProvisioned: true, sessionNonce: 'expired' }, device: {
    state: { hfp: 'slc', call: 0, callsetup: 0 },
    statusRequest: async () => { throw Object.assign(new Error('session expired'), { code: 'no_session' }); },
  } };
  t.after(() => daemon.stop());
  await assert.rejects(daemon.tryClaim(), error => error.code === 'no_session');
  assert.equal(claims, 0, 'no signed call may be reserved against an expired nonce');
  assert.equal(closed, 1);
  assert.equal(daemon.conn, null);
  assert.equal(Boolean(daemon.canClaim()), false);
});

test('a board reconnect during CRM claim never sends the old signed dial to the new session', async t => {
  const events = [];
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const daemon = new GatewayDaemon({ crm: { claim: () => pending },
    outbox: { push: (...args) => events.push(args), flush: async () => {} },
    keepAwake: { set() {} }, closeDevice: async () => {},
  });
  daemon.settingsLoaded = true; daemon.crmConnected = true;
  daemon.conn = { info: { keyProvisioned: true, sessionNonce: 'old' }, device: { state: { hfp: 'slc', call: 0, callsetup: 0 } } };
  t.after(() => daemon.stop());
  const claim = daemon.tryClaim();
  await new Promise(done => setImmediate(done));
  daemon.conn = { info: { sessionNonce: 'new' }, device: {} };
  resolve({ callId: 'old-session-call' });
  await claim;
  assert.deepEqual(events, [['old-session-call', 'dial_refused', { code: 'session_changed' }]]);
  assert.equal(daemon.runner, null);
});

test('daemon: slow call claims cannot overlap and a failed heartbeat suspends claims until recovery', async t => {
  let claims = 0, releaseClaim, offline = false;
  const pending = new Promise(resolve => { releaseClaim = resolve; });
  const daemon = new GatewayDaemon({
    crm: {
      async heartbeat() { if (offline) throw new Error('network timeout'); return {}; },
      async claim() { claims++; return pending; },
    },
    outbox: { flush: async () => {} }, keepAwake: { set() {} }, closeDevice: async () => {},
  });
  daemon.scheduleHeartbeat = () => {};
  daemon.conn = { info: { keyProvisioned: true, sessionNonce: 'nonce' }, device: { state: { hfp: 'slc', call: 0, callsetup: 0 } } };
  t.after(() => daemon.stop());
  assert.equal(Boolean(daemon.canClaim()), false);
  await daemon.heartbeat();
  const first = daemon.tryClaim();
  await daemon.tryClaim();
  assert.equal(claims, 1);
  releaseClaim(null);
  await first;
  assert.equal(daemon.claiming, false);
  offline = true;
  await daemon.heartbeat();
  await daemon.tryClaim();
  assert.equal(claims, 1);
  offline = false;
  await daemon.heartbeat();
  assert.equal(Boolean(daemon.canClaim()), true);
});

/** Minimal stand-in for @livekit/rtc-node: a room that connects and accepts audio. */
function fakeRtc() {
  class Room extends EventEmitter {
    constructor() {
      super();
      this.remoteParticipants = new Map([['agent-test', { identity: 'agent-test', attributes: { 'updata.agent_ready': 'true' } }]]);
      this.localParticipant = { publishTrack: async () => ({}), setAttributes: async () => {} };
    }

    async connect() {}

    async disconnect() {}
  }
  class AudioSource {
    constructor() {
      this.queuedDuration = 0;
    }

    async captureFrame() {}
  }
  return {
    Room,
    RoomEvent: { TrackSubscribed: 'trackSubscribed', ParticipantDisconnected: 'participantDisconnected', Disconnected: 'disconnected' },
    AudioSource,
    LocalAudioTrack: { createAudioTrack: () => ({}) },
    TrackPublishOptions: class {},
    TrackSource: { SOURCE_MICROPHONE: 2 },
    TrackKind: { KIND_AUDIO: 1 },
    AudioStream: class {},
    AudioFrame: class { constructor(data) { this.data = data; } },
  };
}

// ---- board health: reset reasons and restart loops ------------------------------------------------
test('an abnormal ESP32 restart is logged with its reason and reported to the CRM as a device error', async () => {
  const { GatewayDaemon } = await import('../src/gateway/daemon.js');
  const logs = [];
  const d = new GatewayDaemon({ crm: { apiBase: 'x' }, outbox: {}, log: (event, data) => logs.push({ event, ...data }), keepAwake: { set() {} }, openDevice: async () => { throw new Error('unused'); } });
  d.scheduleHeartbeat = () => {};
  d.onBoardBoot(1);
  assert.equal(d.lastError, null);
  d.onBoardBoot(9);
  assert.equal(d.lastError.code, 'BOARD_RESET_BROWNOUT');
  d.onBoardBoot(4);
  assert.equal(d.lastError.code, 'BOARD_RESET_PANIC');
  assert.deepEqual(logs.filter((l) => l.event === 'board_boot').map((l) => l.resetReason), ['POWERON', 'BROWNOUT', 'PANIC']);
});

test('HELLO unanswered twice: a restart loop is told apart from an unplugged board', async () => {
  const { GatewayDaemon } = await import('../src/gateway/daemon.js');
  const checks = [];
  const make = (banners) => {
    const d = new GatewayDaemon({ crm: { apiBase: 'x' }, outbox: {}, log: () => {}, keepAwake: { set() {} }, openDevice: async () => { throw new Error('unused'); },
      portLabel: '/dev/cu.test', checkBootLoop: async (p) => { checks.push(p); return { banners, reasons: banners ? ['rst:0x3 (SW_RESET)'] : [] }; } });
    d.scheduleHeartbeat = () => {};
    return d;
  };
  const err = Object.assign(new Error('no reply'), { code: 'no_reply' });
  const looping = make(16);
  await looping.diagnoseNoReply(err);
  assert.equal(checks.length, 0, 'one miss is not enough to sniff the port');
  await looping.diagnoseNoReply(err);
  assert.equal(looping.lastError.code, 'BOARD_BOOT_LOOP');
  assert.match(looping.lastError.message, /16 restarts/);
  const quiet = make(0);
  await quiet.diagnoseNoReply(err); await quiet.diagnoseNoReply(err);
  assert.equal(quiet.lastError, null);
  await quiet.diagnoseNoReply(Object.assign(new Error('x'), { code: 'closed' }));
  assert.equal(checks.length, 2);
});

test('keeps the computer awake while incoming AI answering is on, even with no call or campaign', async () => {
  const { GatewayDaemon } = await import('../src/gateway/daemon.js');
  const awake = [];
  let inbound = true;
  const crm = { apiBase: 'x', heartbeat: async () => ({ voicePaused: false, activeCampaigns: 0, inboundAnswering: inbound, commands: [], readiness: { ok: true } }) };
  const d = new GatewayDaemon({ crm, outbox: {}, log: () => {}, keepAwake: { set: (v) => awake.push(v) }, openDevice: async () => { throw new Error('unused'); } });
  d.scheduleHeartbeat = () => {};
  await d.heartbeat();
  inbound = false;
  await d.heartbeat();
  assert.deepEqual(awake, [true, false]);
});
