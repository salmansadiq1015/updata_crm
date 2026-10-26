// Full probe call flow against the protocol-level fake. Simulation only: proves the orchestration,
// evidence and safety rules, not Bluetooth or cellular audio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Esp32Device } from '../src/esp32/device.js';
import { createEvidence } from '../src/esp32/evidence.js';
import { runProbeCall } from '../src/esp32/probeSession.js';
import { readWav } from '../src/esp32/pcm.js';
import { createFakeEsp32 } from './helpers/fakeEsp32.js';

const KEY = Buffer.alloc(32, 9);
const NUMBER = '+923001234567';
const FAST = { listenS: 0.3, afterS: 0.3, ringTimeoutS: 1, audioWaitS: 0.2, audioFailS: 0.6, hangupTimeoutS: 0.5, slcTimeoutS: 1 };

async function probe(fakeOpts, options = FAST) {
  const fake = createFakeEsp32({ key: KEY, ...fakeOpts });
  const dev = new Esp32Device(fake.stream, { ackTimeoutMs: 300, keepaliveMs: 100, lostAfterMs: 400 });
  const dir = mkdtempSync(join(tmpdir(), 'esp32-probe-'));
  const ev = createEvidence(dir, { echo: false });
  const prompt = Int16Array.from({ length: 1600 }, (_, i) => (i % 80) * 50);
  const result = await runProbeCall({ device: dev, number: NUMBER, prompt, key: KEY, ev, options, tickMs: 20 });
  dev.close();
  fake.stop();
  const rows = readFileSync(ev.path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { result, rows, fake, dir };
}

test('completed call: one dial, both directions recorded, number masked, hang-up confirmed', async () => {
  const { result, rows, fake, dir } = await probe({});
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(fake.log.dials, [NUMBER]);
  assert.equal(fake.log.hangups, 1);
  const events = rows.map((r) => r.event);
  for (const e of ['hello', 'slc_connected', 'dial', 'dial_accepted_by_firmware', 'audio_opened', 'prompt_playing', 'call_finished', 'audio_summary']) {
    assert.ok(events.includes(e), `missing ${e}`);
  }
  assert.ok(!readFileSync(join(dir, 'hfp-probe.jsonl'), 'utf8').includes('923001234567'), 'unmasked number in evidence');
  assert.ok(!JSON.stringify(rows).includes(fake.state.nonce.toString('hex')), 'session nonce leaked');
  const remote = readWav(join(dir, 'remote.wav'));
  assert.equal(remote.rate, 8000);
  assert.ok(remote.samples.length > 4000);
  const summary = rows.find((r) => r.event === 'audio_summary');
  assert.ok(summary.promptSamplesSent === 1600);
  assert.equal(summary.upSampleGaps, 0);
  assert.ok(existsSync(join(dir, 'sent.wav')));
});

test('remote hangs up while listening → remote_hangup', async () => {
  const { result, fake } = await probe({ remoteHangupAfterMs: 100 }, { ...FAST, listenS: 2 });
  assert.equal(result.outcome, 'remote_hangup');
  assert.equal(fake.log.dials.length, 1);
});

test('nobody answers → hang up → not_answered', async () => {
  const { result, fake } = await probe({ answerAfterMs: null });
  assert.equal(result.outcome, 'not_answered');
  assert.equal(fake.log.hangups, 1);
});

test('phone never opens audio and refuses ours → audio_failed', async () => {
  const { result, rows } = await probe({ audio: 'never' });
  assert.equal(result.outcome, 'audio_failed');
  assert.ok(rows.some((r) => r.event === 'audio_connect_requested'));
});

test('gateway-initiated audio link works when the phone waits', async () => {
  const { result } = await probe({ audio: 'gateway' });
  assert.equal(result.outcome, 'completed');
});

test('wideband codec is not treated as working audio', async () => {
  const { result, rows } = await probe({ codec: 2 });
  assert.equal(result.outcome, 'audio_failed');
  assert.ok(rows.some((r) => r.event === 'audio_unsupported_codec'));
});

test('device without a key: no dial is attempted', async () => {
  const { result, fake } = await probe({ key: null });
  assert.equal(result.outcome, 'not_provisioned');
  assert.equal(fake.log.dials.length, 0);
});

test('device unplugged mid-call → outcome_unknown, never redialed', async () => {
  const fake = createFakeEsp32({ key: KEY });
  const dev = new Esp32Device(fake.stream, { ackTimeoutMs: 300, keepaliveMs: 100, lostAfterMs: 400 });
  const dir = mkdtempSync(join(tmpdir(), 'esp32-probe-'));
  const ev = createEvidence(dir, { echo: false });
  dev.once('state', () => {});
  dev.on('state', (s) => {
    if (s.call === 1) setTimeout(() => fake.unplug(), 30);
  });
  const result = await runProbeCall({ device: dev, number: NUMBER, prompt: new Int16Array(800), key: KEY, ev, options: { ...FAST, listenS: 2 }, tickMs: 20 });
  assert.equal(result.outcome, 'outcome_unknown');
  assert.equal(fake.log.dials.length, 1);
  const finished = readFileSync(ev.path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.event === 'call_finished');
  assert.match(finished.operatorAction, /end the call by hand/);
  dev.close();
  fake.stop();
});
