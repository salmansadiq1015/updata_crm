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
 * Browser E2E + performance for the SMS link assistant customer page: a real
 * headless Chromium (mobile viewport, Pixel 7) against the real page and API.
 * Playwright is loaded from the web client's node_modules; the suite is skipped
 * when it (or its browser) is not installed.
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
// Stub model for the latency harness: streams immediately, so the measurement is the
// server's own overhead (validation, persistence, prompt building). Real-model latency
// is measured with scripts/linkAssistantLatency (needs the owner's OpenAI key).
const ai = { configured: false };
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => ai.configured,
  assertAiConfigured: () => {},
  createChatModel: async () => ({}),
  createOpenAiClient: async () => ({
    chat: {
      completions: {
        create: async (p) => (p.stream
          ? (async function* stream() {
            for (const w of ['Thanks! ', 'What is ', 'your monthly ', 'electricity bill?']) yield { choices: [{ delta: { content: w } }] };
            yield { choices: [], usage: { prompt_tokens: 600, completion_tokens: 20 } };
          }())
          : { choices: [{ message: { content: '{"intent":"unclear","value":null}' } }], usage: {} }),
      },
    },
  }),
}));

let mongod; let server; let base; let chromium; let devices; let browser;
let Lead; let LinkSession; let CallRecord; let token;

const auth = () => ({ Authorization: `Bearer ${token}` });
const describeIf = hasPlaywright ? describe : describe.skip;

