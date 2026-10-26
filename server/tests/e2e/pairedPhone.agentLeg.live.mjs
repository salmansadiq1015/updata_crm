#!/usr/bin/env node
/**
 * LIVE agent-leg test for paired-phone calling: everything real EXCEPT the phone + Bluetooth.
 *
 *   CRM (aiCalling scheduler + pairedPhone API, in-memory Mongo)  ← real code, real HTTP
 *   gateway daemon (CrmClient, outbox, CallRunner, LiveKitLeg)    ← real code, real LiveKit Cloud
 *   agent worker (LiveKit Agents + OpenAI Realtime + tool API)    ← real process, real OpenAI
 *   ESP32 + phone + lead                                          ← SIMULATED: protocol-level fake
 *                                                                   ESP32 playing TTS "lead" lines at 8 kHz
 *
 * It proves the AI hears phone-quality (8 kHz) audio through the gateway, answers through it,
 * asks the configured questions and saves validated answers. It does NOT prove Bluetooth or
 * cellular audio (Gate A needs the real ESP32 + phone).
 *
 *   cd server && node tests/e2e/pairedPhone.agentLeg.live.mjs
 * Needs server/.env LIVEKIT_URL/KEY/SECRET + OPENAI_API_KEY. Costs a few cents (one ~1-minute call).
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '../..');
const gatewayDir = join(serverDir, 'phone-gateway');
const PORT = 9131;
const AGENT_NAME = 'crm-voice-agent-pp-e2e';

process.env.LIVEKIT_AGENT_NAME = AGENT_NAME;
process.env.PUBLIC_API_BASE_URL = `http://127.0.0.1:${PORT}`;
process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';
await import('dotenv/config');

const { MongoMemoryServer } = await import('mongodb-memory-server');
const mongoose = (await import('mongoose')).default;
const rtc = await import(join(gatewayDir, 'node_modules/@livekit/rtc-node/dist/index.js'));
const { Esp32Device } = await import(join(gatewayDir, 'src/esp32/device.js'));
const { createFakeEsp32 } = await import(join(gatewayDir, 'test/helpers/fakeEsp32.js'));
const { CrmClient, EventOutbox } = await import(join(gatewayDir, 'src/gateway/crmClient.js'));
const { GatewayDaemon } = await import(join(gatewayDir, 'src/gateway/daemon.js'));
const { writeWav, resample, readWav, levelDbfs, pcmFromBuffer } = await import(join(gatewayDir, 'src/esp32/pcm.js'));

const evidenceDir = join(gatewayDir, 'evidence', `agent-leg-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(evidenceDir, { recursive: true });
const t0 = Date.now();
const rows = [];
const log = (event, data = {}) => {
  const row = { t_ms: Date.now() - t0, event, ...data };
  rows.push(row);
  if (!['outbox_retry'].includes(event)) process.stderr.write(`${JSON.stringify(row)}\n`);
};

// ---------------------------------------------------------------- lead voice (TTS, 8 kHz)
const LINES = ['Hello?', 'Yes, go ahead.', 'Yes, we are still operating.', 'We have twelve employees.', 'Yes, that is correct.', 'Yes.', 'Okay, thank you, goodbye.'];
async function tts(text, i) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'ash', input: text, response_format: 'wav' }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const file = join(evidenceDir, `lead-${i}.wav`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const { rate, samples } = readWav(file);
  // Trim TTS lead-in/out silence so turn latency is measured from the real end of speech.
  const pcm = resample(samples, rate, 8000);
  let a = 0;
  let b = pcm.length - 1;
  while (a < b && Math.abs(pcm[a]) < 300) a += 1;
  while (b > a && Math.abs(pcm[b]) < 300) b -= 1;
  return pcm.subarray(Math.max(0, a - 80), Math.min(pcm.length, b + 80));
}
const leadAudio = await Promise.all(LINES.map(tts));
log('lead_lines_ready', { lines: LINES.length });

// ---------------------------------------------------------------- CRM
const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());
const queueManager = (await import('../../src/shared/queue/QueueManager.js')).default;
queueManager.addJob = async () => ({}); // ticks are driven by this script; nothing goes to Redis
const audit = (await import('../../src/modules/auth/audit.service.js')).default;
audit.logEvent = () => {};
const notifications = (await import('../../src/modules/notifications/notification.service.js')).default;
notifications.create = async () => ({});
const ai = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
const pp = (await import('../../src/modules/pairedPhone/pairedPhone.service.js')).default;
const { agentToolRoutes } = await import('../../src/modules/aiCalling/aiCalling.routes.js');
const { gatewayRoutes } = await import('../../src/modules/pairedPhone/pairedPhone.routes.js');
const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
const Lead = (await import('../../src/modules/crm/lead.model.js')).default;
const CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
const CampaignRecipient = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
const CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;

const app = express();
app.use((req, _res, next) => { req.requestId = 'e2e'; next(); });
app.use(express.json());
app.use(responseEnvelope);
app.use('/api/v1/ai-calling/agent', agentToolRoutes);
app.use('/api/v1/paired-phone/gateway', gatewayRoutes);
app.use(errorHandler);
const httpServer = app.listen(PORT, '127.0.0.1');
log('crm_listening', { port: PORT });

// ---------------------------------------------------------------- agent worker (real)
const worker = spawn(process.execPath, ['src/agent.js', 'start'], {
  cwd: join(serverDir, 'agent-worker'),
  env: { ...process.env, LIVEKIT_AGENT_NAME: AGENT_NAME, AGENT_HEALTH_PORT: '8095' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const workerLog = [];
const onWorker = (chunk) => {
  const text = chunk.toString();
  workerLog.push(text);
  for (const line of text.split('\n')) if (/registered|call ready|answered|error|warn|first|tool/i.test(line)) log('worker', { line: line.slice(0, 300) });
};
worker.stdout.on('data', onWorker);
worker.stderr.on('data', onWorker);
await waitFor(() => /registered worker/i.test(workerLog.join('')), 60_000, 'agent worker registration');

// ---------------------------------------------------------------- device + campaign
const owner = new mongoose.Types.ObjectId();
const { code } = await pp.createPairingCode(owner, { deviceName: 'E2E simulated bridge' });
const bootstrap = new CrmClient({ apiBase: `http://127.0.0.1:${PORT}/api/v1` });
const paired = await bootstrap.pair(code, { version: 'e2e', platform: process.platform });
const crm = new CrmClient({ apiBase: `http://127.0.0.1:${PORT}/api/v1`, token: paired.token });
const { key } = await crm.takeDialKey();

const lead = { queue: [], speaking: false, lineIdx: 0, endedAt: null, turns: [] };
const fake = createFakeEsp32({
  key: Buffer.from(key, 'hex'),
  answerAfterMs: 2000,
  speech: () => (lead.queue.length ? lead.queue.shift() : 0),
});
await crm.confirmDialKey('24:0A:C4:00:11:22');

const leadDoc = await Lead.create({ leadNumber: 'L-E2E-1', name: 'Rahim Traders', source: 'manual', mobile: '+923001234567', address: { country: 'PK', city: 'Lahore' }, createdBy: owner });
const campaign = await ai.createCampaign({
  name: 'Paired-phone agent leg E2E',
  questionnaire: { questions: [
    { fieldKey: 'active', label: 'Still operating', text: 'Is your business still operating?', type: 'boolean', required: true, order: 1 },
    { fieldKey: 'employees', label: 'Employees', text: 'How many employees do you have?', type: 'integer', required: true, order: 2 },
  ] },
  statusRules: [{ id: 'q', when: { all: [{ field: 'active', equals: true }] }, action: 'mark_qualified' }],
  agentConfig: { agentName: 'Sara', organizationName: 'Updata', language: 'en', maxCallSeconds: 150 },
  schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxAttemptsPerLead: 1 },
  selection: { mode: 'explicit', leadIds: [String(leadDoc._id)] },
  transport: 'paired_phone',
  pairedDeviceId: paired.deviceId,
}, owner);

// ---------------------------------------------------------------- gateway (real code, simulated board)
const outbox = new EventOutbox({ client: crm, log });
const daemon = new GatewayDaemon({
  crm, outbox, rtc, log, portLabel: 'simulated',
  keepAwake: { set: () => {} },
  openDevice: async () => {
    const device = new Esp32Device(fake.stream, { ackTimeoutMs: 1000 });
    return { device, info: await device.hello() };
  },
  closeDevice: async ({ device }) => device.close(),
  options: { heartbeatIdleMs: 1000, heartbeatCallMs: 1000, claimEveryMs: 500, hfpRetryMs: 0 },
});
await daemon.start();
await waitFor(async () => (await pp.getDevice(owner, paired.deviceId)).state.hfp === 'slc', 15_000, 'simulated phone link');
await pp.verifyAudio(owner, paired.deviceId, { inboundPhraseHeard: true, outboundPhraseHeard: true, note: 'E2E HARNESS ATTESTATION: simulated board, not a real audio verification' });

await CallCampaign.updateOne({ _id: campaign._id }, { $set: { status: 'running', startedAt: new Date() } });
await CampaignRecipient.updateMany({ campaignId: campaign._id, state: 'draft' }, { $set: { state: 'queued' } });
const tick = await ai.tickCampaign(campaign._id, null);
log('tick', tick);

// ---------------------------------------------------------------- the lead (turn-taking bot)
let answeredAt = null;
let agentSpeechAt = null;
let agentSpokeSinceLine = false;
let lastPlayedLen = 0;
const leadTimer = setInterval(() => {
  const s = fake.state;
  if (s.call === 1 && answeredAt === null) {
    answeredAt = Date.now();
    setTimeout(() => sayNext(), 700);
  }
  const played = fake.log.played;
  if (played.length > lastPlayedLen) {
    const chunk = Buffer.concat(played.slice(lastPlayedLen));
    lastPlayedLen = played.length;
    const lvl = levelDbfs(pcmFromBuffer(chunk));
    if (lvl > -45) {
      if (lead.endedAt && !agentSpokeSinceLine) {
        lead.turns.push({ line: LINES[lead.lineIdx - 1], agentResponseMs: Date.now() - lead.endedAt });
        log('agent_replied', { afterLeadMs: Date.now() - lead.endedAt, toLine: LINES[lead.lineIdx - 1] });
      }
      agentSpeechAt = Date.now();
      agentSpokeSinceLine = true;
    }
  }
  if (lead.speaking && lead.queue.length === 0) {
    lead.speaking = false;
    lead.endedAt = Date.now();
  }
  if (!lead.speaking && agentSpokeSinceLine && agentSpeechAt && Date.now() - agentSpeechAt > 1200 && lead.lineIdx < LINES.length) sayNext();
}, 20);
function sayNext() {
  if (lead.lineIdx >= LINES.length || fake.state.call !== 1) return;
  const pcm = leadAudio[lead.lineIdx];
  log('lead_says', { line: LINES[lead.lineIdx] });
  lead.lineIdx += 1;
  lead.queue.push(...pcm);
  lead.speaking = true;
  agentSpokeSinceLine = false;
}

// ---------------------------------------------------------------- wait for the outcome
await waitFor(async () => Boolean((await CallRecord.findOne({ campaignId: campaign._id }).lean())?.resultsProcessedAt), 180_000, 'call processed');
clearInterval(leadTimer);
await waitFor(async () => (await CallRecord.findOne({ campaignId: campaign._id }).lean())?.gateway?.state === 'ended', 15_000, 'gateway end event');
await new Promise((r) => setTimeout(r, 1500)); // one more heartbeat after the hang-up
const call = await CallRecord.findOne({ campaignId: campaign._id }).lean();
const device = await pp.getDevice(owner, paired.deviceId);

const aiAudio = pcmFromBuffer(fake.played());
writeWav(join(evidenceDir, 'ai-heard-by-lead.wav'), 8000, aiAudio);
const transcript = await transcribe(join(evidenceDir, 'ai-heard-by-lead.wav'));
const summary = {
  label: 'SIMULATED PHONE + REAL CRM/GATEWAY/LIVEKIT/AGENT/OPENAI',
  call: { state: call.state, disposition: call.disposition, qualification: call.qualification, reviewRequired: call.reviewRequired, durationSeconds: call.durationSeconds, gateway: call.gateway?.state, endReason: call.gateway?.endReason },
  answers: (call.answers || []).map((x) => ({ field: x.questionFieldKey, raw: x.rawAnswer, value: x.normalizedValue, validation: x.validation, confirmed: x.confirmed })),
  firstAiAudioMs: rows.find((r) => r.event === 'first_ai_audio')?.ms ?? null,
  turns: lead.turns,
  medianTurnMs: lead.turns.length ? [...lead.turns.map((t) => t.agentResponseMs)].sort((x, y) => x - y)[Math.floor(lead.turns.length / 2)] : null,
  device: { currentCallId: device.currentCallId, readiness: device.readiness.reasons },
  aiAudioSeconds: Math.round(aiAudio.length / 80) / 100,
  aiTranscript: transcript,
  evidenceDir,
};
writeFileSync(join(evidenceDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(join(evidenceDir, 'events.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'));
writeFileSync(join(evidenceDir, 'worker.log'), workerLog.join(''));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

await daemon.stop();
worker.kill('SIGTERM');
await new Promise((r) => httpServer.close(r));
await mongoose.disconnect();
await mongod.stop();
fake.stop();
process.exit(0);

// ---------------------------------------------------------------- helpers
async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  log('timeout', { what });
  worker?.kill?.('SIGTERM');
  throw new Error(`timed out waiting for ${what}`);
}

async function transcribe(file) {
  const { readFileSync } = await import('node:fs');
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: 'audio/wav' }), 'ai.wav');
  form.append('model', 'gpt-4o-transcribe');
  form.append('language', 'en');
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
      if (res.ok) return (await res.json()).text;
      if (attempt === 3) return `transcription failed: HTTP ${res.status}`;
    } catch (err) {
      if (attempt === 3) return `transcription failed: ${err.cause?.code || err.message}`;
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  return 'transcription failed';
}
