/* global document, window -- used inside page.evaluate (runs in the browser) */
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, describe, expect, it, jest,
} from '@jest/globals';

/**
 * The voice call screen in a real headless Chromium against the real page and API,
 * with the LiveKit browser SDK replaced by a scripted fake (agent joins, agent
 * state, transcription streams, room closed). This proves the screen's control
 * flow — states, controls, transcript, persistence polling, cleanup and failure
 * screens. It does NOT prove audio: that is verified with a real call (see
 * docs/SMS-LINK-ASSISTANT.md, "Voice call verification").
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const playwrightEntry = path.resolve(here, '../../../client/node_modules/playwright-core/index.mjs');
const hasPlaywright = fs.existsSync(playwrightEntry);

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn(async () => ({})), getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/config/redis.js', () => {
  const unavailable = () => { throw new Error('Redis disabled in unit tests'); };
  const api = { createRedisClient: unavailable, getRedisClient: unavailable, disconnectRedis: async () => {}, isRedisConnected: () => false };
  return { ...api, default: api };
});
jest.unstable_mockModule('../../src/modules/auth/session.service.js', () => ({
  default: { isSessionActive: jest.fn(async () => true), touchSession: jest.fn() },
}));
jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: async (_k, fn) => fn(), get: async () => null, set: async () => {}, del: async () => {},
    invalidate: async () => {}, invalidatePattern: async () => {}, l1: { flush: () => {} },
  },
}));
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => false, assertAiConfigured: () => {}, createChatModel: async () => ({}),
  createOpenAiClient: async () => { throw new Error('no model'); },
}));
const lk = { dispatches: [], ended: [] };
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class {},
  default: {
    livekitReady: true,
    wsUrl: 'wss://unit-test.livekit.cloud',
    dispatchAgent: async ({ roomName, metadata }) => { lk.dispatches.push({ roomName, metadata }); return { outcome: 'accepted' }; },
    issueJoinToken: ({ roomName }) => `join.${roomName}`,
    endCall: async ({ roomName }) => { lk.ended.push(roomName); return { ended: true }; },
    roomStatus: async () => 'unknown',
  },
}));

// Scripted stand-in for livekit-client's UMD build (window.LivekitClient).
const FAKE_LIVEKIT = `(() => {
  const RoomEvent = { TrackSubscribed: 'ts', TrackUnsubscribed: 'tu', ParticipantConnected: 'pc', ParticipantDisconnected: 'pd',
    ParticipantAttributesChanged: 'pa', Reconnecting: 'rc', Reconnected: 'rd', Disconnected: 'dc', AudioPlaybackStatusChanged: 'ap' };
  window.__lk = { rooms: [] };
  class Room {
    constructor() {
      this.h = {}; this.remoteParticipants = new Map(); this.canPlaybackAudio = true; this.text = {}; this.disconnected = false;
      const room = this;
      this.localParticipant = {
        identity: 'lead-me', micEnabled: false,
        async setMicrophoneEnabled(on) { this.micEnabled = on; if (on && !room.mic) room.mic = await navigator.mediaDevices.getUserMedia({ audio: true }); },
        getTrackPublication() { return room.mic ? { track: { mediaStreamTrack: room.mic.getAudioTracks()[0] } } : null; },
      };
      window.__lk.rooms.push(this);
    }
    on(e, f) { (this.h[e] = this.h[e] || []).push(f); return this; }
    emit(e, ...a) { (this.h[e] || []).forEach((f) => f(...a)); }
    registerTextStreamHandler(topic, fn) { this.text[topic] = fn; }
    async connect(url, token) { this.url = url; this.token = token; }
    async startAudio() {}
    async disconnect() { this.disconnected = true; if (this.mic) this.mic.getTracks().forEach((t) => t.stop()); this.emit('dc', 1); }
    getActiveDevice() { return 'default'; }
    async switchActiveDevice() {}
    static async getLocalDevices() { return [{ deviceId: 'default', label: 'Speaker' }]; }
  }
  window.LivekitClient = { Room, RoomEvent, Track: { Source: { Microphone: 'microphone' } }, ParticipantKind: { AGENT: 4 },
    DisconnectReason: { CLIENT_INITIATED: 1, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5 } };
  const room = () => window.__lk.rooms[window.__lk.rooms.length - 1];
  window.__agent = (state) => {
    const r = room(); let p = r.remoteParticipants.get('agent-1');
    if (!p) { p = { identity: 'agent-1', kind: 4, attributes: { 'lk.agent.state': state } }; r.remoteParticipants.set('agent-1', p); r.emit('pc', p); }
    else { p.attributes['lk.agent.state'] = state; r.emit('pa', { 'lk.agent.state': state }, p); }
  };
  window.__say = (identity, segment, chunks) => {
    const reader = { info: { id: segment, attributes: { 'lk.segment_id': segment } },
      [Symbol.asyncIterator]: async function* () { for (const c of chunks) yield c; } };
    room().text['lk.transcription'](reader, { identity });
  };
  window.__roomClosed = () => room().emit('dc', 5);
})();`;

// A real (synthetic) microphone stream so the level meter has something to read.
const FAKE_MIC = `(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(); const dest = ctx.createMediaStreamDestination();
    osc.connect(dest); osc.start();
    window.__micStreams = (window.__micStreams || 0) + 1;
    return dest.stream;
  };
})();`;

let mongod; let server; let base; let chromium; let browser; let token; let userId;
let Lead; let LinkSession;
const auth = () => ({ Authorization: `Bearer ${token}` });
const describeIf = hasPlaywright ? describe : describe.skip;

async function until(check, message, timeout = 10000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { if (await check()) return; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error(`Timed out: ${message}${last ? ` (${last.message})` : ''}`);
}

async function seedLink(n) {
  const lead = await Lead.create({
    leadNumber: `L-${95000 + n}`, name: `Bilal Traders ${n}`, source: 'manual', status: 'new',
    mobile: `+41 79 ${String(300 + n).padStart(3, '0')} 43 21`, address: { country: 'CH' }, createdBy: userId,
  });
  const created = await request(server).post('/api/v1/ai-calling/campaigns').set(auth()).send({
    name: `Solar voice ${n}`, channel: 'web_link',
    questionnaire: { questions: [
      { fieldKey: 'interest', label: 'Interest', text: 'Are you interested in a free solar survey?', type: 'boolean', required: true, order: 1 },
      { fieldKey: 'bill', label: 'Monthly bill', text: 'What is your monthly electricity bill?', type: 'integer', required: true, order: 2 },
    ] },
    agentConfig: { organizationName: 'Sunrise Solar' },
    linkConfig: { reason: 'You asked about solar panels.', voiceTier: 'premium' },
    schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    selection: { mode: 'explicit', leadIds: [String(lead._id)] },
  });
  const id = created.body.data._id;
  await request(server).post(`/api/v1/ai-calling/campaigns/${id}/start`).set(auth()).send({});
  const res = await request(server).post(`/api/v1/crm/leads/${lead._id}/communications`).set(auth()).send({
    operationId: randomUUID(), channel: 'sms', route: 'sms_direct', mode: 'manual', destinationField: 'mobile', linkCampaignId: id,
  });
  return { lead, url: res.body.data.link.url };
}

async function phonePage({ micDenied = false, agentWaitMs } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.route('**/c/assets/livekit-client.*', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_LIVEKIT }));
  await page.addInitScript(micDenied
    ? 'navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));'
    : FAKE_MIC);
  if (agentWaitMs) await page.addInitScript(`window.__ulaAgentWaitMs = ${agentWaitMs};`);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
}
const stateOf = (page) => page.getAttribute('#stage', 'data-state');

