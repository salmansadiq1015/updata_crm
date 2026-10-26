// Gateway against the protocol-level fake (test/helpers/fakeEsp32.js). Simulation only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplexPair } from 'node:stream';

import { Esp32Device } from '../src/esp32/device.js';
import { signDial } from '../src/esp32/dialAuth.js';
import { createFakeEsp32 } from './helpers/fakeEsp32.js';

const KEY = Buffer.alloc(32, 9);
const NUMBER = '+923001234567';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connected(opts = {}) {
  const fake = createFakeEsp32({ key: KEY, ...opts });
  const dev = new Esp32Device(fake.stream, { ackTimeoutMs: 300, keepaliveMs: 100, lostAfterMs: 400 });
  const info = await dev.hello();
  await dev.hfpConnect();
  await dev.waitForState((s) => s.hfp === 'slc', 500);
  return { fake, dev, info, end: () => { dev.close(); fake.stop(); } };
}

const auth = (info, over = {}) => {
  const f = { callRef: 7, counter: 1, number: NUMBER, ...over };
  return { ...f, mac: signDial(over.key || KEY, { sessionNonce: info.sessionNonce, counter: f.counter, callRef: f.callRef, number: f.number }) };
};

test('hello reports firmware, capabilities and a fresh nonce per session', async () => {
  const fake = createFakeEsp32({ key: KEY });
  const dev = new Esp32Device(fake.stream, { ackTimeoutMs: 300 });
  const a = await dev.hello();
  const b = await dev.hello();
  assert.equal(a.firmware, '0.1.0-fake');
  assert.equal(a.keyProvisioned, true);
  assert.match(a.sessionNonce, /^[0-9a-f]{32}$/);
  assert.notEqual(a.sessionNonce, b.sessionNonce);
  dev.close();
  fake.stop();
});

test('wrong port / silent device: hello times out with a clear error', async () => {
  const [host] = duplexPair();
  const dev = new Esp32Device(host, { ackTimeoutMs: 100 });
  await assert.rejects(dev.hello(), (e) => e.code === 'no_reply');
  dev.close();
});

test('commands before hello are refused by the device (no session)', async () => {
  const fake = createFakeEsp32({ key: KEY });
  const dev = new Esp32Device(fake.stream, { ackTimeoutMs: 300 });
  await assert.rejects(dev.hfpConnect(), (e) => e.code === 'no_session');
  dev.close();
  fake.stop();
});

test('dial is refused without a key, with a bad MAC, on replay, and when busy', async () => {
  let c = await connected({ key: null });
  await assert.rejects(c.dev.dial(auth(c.info)), (e) => e.code === 'not_provisioned');
  c.end();

  c = await connected({ answerAfterMs: null });
  await assert.rejects(c.dev.dial(auth(c.info, { key: Buffer.alloc(32, 1) })), (e) => e.code === 'unauthorized');
  await assert.rejects(c.dev.dial({ ...auth(c.info), number: '+923009999999' }), (e) => e.code === 'unauthorized'); // MAC was for another number
  await c.dev.dial(auth(c.info));
  await assert.rejects(c.dev.dial(auth(c.info)), (e) => e.code === 'unauthorized'); // same counter = replay
  await sleep(20);
  await assert.rejects(c.dev.dial(auth(c.info, { counter: 2 })), (e) => e.code === 'busy');
  assert.deepEqual(c.fake.log.dials, [NUMBER]);
  c.end();
});

test('provisioning needs the BOOT button held', async () => {
  let fake = createFakeEsp32();
  let dev = new Esp32Device(fake.stream, { ackTimeoutMs: 300 });
  await dev.hello();
  await assert.rejects(dev.provisionKey(KEY), (e) => e.code === 'no_presence');
  dev.close();
  fake.stop();
  fake = createFakeEsp32({ buttonHeld: true });
  dev = new Esp32Device(fake.stream, { ackTimeoutMs: 300 });
  await dev.hello();
  await dev.provisionKey(KEY);
  assert.ok(fake.state.key.equals(KEY));
  dev.close();
  fake.stop();
});

test('audio: remote speech is recorded, the prompt reaches the phone in order, buffer stays bounded', async () => {
  const c = await connected();
  c.dev.startRecording();
  await c.dev.dial(auth(c.info));
  await c.dev.waitForState((s) => s.audio === 'on', 500);
  const prompt = Int16Array.from({ length: 4000 }, (_, i) => (i % 200) - 100); // 0.5 s
  let promptDone = false;
  c.dev.on('prompt_done', () => {
    promptDone = true;
  });
  c.dev.play(prompt);
  await sleep(900);
  assert.ok(promptDone, 'prompt_done fired');
  const played = c.fake.played();
  const samples = Array.from({ length: played.length / 2 }, (_, i) => played.readInt16LE(2 * i));
  const start = samples.findIndex((v) => v !== 0);
  assert.deepEqual(samples.slice(start, start + prompt.length), Array.from(prompt));
  assert.equal(c.fake.log.downOverruns, 0);
  const { remote, sent } = c.dev.recorded();
  assert.ok(remote.length >= 8000 * 0.5, `recorded ${remote.length} samples`);
  assert.ok(sent.length > 0);
  const sum = c.dev.audioSummary();
  assert.equal(sum.upSampleGaps, 0);
  assert.equal(sum.upSeqGaps, 0);
  assert.deepEqual(sum.codecs, [1]);
  c.end();
});

test('device unplugged: lost is emitted and pending commands fail', async () => {
  const c = await connected();
  const lost = new Promise((r) => c.dev.once('lost', r));
  c.fake.unplug();
  assert.match(await lost, /closed|no frame/);
  await assert.rejects(c.dev.statusRequest(), (e) => e.code === 'closed');
  c.end();
});

test('device stops answering: lost after lostAfterMs', async () => {
  const c = await connected();
  c.fake.state.session = true;
  const lost = new Promise((r) => c.dev.once('lost', r));
  c.fake.stream.removeAllListeners('data'); // keep the stream open but deliver nothing
  c.dev.stream.on('data', () => {});
  const reason = await lost;
  assert.match(reason, /no frame/);
  c.end();
});
