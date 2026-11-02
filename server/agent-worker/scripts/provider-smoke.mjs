/** Isolated live provider smoke; no CRM writes, room, SIM dial or customer call. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { initializeLogger, llm } from '@livekit/agents';
import { AudioFrame, dispose } from '@livekit/rtc-node';
import { LiveKitVoiceAdapter } from '../src/providers/livekitAdapters.js';
import { establishProvider } from '../src/providers/providerManager.js';
import { voiceProviderConfig } from '../../shared/voiceProviderConfig.js';
import { createResponseUsage } from '../src/responseUsage.js';
import { computeCallCost } from '../../shared/voiceCost.js';

if (!process.argv.includes('--live')) throw new Error('Pass --live to enable billable provider requests');
const arg = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const requestedProvider = arg('provider') || 'gemini';
let provider = requestedProvider;
if (!['gemini', 'openai', 'auto'].includes(provider)) throw new Error('provider must be gemini, openai or auto');
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
const env = { ...(fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {}), ...process.env };
const config = voiceProviderConfig({ secondaryModel: provider === 'openai' ? arg('model') || 'gpt-realtime-2.1-mini' : 'gpt-realtime-2.1-mini' }, env);
let model = provider === 'gemini' ? arg('model') || config.primaryModel : config.secondaryModel;
const createAdapter = candidate => new LiveKitVoiceAdapter({ ...candidate, config, env, instructions: 'This is an isolated audio transport test. Say only: Ready. Do not call tools.', tools: {}, chatCtx: llm.ChatContext.empty() });
let adapter = createAdapter({ provider, model });
let responses; let attempts = [];
const start = Date.now();
let outputSamples = 0; let setupMs = null; let status = 'failed'; let errorCode = null;
initializeLogger({ pretty: false, level: 'fatal' });
try {
  if (requestedProvider === 'auto') {
    const selection = await establishProvider({ config, createAdapter });
    adapter = selection.adapter; provider = selection.provider; model = selection.model; attempts = selection.attempts;
  } else { await adapter.initializeSession(); await adapter.connect(10000); }
  setupMs = Date.now() - start;
  responses = createResponseUsage({ model, provider });
  const drains = [];
  adapter.receiveAudio(generation => {
    drains.push((async () => {
      for await (const message of generation.messageStream) {
        const text = (async () => { for await (const _chunk of message.textStream) { /* drain */ } })();
        for await (const frame of message.audioStream) outputSamples += frame.samplesPerChannel;
        await text;
      }
    })());
  });
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('Response timeout'), { code: 'RESPONSE_TIMEOUT' })), 15000);
    adapter.once('usage', metrics => { clearTimeout(timer); responses.observe(metrics); resolve(); });
    adapter.once('provider_error', error => { clearTimeout(timer); reject(error); });
  });
  void done.catch(() => {});
  if (arg('audio')) {
    // Equivalent fixture: raw 24 kHz mono PCM16; pace at 100 ms for both adapters.
    const pcm = fs.readFileSync(arg('audio'));
    for (let offset = 0; offset < pcm.length; offset += 4800) {
      const chunk = Uint8Array.from(pcm.subarray(offset, offset + 4800));
      if (chunk.length % 2) throw new Error('PCM must contain whole 16-bit samples');
      adapter.sendAudio(new AudioFrame(new Int16Array(chunk.buffer), 24000, 1, chunk.length / 2));
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } else {
    await adapter.sendText('Say Ready now.');
  }
  await done; await Promise.all(drains); status = outputSamples ? 'audio_received' : 'no_audio';
} catch (error) { errorCode = error.code || 'PROVIDER_SMOKE_FAILED'; }
finally { await adapter.terminateSession().catch(() => {}); dispose(); }
const recordedResponses = responses?.snapshot().responses || [];
const usage = { modelUsage: recordedResponses };
const cost = computeCallCost({ usage }, env);
const report = { at: new Date().toISOString(), requestedProvider, provider, model, status, errorCode, setupMs, attempts, elapsedMs: Date.now() - start, outputAudioSeconds: outputSamples / 24000,
  responses: recordedResponses, calculatedApiCostUsd: cost.breakdown.unpriced ? null : cost.amount,
  billingSource: 'provider_usage_at_list_rates', invoiceVerified: false, limitations: ['No LiveKit room, CRM synchronization, SIM audio or human qualification accuracy verified', 'Text-triggered unless --audio supplies an identical recorded fixture'] };
if (arg('output')) fs.writeFileSync(arg('output'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
// Some SDKs retain pending handshake work after a rejected setup. This isolated
// smoke process has completed cleanup; exiting cannot affect a CRM worker.
process.exit(status === 'audio_received' ? 0 : 1);