describeIf('SMS link voice call screen (scripted LiveKit; control flow, not audio)', () => {
  beforeAll(async () => {
    ({ chromium } = await import(pathToFileURL(playwrightEntry).href));
    try { browser = await chromium.launch(); } catch { browser = null; }
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
    const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
    const leadRoutes = (await import('../../src/modules/crm/lead.routes.js')).default;
    const aiCalling = await import('../../src/modules/aiCalling/aiCalling.routes.js');
    const linkPublic = (await import('../../src/modules/linkAssistant/linkAssistant.public.routes.js')).default;
    const User = (await import('../../src/modules/auth/user.model.js')).default;
    const Role = (await import('../../src/modules/auth/role.model.js')).default;
    const Permission = (await import('../../src/modules/auth/permission.model.js')).default;
    Lead = (await import('../../src/modules/crm/lead.model.js')).default;
    LinkSession = (await import('../../src/modules/linkAssistant/linkSession.model.js')).default;
    const { generateAccessToken } = await import('../../src/shared/utils/crypto.js');
    for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task', 'crm/leadCommunication', 'aiCalling/callRecord']) {
      await import(`../../src/modules/${model}.model.js`);
    }
    const app = express();
    app.use((req, _res, next) => { req.requestId = 'test'; next(); });
    app.use(express.json());
    app.use(cookieParser());
    app.use(responseEnvelope);
    app.use('/api/v1/crm/leads', leadRoutes);
    app.use('/api/v1/ai-calling/agent', aiCalling.agentToolRoutes);
    app.use('/api/v1/ai-calling', aiCalling.default);
    app.use('/c', linkPublic);
    app.use(errorHandler);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    process.env.LINK_ASSISTANT_BASE_URL = base;
    const perms = await Permission.insertMany(['lead:read', 'lead:write', 'ai-calling:read', 'ai-calling:write'].map((p) => {
      const [module, action] = p.split(':');
      return { module, action, description: p };
    }));
    const role = await Role.create({ name: `Voice_${randomUUID()}`, permissions: perms.map((p) => p._id) });
    const user = await User.create({
      email: `voice-${randomUUID()}@test.ch`, passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
      firstName: 'E2E', lastName: 'User', role: role._id, status: 'active',
    });
    userId = user._id;
    token = generateAccessToken({ sub: String(user._id) });
  }, 180000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it('start → waiting for the agent → listening/speaking from the agent state → live captions, saved answers → mute → transcript → end and clean up', async () => {
    if (!browser) return;
    const { url, lead } = await seedLink(1);
    const { context, page, errors } = await phonePage();
    await page.goto(url);
    expect(await stateOf(page)).toBe('idle');
    expect(await page.isVisible('#vstart')).toBe(true);
    // Nothing connects until the customer taps Start: no microphone, no agent.
    expect(await page.evaluate(() => window.__micStreams || 0)).toBe(0);
    expect(lk.dispatches).toHaveLength(0);

    await page.click('#vstart');
    await until(async () => (await stateOf(page)) === 'waiting', 'waiting for the agent');
    expect(lk.dispatches).toHaveLength(1);
    expect(await page.isVisible('#vtimer')).toBe(false); // no call time before anyone answers
    expect(await page.textContent('#vstate')).toMatch(/Waiting for Ayesha/);

    await page.evaluate(() => window.__agent('listening'));
    await until(async () => (await stateOf(page)) === 'listening', 'listening');
    expect(await page.getAttribute('#stage', 'data-live')).toBe('');
    expect(await page.isVisible('#vtimer')).toBe(true);
    expect(await page.textContent('#vpill')).toMatch(/In call/);

    await page.evaluate(() => window.__agent('speaking'));
    await page.evaluate(() => window.__say('agent-1', 'seg-1', ['Are you interested ', 'in a free solar survey?']));
    await until(async () => (await stateOf(page)) === 'speaking', 'speaking');
    await until(async () => (await page.textContent('#caption')) === 'Are you interested in a free solar survey?', 'live caption');
    await page.evaluate(() => window.__say('lead-me', 'seg-2', ['Yes, I am.']));

    // The worker records the answer on the server; the page shows it as saved.
    const { metadata } = lk.dispatches[0];
    const agent = (p, body = {}) => request(server).post(`/api/v1/ai-calling/agent/${metadata.callId}${p}`).set({ Authorization: `Bearer ${metadata.agentToken}` }).send(body);
    await agent('/answered').expect(200);
    await agent('/disclose').expect(200);
    await agent('/record-answer', { fieldKey: 'interest', rawAnswer: 'Yes, I am.' }).expect(200);
    await until(async () => (await page.textContent('#vlog')).includes('Answer saved'), 'saved answer appears', 8000);
    expect(await page.textContent('#cplabel')).toBe('Question 2 of 2');

    // Mute really turns the microphone off; with the agent listening the screen says so.
    await page.evaluate(() => window.__agent('listening'));
    await page.click('#vmute');
    await until(async () => (await stateOf(page)) === 'muted', 'muted');
    expect(await page.evaluate(() => window.__lk.rooms[0].localParticipant.micEnabled)).toBe(false);
    await page.click('#vmute');
    await until(async () => (await stateOf(page)) === 'listening', 'unmuted');
    expect(await page.evaluate(() => window.__lk.rooms[0].localParticipant.micEnabled)).toBe(true);

    // Transcript sheet opens without interrupting the call.
    await page.click('#vtx2');
    await until(() => page.evaluate(() => document.getElementById('vconv').classList.contains('open')), 'transcript open');
    const log = await page.textContent('#vlog');
    expect(log).toContain('Are you interested in a free solar survey?');
    expect(log).toContain('Yes, I am.');
    expect(await stateOf(page)).toBe('listening');
    await page.click('#vtxclose');

    // Speaker selection only appears when there is more than one output to choose.
    expect(await page.isVisible('#vspk')).toBe(false);

    // End: room left, server told, honest partial summary, nothing still "listening".
    await page.click('#vend');
    await until(() => page.isVisible('#vresult'), 'result shown');
    expect(await stateOf(page)).toBe('ended');
    expect(await page.getAttribute('#stage', 'data-live')).toBeNull();
    expect(await page.evaluate(() => window.__lk.rooms[0].disconnected)).toBe(true);
    expect(await page.textContent('#rtext')).toMatch(/answers so far are saved/);
    expect(await page.textContent('#rsum')).toMatch(/Interest\s*Yes/);
    expect(lk.ended).toContain(lk.dispatches[0].roomName);
    const session = await LinkSession.findOne({ leadId: lead._id });
    expect(session.voice.activeUntil).toBeNull();
    expect(session.status).toBe('active');
    expect(errors).toEqual([]);
    await context.close();
  }, 60000);

  it('the agent finishing the conversation closes the call and shows the completed summary', async () => {
    if (!browser) return;
    const { url } = await seedLink(2);
    const { context, page } = await phonePage();
    await page.goto(url);
    await page.click('#vstart');
    await until(async () => (await stateOf(page)) === 'waiting', 'waiting');
    await page.evaluate(() => window.__agent('listening'));
    const { metadata } = lk.dispatches.at(-1);
    const agent = (p, body = {}) => request(server).post(`/api/v1/ai-calling/agent/${metadata.callId}${p}`).set({ Authorization: `Bearer ${metadata.agentToken}` }).send(body);
    await agent('/answered');
    await agent('/disclose');
    await agent('/record-answer', { fieldKey: 'interest', rawAnswer: 'yes' });
    await agent('/record-answer', { fieldKey: 'bill', rawAnswer: '120' });
    await agent('/end', { durationSeconds: 40, roomName: lk.dispatches.at(-1).roomName }).expect(200);
    await page.evaluate(() => window.__roomClosed());
    await until(async () => (await page.textContent('#rtext') || '').includes('Your answers were sent to Sunrise Solar'), 'completed text');
    expect(await page.textContent('#rsum')).toMatch(/Monthly bill\s*120/);
    expect(await page.isVisible('#rprimary')).toBe(false); // nothing left to continue
    await context.close();
  }, 60000);

  it('microphone refused → clear steps, Try again and Type instead; no agent is started', async () => {
    if (!browser) return;
    const { url } = await seedLink(3);
    const before = lk.dispatches.length;
    const { context, page } = await phonePage({ micDenied: true });
    await page.goto(url);
    await page.click('#vstart');
    await until(() => page.isVisible('#vresult'), 'mic screen');
    expect(await page.textContent('#rtitle')).toBe('Microphone access needed');
    expect(await page.locator('#rsteps li').count()).toBe(3);
    expect(lk.dispatches.length).toBe(before);
    await page.click('#rsecondary');
    await until(() => page.isVisible('#chat'), 'chat shown');
    expect(await page.evaluate(() => document.body.classList.contains('mode-chat'))).toBe(true);
    await context.close();
  }, 60000);

  it('daily voice budget used up → says so and offers typing (no retry button, no agent)', async () => {
    if (!browser) return;
    const { url, lead } = await seedLink(5);
    const session = await LinkSession.findOne({ leadId: lead._id });
    const { LinkSpend } = await import('../../src/modules/linkAssistant/linkSettings.model.js');
    await LinkSpend.create({ campaignId: session.campaignId, day: new Date().toISOString().slice(0, 10), amount: 99 });
    const before = lk.dispatches.length;
    const { context, page } = await phonePage();
    await page.goto(url);
    await page.click('#vstart');
    await until(async () => (await page.textContent('#rtitle') || '').includes("today's limit"), 'budget message');
    expect(await page.isVisible('#rprimary')).toBe(false);
    expect(await page.isVisible('#rsecondary')).toBe(true);
    expect(lk.dispatches.length).toBe(before);
    await context.close();
  }, 60000);

  it('agent never joins → "not available" (never a fake "listening"), and the room lease is released', async () => {
    if (!browser) return;
    const { url, lead } = await seedLink(4);
    const { context, page } = await phonePage({ agentWaitMs: 400 });
    await page.goto(url);
    await page.click('#vstart');
    await until(async () => (await page.textContent('#rtitle') || '').includes('not available'), 'unavailable');
    expect(await stateOf(page)).toBe('error');
    await until(async () => (await LinkSession.findOne({ leadId: lead._id })).voice.activeUntil === null, 'lease released');
    await context.close();
  }, 60000);
});
