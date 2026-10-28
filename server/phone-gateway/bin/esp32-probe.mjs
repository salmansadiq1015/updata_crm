#!/usr/bin/env node
/**
 * ESP32 HFP bridge probe: the Phase 1 two-way cellular audio proof over USB.
 *
 *   esp32-probe ports
 *   esp32-probe info      --port /dev/cu.usbserial-0001
 *   esp32-probe provision --port …            (hold the board's BOOT button while it runs)
 *   esp32-probe pair      --port … [--seconds 120]
 *   esp32-probe connect   --port … [--phone 04:01:BB:51:10:48] [--hold 60]
 *   esp32-probe call      --port … --number <yours> --i-own-this-number --prompt prompts/prompt-en.wav [--out evidence/call1]
 *
 * Evidence: <out>/hfp-probe.jsonl, remote.wav (what the phone sent), sent.wav (what we sent).
 * Docs: docs/paired-phone/ESP32-FIRMWARE.md, USB-AUDIO-PROTOCOL.md.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { DeviceError } from '../src/esp32/device.js';
import { listPorts as serialPorts, openSerialDevice, closeSerialDevice } from '../src/esp32/serial.js';
import { newDeviceKey, normalizeNumber } from '../src/esp32/dialAuth.js';
import { createEvidence, maskNumber } from '../src/esp32/evidence.js';
import { DEFAULTS } from '../src/esp32/callScript.js';
import { readWav, resample, levelDbfs } from '../src/esp32/pcm.js';
import { runProbeCall } from '../src/esp32/probeSession.js';

const KEY_DIR = join(homedir(), '.updata', 'esp32');

const timingFlags = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, { type: 'string' }]));
const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string' },
    phone: { type: 'string' },
    seconds: { type: 'string', default: '120' },
    hold: { type: 'string', default: '60' },
    number: { type: 'string' },
    'i-own-this-number': { type: 'boolean', default: false },
    prompt: { type: 'string' },
    out: { type: 'string', default: 'evidence/esp32-run' },
    countdown: { type: 'string', default: '5' },
    'call-ref': { type: 'string', default: String(Math.floor(Date.now() / 1000) & 0x7fffffff) },
    ...timingFlags,
  },
});
const mode = positionals[0];

const die = (msg, code = 2) => {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyPath = (bdaddr) => join(KEY_DIR, `${bdaddr.replace(/:/g, '')}.key`);

async function listPorts() {
  const ports = await serialPorts();
  for (const p of ports) {
    const note = p.nativeUsbNoClassicBt ? 'Espressif native USB: ESP32-S2/S3/C3/C6 have NO Classic Bluetooth and cannot do HFP' : p.bridge || '';
    process.stdout.write(`${p.path}\t${p.id || '-'}\t${p.manufacturer}\t${note}\n`);
  }
  if (!ports.some((p) => p.bridge)) {
    process.stdout.write('No USB-serial bridge found. Plug in the ESP32 (data-capable USB cable) and install the CP210x/CH34x driver if needed.\n');
  }
}

async function openDevice(ev) {
  if (!a.port) die('--port is required (see `esp32-probe ports`; on macOS use /dev/cu.*, not /dev/tty.*)');
  return openSerialDevice({ path: a.port, onError: (err) => ev?.('serial_error', { detail: err.message }) });
}

const closeDevice = closeSerialDevice;

async function info() {
  const ev = createEvidence(a.out);
  const d = await openDevice(ev);
  ev('hello', { ...d.info, sessionNonce: '(redacted)', keyFile: existsSync(keyPath(d.info.bdaddr)) ? keyPath(d.info.bdaddr) : null });
  await d.device.statusRequest();
  const stats = await new Promise((resolve) => d.device.once('stats', resolve));
  ev('state', d.device.state);
  ev('stats', stats);
  await closeDevice(d);
}

async function provision() {
  const ev = createEvidence(a.out);
  const d = await openDevice(ev);
  const file = keyPath(d.info.bdaddr);
  const key = existsSync(file) ? Buffer.from(readFileSync(file, 'utf8').trim(), 'hex') : newDeviceKey();
  process.stderr.write('Hold the BOOT button on the ESP32 now (5 s)…\n');
  await sleep(5000);
  try {
    await d.device.provisionKey(key);
  } catch (err) {
    ev('provision_failed', { code: err.code });
    await closeDevice(d);
    die(err.code === 'no_presence' ? 'BOOT button was not held. Try again.' : `refused: ${err.code}`, 3);
  }
  mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${key.toString('hex')}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  ev('provisioned', { bdaddr: d.info.bdaddr, keyFile: file });
  await closeDevice(d);
}

async function pair() {
  const ev = createEvidence(a.out);
  const d = await openDevice(ev);
  const seconds = Number(a.seconds);
  try {
    await d.device.setDiscoverable(seconds);
    ev('pairing_window_open', { seconds, name: 'Updata Phone Bridge XXXX', note: 'On the phone: Bluetooth → pair new device → confirm the number; keep "Phone calls" on' });
    const result = await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        d.device.off('event', onEvent);
        d.device.off('lost', onLost);
      };
      const onEvent = (event) => {
        if (event.name !== 'auth') return;
        cleanup();
        resolve(event);
      };
      const onLost = (reason) => {
        cleanup();
        ev('pairing_link_lost', { reason });
        reject(new DeviceError(`ESP32 link lost during pairing: ${reason}`, 'link_lost'));
      };
      const timer = setTimeout(() => { cleanup(); resolve(null); }, seconds * 1000);
      d.device.on('event', onEvent);
      d.device.once('lost', onLost);
    });
    ev(result?.ok ? 'paired' : 'pairing_not_completed', result || {});
    if (!result?.ok) process.exitCode = 4;
  } finally {
    await d.device.setDiscoverable(0).catch(() => {});
    await closeDevice(d);
  }
}

async function connect() {
  const ev = createEvidence(a.out);
  const d = await openDevice(ev);
  d.device.on('state', (s) => ev('state', s));
  d.device.on('stats', (s) => ev('stats', s));
  d.device.on('event', (e) => ev('device_event', e.name === 'clip' ? { ...e, number: maskNumber(e.number) } : e));
  if (d.device.state?.hfp !== 'slc') await d.device.hfpConnect(a.phone);
  await d.device.waitForState((s) => s.hfp === 'slc', 20000);
  ev('slc_connected', { agFeatures: d.device.state.agFeatures, peer: d.device.state.peer });
  const hold = Number(a.hold) * 1000;
  const dropped = await Promise.race([
    sleep(hold).then(() => false),
    d.device.waitForState((s) => s.hfp !== 'slc', hold + 1000).then(() => true, () => false),
  ]);
  ev(dropped ? 'slc_dropped_during_hold' : 'hold_done', { seconds: Number(a.hold) });
  if (!dropped && !d.device.state.call && !d.device.state.callsetup) await d.device.hfpDisconnect().catch(() => {});
  await closeDevice(d);
  if (dropped) process.exitCode = 4;
}

async function call() {
  if (!a['i-own-this-number']) die('call needs --i-own-this-number (only dial a number you own or that agreed to the test)');
  if (!a.number || !a.prompt) die('call needs --number and --prompt');
  let number;
  try {
    number = normalizeNumber(a.number);
  } catch (err) {
    die(err.message);
  }
  const wav = readWav(a.prompt);
  const prompt = resample(wav.samples, wav.rate, 8000);
  const options = Object.fromEntries(Object.keys(DEFAULTS).filter((k) => a[k] !== undefined).map((k) => [k, Number(a[k])]));
  const ev = createEvidence(a.out);
  ev('probe_start', { mode: 'call', number: maskNumber(number), prompt: a.prompt, promptSeconds: prompt.length / 8000, promptLevelDbfs: levelDbfs(prompt), options });
  const d = await openDevice(ev);
  const file = keyPath(d.info.bdaddr);
  if (!existsSync(file)) {
    await closeDevice(d);
    die(`no key file ${file}; run \`esp32-probe provision\` first`, 3);
  }
  const key = Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');
  process.stderr.write(`Dialing ${maskNumber(number)} in ${a.countdown} s from the paired phone. Ctrl-C to abort.\n`);
  await sleep(Number(a.countdown) * 1000);
  let interrupted = false;
  process.once('SIGINT', async () => {
    interrupted = true;
    ev('signal_received');
    await d.device.hangup(Number(a['call-ref'])).catch(() => {});
    setTimeout(() => process.exit(130), 3000);
  });
  const result = await runProbeCall({ device: d.device, number, prompt, key, ev, phone: a.phone || null, callRef: Number(a['call-ref']), options });
  await closeDevice(d);
  ev('probe_end', { outcome: result.outcome, interrupted });
  process.exitCode = result.outcome === 'completed' ? 0 : 5;
}

const modes = { ports: listPorts, info, provision, pair, connect, call };
if (!modes[mode]) die('usage: esp32-probe ports|info|provision|pair|connect|call [options]  (see the header of bin/esp32-probe.mjs)');
modes[mode]().catch((err) => die(`${err.code ? `[${err.code}] ` : ''}${err.message}`, 1));
