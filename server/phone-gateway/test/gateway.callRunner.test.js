// CallRunner against the protocol-level fake ESP32 + a fake LiveKit leg. Simulation only:
// proves the call flow, safety rules and event reporting, not Bluetooth or cellular audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { Esp32Device } from '../src/esp32/device.js';
import { signDial } from '../src/esp32/dialAuth.js';
import { CallRunner } from '../src/gateway/callRunner.js';
import { createFakeEsp32 } from './helpers/fakeEsp32.js';

const KEY = Buffer.alloc(32, 9);
const NUMBER = '+923001234567';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class FakeLeg extends EventEmitter {
  constructor({ failConnect = false } = {}) {
    super();
    this.failConnect = failConnect;
    this.statuses = [];
    this.phoneFrames = 0;
    this.closed = false;
    this.agentConnected = true;
    this.stats = {};
  }

  async connect() {
    if (this.failConnect) throw new Error('could not reach LiveKit');
  }

  async setCallStatus(s) {
    if (this.statuses[this.statuses.length - 1] !== s) this.statuses.push(s);
  }

  async waitForAgentReady() {}

  pushPhoneAudio() {
    this.phoneFrames += 1;
  }

  async close() {
    if (!this.closed) {
      this.closed = true;
      this.emit('closed', 'client');
    }
  }

  /** The agent "speaks": 20 ms frames of a 440 Hz tone at 8 kHz. */
  speak(ms = 300) {
    for (let t = 0; t < ms; t += 20) {
      this.emit('agentAudio', Int16Array.from({ length: 160 }, (_, i) => Math.round(8000 * Math.sin((2 * Math.PI * 440 * (t * 8 + i)) / 8000))));
    }
  }
}

const outbox = () => {
  const events = [];
  return { events, push: (callId, type, data) => events.push({ callId, type, data }), types: () => events.map((e) => e.type) };
};

async function setup(fakeOpts = {}, legOpts = {}, jobOver = {}, options = {}) {
  const fake = createFakeEsp32({ key: KEY, ...fakeOpts });
  const device = new Esp32Device(fake.stream, { ackTimeoutMs: 300, keepaliveMs: 100, lostAfterMs: 400 });
  const info = await device.hello();
  await device.hfpConnect();
  await device.waitForState((s) => s.hfp === 'slc', 500);
  const job = {
    callId: 'call_test_1', callRef: 7, counter: 1, number: NUMBER,
    mac: signDial(KEY, { sessionNonce: info.sessionNonce, counter: 1, callRef: 7, number: NUMBER }).toString('hex'),
    livekit: { url: 'wss://lk.test', token: 'tok', identity: 'sip-call_test_1' },
    ringTimeoutSeconds: 1, maxCallSeconds: 30, ...jobOver,
  };
  const ob = outbox();
  const crm = { stats: [], sendEvent: async (id, e) => { crm.stats.push(e); } };
  const leg = new FakeLeg(legOpts);
  const runner = new CallRunner({ device, job, outbox: ob, crm, leg, options: { audioWaitMs: 100, audioFailMs: 400, audioGraceMs: 150, audioRecoverMs: 50, remoteHangupConfirmMs: 75, hangupConfirmMs: 500, agentLeftMs: 200, statsEveryMs: 100, ...options } });
  return { fake, device, job, ob, crm, leg, runner, end: () => { device.close(); fake.stop(); } };
}

test('answered call: states mirrored into LiveKit, audio both ways, agent ends it', async () => {
  const c = await setup();
  const done = c.runner.start();
  await c.device.waitForState((s) => s.audio === 'on', 1000);
  await sleep(150);
  c.leg.speak(400);
  await sleep(500);
  assert.ok(c.leg.phoneFrames > 5, 'phone audio reached the room');
  const played = c.fake.played();
  assert.ok(played.some((b) => b !== 0), 'agent audio reached the phone');
  await c.leg.close(); // the CRM deleted the room after the agent finished
  const res = await done;
  assert.equal(res.result, 'ended');
  assert.deepEqual(c.ob.types(), ['dialing', 'ringing', 'answered', 'audio_opened', 'ended']);
  assert.equal(c.ob.events.at(-1).data.reason, 'local_hangup');
  assert.deepEqual(c.leg.statuses, ['dialing', 'ringing', 'active', 'hangup']);
  assert.ok(Number.isFinite(res.firstAiAudioMs));
  assert.equal(c.fake.log.hangups, 1);
  assert.ok(c.crm.stats.some((e) => e.type === 'stats' && e.data.firstAiAudioMs !== undefined));
  c.end();
});

