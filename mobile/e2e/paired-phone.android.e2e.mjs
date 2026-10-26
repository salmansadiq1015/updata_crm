#!/usr/bin/env node
/**
 * Android E2E for paired-phone calling: the real dev build on an emulator against the isolated
 * stack (server/tests/e2e/pairedPhone.stack.mjs), with the real gateway code and a simulated board
 * (server/phone-gateway/test/e2e/sim-gateway.mjs). Drives the app with adb + UI Automator.
 *
 *   1. cd server && node tests/e2e/pairedPhone.stack.mjs
 *   2. Metro for the dev client on :8081 (npx expo start --dev-client), EXPO_PUBLIC_API_URL=http://localhost:9097/api/v1
 *   3. node mobile/e2e/paired-phone.android.e2e.mjs [--shots <dir>]
 *
 * Covers: login · Settings → Paired phones (status, checks, usage) · Call Agent tile · voice kill switch
 * (confirm → paused on the server → resume) · live call card on the AI campaign (Paired phone, audio
 * live) · app killed and relaunched mid-call (the call carries on, the card comes back) · Take over →
 * the server records it, the phone stays held while the person talks, the call is flagged for review
 * and counts as reached · Pause → Resume → Cancel from the app (the second lead is never dialed).
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { AndroidDriver, sleep } from './android-driver.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({ options: { shots: { type: 'string' }, serial: { type: 'string', default: 'emulator-5554' }, package: { type: 'string', default: 'ai.updata.crm.dev' } } });
const API = 'http://127.0.0.1:9097/api/v1';
const ADMIN = { email: 'e2e-admin@example.com', password: 'E2e-Paired-Phone-2026!' };
const TAG = `M${Date.now().toString(36).slice(-5)}`;
const results = [];
const T0 = Date.now();
const step = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}  [${Math.round((Date.now() - T0) / 1000)} s]\n`);
  if (!ok) throw new Error(`${name}: ${detail}`);
};

// ---- server-side setup through the real API ------------------------------------------------------
async function api(path, { method = 'GET', body, token } = {}, attempt = 1) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    // A reused keep-alive socket the server already closed (ECONNRESET): retry once.
    if (attempt < 3) return api(path, { method, body, token }, attempt + 1);
    throw err;
  }
  const json = await res.json().catch(() => ({}));
  // The app on the emulator and this script share one IP (adb reverse): back off on the global limiter.
  if (res.status === 429 && attempt < 8) {
    await sleep(8000);
    return api(path, { method, body, token }, attempt + 1);
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json?.error?.message || ''}`);
  return json.data;
}
const login = await api('/auth/login', { method: 'POST', body: ADMIN });
const token = login.accessToken || login.tokens?.accessToken;
const devName = `Mobile bridge ${TAG}`;
const { code } = await api('/paired-phone/devices/pairing-code', { method: 'POST', token, body: { deviceName: devName, phoneLabel: 'Emulator SIM' } });

const SIM = resolve(here, '../../server/phone-gateway/test/e2e/sim-gateway.mjs');
// A slow, evasive lead keeps the AI busy long enough to watch the call and take it over.
const scenario = [{
  lines: ['Hello?', 'Sorry, who is this?', 'Hmm, let me think about that.', 'Sorry, can you repeat that?', 'I am not sure yet.', 'Give me a second.', 'Okay.'],
  remoteHangupAfterMs: 230_000, // long enough for a (slow, debug-build) app restart and a takeover
}, { lines: ['Hello?', 'No thank you.'] }]; // a second call must never happen (paused, then cancelled)
const sim = spawn(process.execPath, [SIM, '--api', API, '--code', code, '--scenarios', JSON.stringify(scenario)], { stdio: ['ignore', 'pipe', 'inherit'] });
const simEvents = [];
sim.stdout.on('data', (b) => String(b).split('\n').filter(Boolean).forEach((l) => { try { simEvents.push(JSON.parse(l)); } catch { /* ignore */ } }));
const until = async (fn, ms, what) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await sleep(2500); }
  throw new Error(`timed out: ${what}`);
};
const findDevice = async () => (await api('/paired-phone/devices', { token })).find((d) => d.name === devName && !d.revoked);
await until(async () => (await findDevice())?.state?.hfp === 'slc', 60_000, 'simulated phone link');
const device = await findDevice();
// A long cooldown keeps the second lead waiting while the app pauses, resumes and cancels the campaign.
await api(`/paired-phone/devices/${device.id}`, { method: 'PATCH', token, body: { limits: { cooldownSeconds: 900 } } });
await api(`/paired-phone/devices/${device.id}/verify-audio`, { method: 'POST', token, body: { inboundPhraseHeard: true, outboundPhraseHeard: true, note: 'Android E2E: simulated board' } });

