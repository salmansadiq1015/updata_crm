#!/usr/bin/env node
/**
 * Isolated full stack for the paired-phone E2E (LEAD-MOBILE-CALLING.md "Reproducing the isolated E2E").
 *
 *   API        node src/server.js on :9097 → e2e Mongo (127.0.0.1:27030, own database) + e2e Redis
 *              (127.0.0.1:6390, db 5, own key/BullMQ prefixes), admin seeded, every provider blanked
 *              EXCEPT LiveKit + OpenAI (the AI agent is real).
 *   Agent      server/agent-worker under its own agent name, so it never takes jobs of another worker.
 *
 * Used by client/e2e/paired-phone.full.spec.ts and the mobile E2E. Writes logs to tests/e2e/.stack-logs/.
 *   cd server && node tests/e2e/pairedPhone.stack.mjs        (Ctrl-C stops both)
 * Prints {"ready":true,...} on stdout when the API answers /health and the worker has registered.
 */

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '../..');
const logs = join(here, '.stack-logs');
mkdirSync(logs, { recursive: true });

export const E2E = Object.freeze({
  apiPort: 9097,
  adminEmail: 'e2e-admin@example.com',
  adminPassword: 'E2e-Paired-Phone-2026!',
  agentName: 'crm-voice-agent-pp-e2e',
});

// Only the AI agent's real services survive from server/.env (parsed by dotenv itself: the file has
// CRLF line endings and inline comments).
const dotenvParsed = dotenv.parse(readFileSync(join(serverDir, '.env')));
const fromEnvFile = (name) => dotenvParsed[name] || '';
const keep = Object.fromEntries(['OPENAI_API_KEY', 'OPENAI_REALTIME_MODEL', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'JWT_SECRET', 'SESSION_SECRET']
  .map((k) => [k, fromEnvFile(k)]));
const blank = Object.fromEntries([
  'SMTP_HOST', 'SMTP_SERVICE', 'SMTP_MAIL', 'SMTP_PASSWORD', 'META_WHATSAPP_ACCESS_TOKEN', 'META_WHATSAPP_PHONE_NUMBER_ID', 'META_APP_SECRET',
  'TEXTBEE_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER', 'TWILIO_MESSAGING_SERVICE_SID', 'WHATSAPP_API_TOKEN',
  'SMS_API_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET_NAME', 'SENTRY_DSN', 'STRIPE_SECRET_KEY', 'PAYPAL_CLIENT_SECRET',
  'GOOGLE_PLACES_API_KEY', 'GOOGLE_GEOCODING_API_KEY', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'OUTLOOK_CLIENT_SECRET',
  'LIVEKIT_SIP_OUTBOUND_TRUNK_ID', 'LIVEKIT_TWILIO_SIP_OUTBOUND_TRUNK_ID', 'MESSAGING_PREFLIGHT_API_URL', 'MESSAGING_PREFLIGHT_BEARER_TOKEN',
].map((k) => [k, '']));

// Values the config schema insists on, pointing nowhere (a closed local port / dummy names).
const inert = {
  SMTP_HOST: '127.0.0.1', SMTP_PORT: '9', SMTP_SERVICE: 'e2e-disabled', SMTP_MAIL: 'e2e@example.com', SMTP_PASSWORD: 'e2e-disabled',
  AWS_ACCESS_KEY_ID: 'e2e-disabled', AWS_SECRET_ACCESS_KEY: 'e2e-disabled', AWS_S3_BUCKET_NAME: 'e2e-disabled',
};

const env = {
  ...process.env,
  ...blank,
  ...inert,
  ...keep,
  NODE_ENV: 'development',
  PORT: String(E2E.apiPort),
  MONGODB_URI: 'mongodb://127.0.0.1:27030/updata_e2e_paired_phone?replicaSet=rs0&directConnection=true',
  REDIS_URL: 'redis://127.0.0.1:6390/5',
  REDIS_KEY_PREFIX: 'ppe2e:',
  BULLMQ_PREFIX: 'ppe2e',
  ADMIN_EMAIL: E2E.adminEmail,
  ADMIN_PASSWORD: E2E.adminPassword,
  ADMIN_FIRST_NAME: 'E2E',
  ADMIN_LAST_NAME: 'Admin',
  CLIENT_URI: 'http://localhost:3000',
  STORAGE_BACKEND: 'local',
  PUBLIC_API_BASE_URL: `http://127.0.0.1:${E2E.apiPort}`,
  LIVEKIT_AGENT_NAME: E2E.agentName,
  AI_CALLING_REQUIRE_CONSENT: 'false',
  AI_CALLING_RECIPIENT_HOURS: '00:00-23:59',
  AI_CALLING_RECIPIENT_DAYS: '0,1,2,3,4,5,6',
  PAIRED_PHONE_KEY_SECRET: 'e2e-paired-phone-key-secret-not-for-production',
};

const children = [];
function start(name, cmd, args, cwd, childEnv) {
  const out = createWriteStream(join(logs, `${name}.log`), { flags: 'w' });
  const child = spawn(cmd, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.on('exit', (code) => process.stderr.write(`${name} exited (${code})\n`));
  children.push(child);
  return child;
}

const stop = () => {
  for (const c of children) c.kill('SIGTERM');
  // The agent worker drains jobs on SIGTERM and can linger; never leave it holding its port.
  setTimeout(() => {
    for (const c of children) if (c.exitCode === null) c.kill('SIGKILL');
    process.exit(0);
  }, 4000);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const api = start('api', process.execPath, ['src/server.js'], serverDir, env);
// The worker gets only what it needs (its own .env supplies the rest); the API's overrides break it.
const worker = start('agent-worker', process.execPath, ['src/agent.js', 'start'], join(serverDir, 'agent-worker'), {
  PATH: process.env.PATH, HOME: process.env.HOME, LIVEKIT_AGENT_NAME: E2E.agentName, AGENT_HEALTH_PORT: '8096',
});

let workerReady = false;
worker.stdout.on('data', (b) => { if (/registered worker/i.test(String(b))) workerReady = true; });
worker.stderr.on('data', (b) => { if (/registered worker/i.test(String(b))) workerReady = true; });

const deadline = Date.now() + 180_000;
for (;;) {
  if (api.exitCode !== null) {
    process.stderr.write('API exited during startup; see tests/e2e/.stack-logs/api.log\n');
    stop();
    break;
  }
  let apiReady = false;
  try {
    apiReady = (await fetch(`http://127.0.0.1:${E2E.apiPort}/health/live`)).ok;
  } catch { /* not yet */ }
  if (apiReady && workerReady) {
    process.stdout.write(`${JSON.stringify({ ready: true, api: `http://127.0.0.1:${E2E.apiPort}/api/v1`, admin: E2E.adminEmail, logs })}\n`);
    break;
  }
  if (Date.now() > deadline) {
    process.stderr.write(`stack not ready after 180 s (api=${apiReady}, worker=${workerReady})\n`);
    stop();
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