test('idle before Android creates the outgoing call does not orphan the dial', async (t) => {
  const c = await setup();
  t.after(() => { if (c.runner.phase !== 'done') c.runner.finish('test_cleanup'); c.end(); });
  // Inject synchronously at accepted DIAL; timer polling could miss this phase
  // on a busy host and leave the test waiting forever.
  const push = c.ob.push;
  c.ob.push = (...args) => {
    push(...args);
    if (args[1] === 'dialing') {
      c.runner.onState({ hfp: 'slc', call: 0, callsetup: 0, audio: 'off', codec: 'none' });
      assert.equal(c.runner.phase, 'dialing');
      assert.equal(c.leg.closed, false);
    }
  };
  const done = c.runner.start();
  await c.device.waitForState((s) => s.call === 1, 1000);
  assert.ok(c.runner.sawSetup);
  await c.leg.close();
  const result = await done;
  assert.equal(result.result, 'ended');
  assert.equal(c.fake.log.hangups, 1);
  c.end();
});

test('configured AI gain reaches the phone without changing the return audio path', async (t) => {
  const c = await setup({}, {}, {}, { agentGainDb: 20 * Math.log10(2) });
  t.after(() => { if (c.runner.phase !== 'done') c.runner.finish('test_cleanup'); c.end(); });
  const done = c.runner.start();
  await c.device.waitForState((s) => s.audio === 'on', 1000);
  c.leg.speak(200);
  await sleep(400);
  const played = c.fake.played();
  let peak = 0;
  for (let i = 0; i < played.length; i += 2) peak = Math.max(peak, Math.abs(played.readInt16LE(i)));
  assert.equal(peak, 16000);
  assert.ok(c.leg.phoneFrames > 5);
  await c.leg.close();
  await done;
  c.end();
});

test('lead hangs up → ended remote_hangup, no hang-up sent by us', async () => {
  const c = await setup({ remoteHangupAfterMs: 200 });
  const res = await c.runner.start();
  assert.equal(res.result, 'ended');
  assert.equal(c.ob.events.at(-1).data.reason, 'remote_hangup');
  assert.equal(c.fake.log.hangups, 0);
  c.end();
});

test('a transient idle HFP indicator during speech does not end the call', async t => {
  const c = await setup();
  t.after(() => { if (c.runner.phase !== 'done') c.runner.finish('test_cleanup'); c.end(); });
  const done = c.runner.start();
  await c.device.waitForState(s => s.call === 1 && s.audio === 'on', 1000);
  c.runner.onState({ ...c.device.state, call: 0, callsetup: 0 });
  assert.equal(c.runner.phase, 'active');
  await sleep(120); // statusRequest confirms the real phone is still active
  assert.equal(c.runner.phase, 'active');
  assert.equal(c.fake.log.hangups, 0);
  assert.ok(!c.ob.types().includes('ended'));
  await c.leg.close(); await done;
});

test('SCO audio loss is recovered before the grace window without hanging up', async t => {
  const c = await setup();
  t.after(() => { if (c.runner.phase !== 'done') c.runner.finish('test_cleanup'); c.end(); });
  const done = c.runner.start();
  await c.device.waitForState(s => s.call === 1 && s.audio === 'on', 1000);
  await c.device.audioDisconnect();
  await c.device.waitForState(s => s.audio === 'on', 1000);
  await sleep(180);
  assert.equal(c.runner.phase, 'active');
  assert.equal(c.fake.log.hangups, 0);
  assert.ok(!c.ob.types().includes('audio_lost'));
  await c.leg.close(); await done;
});

test('nobody answers → ring timeout → hang up → not_answered', async () => {
  const c = await setup({ answerAfterMs: null }, {}, { ringTimeoutSeconds: 0.3 });
  const res = await c.runner.start();
  assert.equal(c.ob.events.at(-1).data.reason, 'not_answered');
  assert.equal(res.result, 'ended');
  assert.equal(c.fake.log.hangups, 1);
  c.end();
});