const lead = await api('/crm/leads', { method: 'POST', token, body: { name: `Mobile lead ${TAG}`, mobile: '+923007654399', address: { city: `Mob-${TAG}`, country: 'PK' }, source: 'manual' } });
const lead2 = await api('/crm/leads', { method: 'POST', token, body: { name: `Mobile lead 2 ${TAG}`, mobile: '+923007654398', address: { city: `Mob-${TAG}`, country: 'PK' }, source: 'manual' } });
const campaign = await api('/ai-calling/campaigns', {
  method: 'POST', token, body: {
    name: `Android paired ${TAG}`,
    questionnaire: { questions: [
      { fieldKey: 'active', label: 'Still operating', text: 'Is your business still operating?', type: 'boolean', required: true, order: 1 },
      { fieldKey: 'employees', label: 'Employees', text: 'How many employees do you have?', type: 'integer', required: true, order: 2 },
      { fieldKey: 'interest', label: 'Interest', text: 'Would you like a free consultation?', type: 'boolean', required: true, order: 3 },
    ] },
    agentConfig: { agentName: 'Sara', organizationName: 'Updata', language: 'en', maxCallSeconds: 300 },
    schedule: { timezone: 'Asia/Karachi', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxAttemptsPerLead: 1 },
    selection: { mode: 'explicit', leadIds: [lead._id || lead.id, lead2._id || lead2.id] },
    transport: 'paired_phone', pairedDeviceId: device.id,
  },
});
const campaignId = campaign._id;

