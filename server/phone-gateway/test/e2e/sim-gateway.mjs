#!/usr/bin/env node
/**
 * SIMULATED board + phone behind the REAL gateway code, for full-stack E2E without an ESP32.
 *
 * Real: CrmClient (pairing, dial key hand-over, heartbeat, claim, events), EventOutbox, GatewayDaemon,
 * CallRunner, LiveKitLeg (@livekit/rtc-node into the call's LiveKit room).
 * Simulated: the ESP32 (protocol-level fake, test/helpers/fakeEsp32.js) and the lead, who speaks
 * pre-generated TTS lines at 8 kHz and takes turns when the AI stops talking.
 *
 *   node test/e2e/sim-gateway.mjs --api http://127.0.0.1:9097/api/v1 --code ABCD-EF23 \
 *     --scenarios '[{"lines":["Hello?","Yes","Yes, we are open.","Twelve."]},{"unplugAfterMs":6000}]'
 *
 * stdout: one JSON object per line (paired, provisioned, board_connected, call_dialed, lead_says,
 * agent_spoke, unplugged, call_done, revoked). Ends when the CRM revokes the device or on SIGTERM.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { Esp32Device } from '../../src/esp32/device.js';
import { levelDbfs, pcmFromBuffer, readWav, resample } from '../../src/esp32/pcm.js';
import { CrmClient, EventOutbox } from '../../src/gateway/crmClient.js';
import { GatewayDaemon } from '../../src/gateway/daemon.js';
import { createFakeEsp32 } from '../helpers/fakeEsp32.js';

const here = dirname(fileURLToPath(import.meta.url));
const { values: a } = parseArgs({
  options: {
    api: { type: 'string' },
    code: { type: 'string' },
    scenarios: { type: 'string', default: '[]' },
    cache: { type: 'string', default: join(here, '..', '..', 'evidence', 'tts-cache') },
  },
});
// The lead's TTS voice needs OpenAI; fall back to server/.env like tools/audio-evidence.mjs.
if (!process.env.OPENAI_API_KEY) {
  const { readFileSync } = await import('node:fs');
  // Same parsing rules as dotenv (inline comments, quotes, CRLF).
  const raw = readFileSync(join(here, '..', '..', '..', '.env'), 'utf8').split(/\r?\n/).find((l) => l.startsWith('OPENAI_API_KEY='));
  if (raw) process.env.OPENAI_API_KEY = raw.slice('OPENAI_API_KEY='.length).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
}
const out = (event, data = {}) => process.stdout.write(`${JSON.stringify({ t: Date.now(), event, ...data })}\n`);
const log = (event, data = {}) => process.stderr.write(`${JSON.stringify({ t: Date.now(), event, ...data })}\n`);
const scenarios = JSON.parse(a.scenarios);

// ---- lead voice: TTS once, cached ----------------------------------------------------------------
mkdirSync(a.cache, { recursive: true });
async function voice(text) {
  const file = join(a.cache, `${Buffer.from(text).toString('hex').slice(0, 60)}.wav`);
  if (!existsSync(file)) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'ash', input: text, response_format: 'wav' }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const { rate, samples } = readWav(file);
  const pcm = resample(samples, rate, 8000);
  let s = 0;
  let e = pcm.length - 1;
  while (s < e && Math.abs(pcm[s]) < 300) s += 1;
  while (e > s && Math.abs(pcm[e]) < 300) e -= 1;
  return pcm.subarray(Math.max(0, s - 80), Math.min(pcm.length, e + 80));
}
const allLines = [...new Set(scenarios.flatMap((sc) => sc.lines || []))];
const audio = new Map(await Promise.all(allLines.map(async (l) => [l, await voice(l)])));

// ---- pairing + "provision" (the simulated BOOT button is always held) ----------------------------
const bootstrap = new CrmClient({ apiBase: a.api });
const paired = await bootstrap.pair(a.code, { version: '0.2.0-sim', platform: process.platform, hostname: 'e2e-sim' });
out('paired', { deviceId: paired.deviceId, deviceName: paired.deviceName });
const crm = new CrmClient({ apiBase: a.api, token: paired.token });
const { key } = await crm.takeDialKey();
const BDADDR = '24:0A:C4:00:11:22';
await crm.confirmDialKey(BDADDR);
out('provisioned');

// ---- the board: a fresh fake per USB session (an unplug = board gone; reconnect = reboot) -------
let callIndex = 0;
let current = null;
function newBoard() {
  const lead = { queue: [], speaking: false, lines: [], idx: 0, spokeSinceLine: false, lastAgentAt: 0, answeredAt: null, timers: [] };
  const fake = createFakeEsp32({
    key: Buffer.from(key, 'hex'),
    buttonHeld: true,
    speech: () => (lead.queue.length ? lead.queue.shift() : 0),
    onDial: (number, o) => {
      const sc = scenarios[callIndex] || { lines: ['Hello?', 'No thank you.'] };
      out('call_dialed', { index: callIndex, number: `${number.slice(0, 4)}***${number.slice(-3)}` });
      callIndex += 1;
      o.answerAfterMs = sc.noAnswer ? null : 2000;
      o.remoteHangupAfterMs = sc.remoteHangupAfterMs ?? null;
      lead.lines = sc.lines || [];
      lead.idx = 0;
      lead.answeredAt = null;
      lead.unplugAfterMs = sc.unplugAfterMs ?? null;
    },
  });
  let lastPlayed = 0;
  const say = () => {
    if (lead.idx >= lead.lines.length || fake.state.call !== 1) return;
    const line = lead.lines[lead.idx];
    lead.idx += 1;
    lead.queue.push(...audio.get(line));
    lead.speaking = true;
    lead.spokeSinceLine = false;
    out('lead_says', { line });
  };
  const tick = setInterval(() => {
    const s = fake.state;
    if (s.call === 1 && lead.answeredAt === null) {
      lead.answeredAt = Date.now();
      if (lead.unplugAfterMs !== null) {
        lead.timers.push(setTimeout(() => { out('unplugged'); fake.unplug(); }, lead.unplugAfterMs));
      }
      lead.timers.push(setTimeout(say, 700));
    }
    if (s.call !== 1 && lead.answeredAt !== null) {
      out('call_done', { durationMs: Date.now() - lead.answeredAt });
      lead.answeredAt = null;
      lead.queue.length = 0;
    }
    const played = fake.log.played;
    if (played.length > lastPlayed) {
      const lvl = levelDbfs(pcmFromBuffer(Buffer.concat(played.slice(lastPlayed))));
      lastPlayed = played.length;
      if (lvl > -45) {
        if (!lead.spokeSinceLine) out('agent_spoke');
        lead.spokeSinceLine = true;
        lead.lastAgentAt = Date.now();
      }
    }
    if (lead.speaking && lead.queue.length === 0) lead.speaking = false;
    if (!lead.speaking && lead.spokeSinceLine && Date.now() - lead.lastAgentAt > 1200) say();
  }, 20);
  return { fake, stop: () => { clearInterval(tick); lead.timers.forEach(clearTimeout); fake.stop(); } };
}

const outbox = new EventOutbox({ client: crm, log });
const rtc = await import('@livekit/rtc-node');
const daemon = new GatewayDaemon({
  crm, outbox, rtc, portLabel: 'simulated',
  log: (event, data) => {
    log(event, data);
    if (event === 'gateway_revoked') { out('revoked'); setTimeout(() => process.exit(0), 500); }
    if (event === 'board_connected') out('board_connected', { firmware: data.firmware });
  },
  keepAwake: { set: () => {} },
  openDevice: async () => {
    current?.stop();
    current = newBoard();
    const device = new Esp32Device(current.fake.stream, { ackTimeoutMs: 1000 });
    return { device, info: await device.hello() };
  },
  closeDevice: async ({ device }) => device.close(),
  options: { heartbeatIdleMs: 2000, heartbeatCallMs: 1000, claimEveryMs: 1000, hfpRetryMs: 0, reconnectMinMs: 3000 },
});
process.on('SIGTERM', async () => { await daemon.stop(); process.exit(0); });
await daemon.start();