async function seedLink(n, overrides = {}) {
  const lead = await Lead.create({
    leadNumber: `L-${80000 + n}`, name: `Bilal Traders ${n}`, source: 'manual', status: 'new',
    mobile: `+41 79 ${String(100 + n).padStart(3, '0')} 43 21`, address: { country: 'CH' }, createdBy: overrides.userId,
  });
  const created = await request(server).post('/api/v1/ai-calling/campaigns').set(auth()).send({
    name: `Solar ${n}`, channel: 'web_link',
    questionnaire: { questions: [
      { fieldKey: 'interest', label: 'Interest', text: 'Are you interested in a free solar survey?', type: 'boolean', required: true, order: 1 },
      { fieldKey: 'bill', label: 'Monthly bill', text: 'What is your monthly electricity bill?', type: 'integer', required: true, order: 2 },
    ] },
    statusRules: [{ id: 'hot', when: { all: [{ field: 'interest', equals: true }] }, action: 'mark_qualified' }],
    agentConfig: { organizationName: 'Sunrise Solar' },
    linkConfig: { reason: 'You asked about solar panels.' },
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


/** Web-first style waiting for Playwright locators under jest (polls until true or times out). */
async function until(check, message, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { if (await check()) return; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out: ${message}${last ? ` (${last.message})` : ''}`);
}
const hasText = (locator, text, timeout) => until(async () => (await locator.textContent() || '').toLowerCase().includes(text.toLowerCase()), `text "${text}"`, timeout);
const hasExactText = (locator, text) => until(async () => (await locator.textContent() || '').trim() === text, `exact text "${text}"`);
const isDisabled = (locator) => until(() => locator.isDisabled(), 'disabled');
const hasAttribute = (locator, name, value) => until(async () => (await locator.getAttribute(name)) === value, `${name}=${value}`);

const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

describeIf('SMS link assistant: customer page in a real mobile browser', () => {
  let userId;
  beforeAll(async () => {
    ({ chromium, devices } = await import(pathToFileURL(playwrightEntry).href));
    try { browser = await chromium.launch(); } catch { browser = null; }

    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
    const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
    const leadRoutes = (await import('../../src/modules/crm/lead.routes.js')).default;
    const aiCallingRoutes = (await import('../../src/modules/aiCalling/aiCalling.routes.js')).default;
    const linkRoutes = (await import('../../src/modules/linkAssistant/linkAssistant.routes.js')).default;
    const linkPublic = (await import('../../src/modules/linkAssistant/linkAssistant.public.routes.js')).default;
    const User = (await import('../../src/modules/auth/user.model.js')).default;
    const Role = (await import('../../src/modules/auth/role.model.js')).default;
    const Permission = (await import('../../src/modules/auth/permission.model.js')).default;
    Lead = (await import('../../src/modules/crm/lead.model.js')).default;
    LinkSession = (await import('../../src/modules/linkAssistant/linkSession.model.js')).default;
    CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
    const LeadCommunication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
    const { generateAccessToken } = await import('../../src/shared/utils/crypto.js');
    for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task']) {
      await import(`../../src/modules/${model}.model.js`);
    }
    await Promise.all([LeadCommunication.init(), LinkSession.init(), CallRecord.init()]);

    const app = express();
    app.set('trust proxy', 1);
    app.use((req, _res, next) => { req.requestId = 'test'; next(); });
    app.use(express.json());
    app.use(cookieParser());
    app.use(responseEnvelope);
    app.use('/api/v1/crm/leads', leadRoutes);
    app.use('/api/v1/ai-calling', aiCallingRoutes);
    app.use('/api/v1/link-assistant', linkRoutes);
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
    const role = await Role.create({ name: `LinkE2E_${randomUUID()}`, permissions: perms.map((p) => p._id) });
    const user = await User.create({
      email: `e2e-${randomUUID()}@test.ch`, passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
      firstName: 'E2E', lastName: 'User', role: role._id, status: 'active',
    });
    userId = user._id;
    token = generateAccessToken({ sub: String(user._id) });
  }, 180000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  const newPage = async () => {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    return { context, page: await context.newPage() };
  };

  it('full customer flow on a phone: instant greeting, quick replies, numeric keyboard, summary, submit → CRM updated', async () => {
    if (!browser) return;
    const { lead, url } = await seedLink(1, { userId });
    const { context, page } = await newPage();
    const response = await page.goto(url);
    expect(response.status()).toBe(200);
    // The greeting is in the server-rendered HTML (no JavaScript needed for the first paint).
    expect(await response.text()).toContain('an AI assistant from Sunrise Solar');
    await hasText(page.locator('.msg.ai').first(), 'AI assistant');

    // Large tap targets (≥ 44 px) for the quick replies.
    const start = page.getByRole('button', { name: "Yes, let's start" });
    expect((await start.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await start.click();
    await hasText(page.locator('.msg.ai').last(), 'free solar survey');
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await hasAttribute(page.locator('#input'), 'inputmode', 'numeric');
    await page.locator('#input').fill('18500');
    await page.locator('#input').press('Enter');
    await hasText(page.locator('.msg.ai').last(), 'what you told me');
    await hasExactText(page.locator('#plabel'), '2 of 2');
    await page.getByRole('button', { name: 'Yes, send' }).click();
    await hasText(page.locator('.msg.ai').last(), 'Thank you!');
    await isDisabled(page.locator('#input'));
    await context.close();

    expect((await Lead.findById(lead._id).lean()).status).toBe('qualified');
    const call = await CallRecord.findOne({ leadId: lead._id }).lean();
    expect(call.conversationState.answers.bill.normalizedValue).toBe(18500);
  }, 120000);

  it('a message typed while offline is sent once the connection is back (no duplicate answer)', async () => {
    if (!browser) return;
    const { url } = await seedLink(2, { userId });
    const { context, page } = await newPage();
    await page.goto(url);
    await page.getByRole('button', { name: "Yes, let's start" }).click();
    await hasText(page.locator('.msg.ai').last(), 'free solar survey');
    await context.setOffline(true);
    await page.locator('#input').fill('yes');
    await page.locator('#input').press('Enter');
    await page.locator('#banner').waitFor({ state: 'visible' });
    await context.setOffline(false);
    await hasText(page.locator('.msg.ai').last(), 'monthly electricity bill', 30000);
    const session = await LinkSession.findOne({}).sort({ createdAt: -1 }).lean();
    expect(session.transcript.filter((t) => t.role === 'customer' && t.text === 'yes')).toHaveLength(1);
    await context.close();
  }, 120000);

  it('Urdu: switching language re-greets right-to-left; "don\'t contact me" opts out from the page', async () => {
    if (!browser) return;
    const { url } = await seedLink(3, { userId });
    const { context, page } = await newPage();
    await page.goto(url);
    await page.selectOption('#lang', 'ur');
    await hasText(page.locator('.msg.ai').first(), 'السلام علیکم');
    expect(await page.locator('.msg.ai').first().getAttribute('dir')).toBe('auto');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.msg.ai')).direction)).toBe('rtl');
    await page.locator('#optout').click();
    await hasText(page.locator('.msg.ai').last(), 'رابطہ نہیں'); // Urdu: "will not contact you again"
    await isDisabled(page.locator('#input'));
    await context.close();
  }, 120000);

  it('page weight budget: HTML + CSS + JS well under 150 KB gzipped', async () => {
    const { url } = await seedLink(4, { userId });
    const html = await fetch(url, { headers: { 'Accept-Encoding': 'gzip' } });
    const htmlText = await html.text();
    const assets = [...htmlText.matchAll(/(?:href|src)="(\/c\/assets\/[^"]+)"/g)].map((m) => m[1]);
    expect(assets).toHaveLength(2);
    let total = Buffer.byteLength(htmlText) / 3; // HTML is small; gzip ratio ~3x
    for (const asset of assets) {
      const res = await request(server).get(asset).set('Accept-Encoding', 'gzip').buffer(true).parse((r, cb) => {
        const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(res.headers['content-encoding']).toBe('gzip');
      expect(res.headers['cache-control']).toMatch(/immutable/);
      total += res.body.length;
    }
    // eslint-disable-next-line no-console
    console.log(`[link-assistant] page weight ≈ ${(total / 1024).toFixed(1)} KB gzipped (budget 150 KB)`);
    expect(total).toBeLessThan(150 * 1024);
  }, 60000);

  it('latency harness: time to first streamed token (server overhead, stub model) p50/p95', async () => {
    ai.configured = true;
    const samples = [];
    for (let i = 0; i < 8; i += 1) {
      const { url } = await seedLink(100 + i, { userId });
      const pathname = new URL(url).pathname;
      const page = await fetch(url);
      const cookie = page.headers.get('set-cookie').split(';')[0];
      const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'ula', Cookie: cookie };
      await fetch(`${base}${pathname}/api/open`, { method: 'POST', headers, body: '{}' });
      for (const body of [{ action: '__start' }, { action: 'yes' }, { text: '12000' }]) {
        const t0 = performance.now();
        const res = await fetch(`${base}${pathname}/api/message`, { method: 'POST', headers, body: JSON.stringify({ ...body, clientMessageId: randomUUID() }) });
        const reader = res.body.getReader();
        await reader.read(); // first chunk = first token / replace event
        samples.push(performance.now() - t0);
        while (!(await reader.read()).done) { /* drain */ }
      }
    }
    ai.configured = false;
    const p50 = pct(samples, 50); const p95 = pct(samples, 95);
    // eslint-disable-next-line no-console
    console.log(`[link-assistant] first token (server overhead) n=${samples.length} p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms`);
    expect(p95).toBeLessThan(1500);
  }, 180000);
});