// ---- the app -----------------------------------------------------------------------------------------
const d = new AndroidDriver({ serial: args.serial, shots: args.shots });
for (const port of ['9097', '8081']) d.adb('reverse', `tcp:${port}`, `tcp:${port}`);
d.adb('shell', 'am', 'force-stop', args.package);
// Debug clients ask for 'display over other apps' (dev tools overlay); grant it so no settings page interrupts.
d.adb('shell', 'appops', 'set', args.package, 'SYSTEM_ALERT_WINDOW', 'allow');
d.adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'updata://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081', args.package);
try {
  // Login (skipped if a session is still valid).
  // A fresh dev-client install shows a welcome sheet, then the dev menu: get past both.
  let first;
  for (let i = 0; i < 6; i += 1) {
    first = await d.findAny(['Continue', 'Fast Refresh', 'Sign in', 'Settings'], 180_000);
    if (first === 'Continue') await d.tap('Continue');
    else if (first === 'Fast Refresh') await d.tap('Close');
    else break;
    await sleep(1500);
  }
  if (first === 'Sign in') {
    await d.fill('name@company.com', ADMIN.email);
    await d.fill('Enter your password', ADMIN.password);
    d.adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); // hide the keyboard
    await d.tap('Sign in');
  }
  // Android may offer to save the password (Google Password Manager): decline it.
  for (let i = 0; i < 3; i += 1) {
    const seen = await d.findAny(['Not now', 'Settings'], 60_000);
    if (seen === 'Settings') break;
    await d.tap('Not now');
  }
  await d.find('Settings', { timeout: 30_000 });
  step('login', true);

  // Call Agent tab → Paired phone tile.
  await d.tap('Call Agent');
  await d.scrollTo('Paired phone');
  d.screenshot('01-call-agent-tile');
  step('Call Agent home shows the Paired phone tile', true);
  await d.tap('Paired phone');
  await d.find(devName, { timeout: 30_000 });
  d.screenshot('02-paired-phones');
  step('Paired phones screen lists the device', true);
  step('device is ready to call', await d.has('Ready to call', 15_000));
  for (const check of ['Laptop gateway online', 'ESP32 board connected', 'Dial key provisioned', 'Two-way call audio verified']) {
    step(`check shown: ${check}`, await d.has(check, 5000));
  }

  // Kill switch: confirmation, server state, resume.
  await d.tap('Stop all calling');
  await d.find('Stop all AI voice calling?', { timeout: 10_000 });
  d.screenshot('03-kill-switch-confirm');
  await d.tap('Stop all calling', { nth: 1 });
  await d.find('Paused', { timeout: 15_000 });
  step('kill switch paused on the server', (await api('/ai-calling/settings', { token })).voicePaused === true);
  await d.tap('Resume calling');
  await d.find('Active', { timeout: 15_000 });
  step('kill switch resumed on the server', (await api('/ai-calling/settings', { token })).voicePaused === false);
  d.back();

  // Open the draft campaign and start it from the phone, as a user would.
  await d.tap('Call Agent');
  await d.scrollTo('See all');
  await d.tap('See all');
  await d.scrollTo(`Android paired ${TAG}`);
  await d.tap(`Android paired ${TAG}`);
  step('campaign says calls go out from the paired phone', await d.has(/AI calls go out from your paired phone/, 15_000));
  await d.scrollTo('Review and start');
  await d.tap('Review and start');
  step('start sheet describes paired-phone calling', await d.has(/from your paired phone's SIM, one call at a time/, 10_000));
  d.screenshot('04-start-sheet');
  await d.tap('I understand this contacts real people and costs money.');
  await d.tap('Start calls');
  await until(() => simEvents.some((e) => e.event === 'agent_spoke'), 120_000, 'AI speaking on the simulated call');
  await d.scrollTo(/call in progress/, 8);
  step('live call card shows the call', true);
  step('call shown as a paired-phone call', await d.has('Paired phone', 5000));
  step('call audio shown live', await d.has('Audio live', 10_000));
  d.screenshot('05-live-call');

  // App killed and relaunched mid-call: the call is the server's, it carries on; the card comes back.
  d.adb('shell', 'am', 'force-stop', args.package);
  await sleep(4000);
  step('call kept going while the app was closed', (await api(`/ai-calling/campaigns/${campaignId}/active-calls`, { token })).length === 1);
  d.adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'updata://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081', args.package);
  for (let i = 0; i < 4; i += 1) {
    const seen = await d.findAny(['Fast Refresh', 'Settings'], 120_000);
    if (seen === 'Settings') break;
    await d.tap('Close');
  }
  step('app relaunched and signed in', true);
  await d.tap('Call Agent');
  await d.scrollTo('See all');
  await d.tap('See all');
  await d.scrollTo(`Android paired ${TAG}`);
  await d.tap(`Android paired ${TAG}`);
  await d.scrollTo(/call in progress/, 8);
  step('after relaunch the live call card is back', await d.has('Audio live', 15_000));

  // Take over from the phone app.
  await d.scrollTo('Take over');
  await d.tap('Take over');
  await d.find('Take over this call?', { timeout: 10_000 });
  await d.tap('Take over', { nth: 1 });
  await until(async () => {
    const calls = await api(`/ai-calling/campaigns/${campaignId}/active-calls`, { token });
    return calls.length === 0 || calls[0].gateway?.takenOver || calls[0].gateway?.command === 'takeover';
  }, 30_000, 'takeover recorded');
  step('takeover reached the server and the gateway', true);
  await sleep(5000);
  // The person is now talking on the handset: the call stays open and the phone stays held.
  const held = await api(`/ai-calling/campaigns/${campaignId}/active-calls`, { token });
  const dev = (await api('/paired-phone/devices', { token })).find((x) => x.id === device.id);
  step('taken-over call stays open while the person is on the phone', held.length === 1 && Boolean(dev?.currentCallId), `active ${held.length}, device held ${Boolean(dev?.currentCallId)}`);
  await until(async () => (await api(`/ai-calling/campaigns/${campaignId}/active-calls`, { token })).length === 0, 120_000, 'call finished');
  const recipients = await api(`/ai-calling/campaigns/${campaignId}/recipients`, { token });
  const call = await api(`/ai-calling/calls/${recipients[0].lastCallId}`, { token });
  step('taken-over call flagged for review', call.reviewRequired === true, `state ${call.state}, takenOver ${Boolean(call.gateway?.takenOverAt)}`);
  step('taken-over call counts as reached, never unanswered', call.disposition === 'answered_partial', `disposition ${call.disposition}`);
  d.screenshot('06-after-call');

  // Pause → Resume → Cancel from the app. The second lead waits for the phone's cooldown; it must never be dialed.
  const status = async () => (await api(`/ai-calling/campaigns/${campaignId}`, { token })).status;
  await d.scrollTo('Pause', 8);
  await d.tap('Pause');
  await until(async () => (await status()) === 'paused', 20_000, 'campaign paused');
  step('Pause from the app pauses the campaign on the server', true);
  await d.scrollTo('Resume', 8);
  await d.tap('Resume');
  await d.tap('I understand this contacts real people and costs money.');
  await d.tap('Start calls');
  await until(async () => (await status()) === 'running', 20_000, 'campaign resumed');
  step('Resume from the app resumes it', true);
  await d.scrollTo('Cancel campaign', 8);
  await d.tap('Cancel campaign');
  await d.find('Cancel this campaign?', { timeout: 10_000 });
  await d.tap('Cancel campaign', { nth: 1 });
  await until(async () => (await status()) === 'cancelled', 20_000, 'campaign cancelled');
  step('Cancel from the app stops the campaign', true);
  await sleep(3000);
  const dialed = simEvents.filter((e) => e.event === 'call_dialed').length;
  step('the second lead was never dialed', dialed === 1, `${dialed} call(s) dialed`);
  d.screenshot('07-cancelled');
} finally {
  await api(`/paired-phone/devices/${device.id}/revoke`, { method: 'POST', token }).catch(() => {});
  sim.kill('SIGTERM');
  for (const port of ['9097']) { try { d.adb('reverse', '--remove', `tcp:${port}`); } catch { /* ignore */ } }
  const failed = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n${results.length - failed}/${results.length} steps passed\n`);
}