test('firmware refuses a dial signed for another session → dial_refused, nothing dialed', async () => {
  const c = await setup({}, {}, { mac: Buffer.alloc(32, 1).toString('hex') });
  const res = await c.runner.start();
  assert.equal(res.result, 'not_dialed');
  assert.deepEqual(c.ob.types(), ['dial_refused']);
  assert.equal(c.ob.events[0].data.code, 'unauthorized');
  assert.equal(c.fake.log.dials.length, 0);
  assert.ok(c.leg.closed);
  c.end();
});

test('LiveKit unreachable before dialing → dial_refused, the phone never dials', async () => {
  const c = await setup({}, { failConnect: true });
  const res = await c.runner.start();
  assert.equal(res.result, 'not_dialed');
  assert.equal(c.ob.events[0].data.code, 'livekit_unavailable');
  assert.equal(c.fake.log.dials.length, 0);
  c.end();
});

test('answered but the audio link never opens → audio_lost + hang up', async () => {
  const c = await setup({ audio: 'never' });
  const res = await c.runner.start();
  assert.equal(res.result, 'ended');
  assert.deepEqual(c.ob.types().slice(-2), ['audio_lost', 'ended']);
  assert.equal(c.ob.events.at(-1).data.reason, 'audio_failed');
  assert.ok(c.fake.log.commands.includes(0x22), 'gateway asked for the audio link');
  c.end();
});

test('SCO connected without decoded PCM fails promptly and hangs up the phone', async () => {
  const c = await setup({ audioFrames: false });
  const res = await c.runner.start();
  assert.equal(res.result, 'ended');
  assert.ok(c.ob.types().includes('audio_opened'));
  assert.equal(c.ob.events.find((e) => e.type === 'audio_lost').data.detail, 'no decoded phone audio after answer');
  assert.equal(c.ob.events.at(-1).data.reason, 'audio_failed');
  assert.equal(c.fake.log.hangups, 1);
  assert.equal(c.leg.closed, true);
  c.end();
});

test('USB unplugged mid-call → outcome_unknown (never a clean ending)', async () => {
  const c = await setup();
  const done = c.runner.start();
  await c.device.waitForState((s) => s.audio === 'on', 1000);
  c.fake.unplug();
  const res = await done;
  assert.equal(res.result, 'outcome_unknown');
  assert.equal(c.ob.types().at(-1), 'outcome_unknown');
  c.end();
});

test('takeover: audio goes back to the phone, the agent leaves, the call continues until the lead hangs up', async () => {
  const c = await setup({ remoteHangupAfterMs: 600 });
  const done = c.runner.start();
  await c.device.waitForState((s) => s.audio === 'on', 1000);
  await c.runner.command('takeover');
  assert.ok(c.leg.closed);
  await c.device.waitForState((s) => s.audio === 'off', 500);
  const res = await done;
  assert.equal(res.result, 'ended');
  assert.ok(c.ob.types().includes('command_done'));
  assert.equal(c.ob.events.at(-1).data.reason, 'remote_hangup');
  assert.equal(c.fake.log.hangups, 0, 'takeover never hangs up on the lead');
  c.end();
});

test('owner hang-up command ends the call', async () => {
  const c = await setup();
  const done = c.runner.start();
  await c.device.waitForState((s) => s.audio === 'on', 1000);
  await c.runner.command('hangup');
  const res = await done;
  assert.equal(res.result, 'ended');
  assert.ok(c.ob.events.some((e) => e.type === 'ended' && e.data.reason === 'owner_hangup'));
  assert.ok(c.ob.events.some((e) => e.type === 'command_done'));
  c.end();
});

test('worker startup failure refuses the call before firmware DIAL', async t => {
  const c = await setup();
  t.after(c.end);
  c.leg.waitForAgentReady = async () => { throw Object.assign(new Error('worker could not load context'), { code: 'agent_failed' }); };
  const result = await c.runner.start();
  assert.equal(result.result, 'not_dialed');
  assert.equal(c.fake.log.dials.length, 0);
  assert.equal(c.ob.events[0].data.code, 'agent_failed');
});
