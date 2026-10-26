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
  const ok = new CrmClient({ apiBase: 'http://127.0.0.1:9097/api/v1', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ success: false, error: { code: 'GATEWAY_UNAUTHORIZED', message: 'revoked' } }) }) });
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

/** Minimal stand-in for @livekit/rtc-node: a room that connects and accepts audio. */
function fakeRtc() {
  class Room extends EventEmitter {
    constructor() {
      super();
      this.remoteParticipants = new Map();
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
