/** Opt-in full-stack browser check. Run with AGENT_BROWSER_URL pointing at an
 * isolated Next server. All calling APIs and MongoDB are real; provider, queue,
 * authentication identity and storage boundaries are isolated test adapters. */
import express from 'express';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';
const actor = new mongoose.Types.ObjectId();
const addJob = jest.fn(async () => ({}));
const dial = jest.fn(async () => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: 'isolated-browser-sip' }));
const imageBytes = new Map();
let Files;
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob, getQueueStats: async () => ({ workers: 1 }) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: async () => ({}) } }));
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => { req.user = { _id: actor }; next(); },
  requirePermission: () => (_req, _res, next) => next(),
}));
jest.unstable_mockModule('../../src/shared/middleware/rateLimiter.js', () => ({
  uploadLimiter: (_req, _res, next) => next(), enrichLimiter: (_req, _res, next) => next(), geocodeLimiter: (_req, _res, next) => next(),
}));
jest.unstable_mockModule('../../src/shared/storage/StorageService.js', () => ({ default: {
  getPresignedUrl: async key => `data:image/webp;base64,${imageBytes.get(key).toString('base64')}`,
} }));
jest.unstable_mockModule('../../src/modules/files/file.service.js', () => ({ default: {
  upload: async input => { const key = `isolated-avatar/${crypto.randomUUID()}`; imageBytes.set(key, input.buffer); return Files.create({ ...input, key }); },
} }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class { constructor() { this.configured = false; } eligibleFor() { return false; } async health() { return { configured: false }; } },
  default: { configured: true, health: async () => ({ configured: true, eligible: true }), createOutboundCall: (...args) => dial(...args), roomStatus: async () => 'unknown', endCall: async () => ({ ended: true }) },
}));

const suite = process.env.AGENT_BROWSER_URL ? describe : describe.skip;
suite('agent-first UI through the real API and temporary database', () => {
  let db; let server; let browser; let calling; let Agent; let Campaign; let Lead; let Calls;
  const browserUrl = process.env.AGENT_BROWSER_URL;
  beforeAll(async () => {
    db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri());
    calling = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
    Agent = (await import('../../src/modules/aiCalling/callingAgent.model.js')).default;
    Campaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
    Lead = (await import('../../src/modules/crm/lead.model.js')).default;
    Calls = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
    Files = (await import('../../src/modules/files/file.model.js')).default;
    await (await import('../../src/migrations/031_calling_agents.js')).up();
    await Lead.create({ name: 'Isolated QA customer', leadNumber: 'QA-ONE', source: 'manual', status: 'new', mobile: '+41791234567', address: { country: 'CH' }, createdBy: actor });
    const app = express(); app.use(express.json());
    app.use((await import('../../src/shared/middleware/responseEnvelope.js')).default);
    app.use('/api/v1/ai-calling', (await import('../../src/modules/aiCalling/aiCalling.routes.js')).default);
    app.use('/api/v1/crm/leads', (await import('../../src/modules/crm/lead.routes.js')).default);
    app.use((await import('../../src/shared/middleware/errorHandler.js')).default);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const clientRequire = createRequire(new URL('../../../client/package.json', import.meta.url));
    browser = await clientRequire('playwright').chromium.launch({ headless: true });
  }, 60000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); if (db) await db.stop();
  });

  it('persists avatar, voice, questions and assignments, then queues immediate and future campaigns from the browser', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const apiOrigin = `http://127.0.0.1:${server.address().port}`;
    const cors = { 'access-control-allow-origin': new URL(browserUrl).origin, 'access-control-allow-headers': 'Authorization, Content-Type, X-Request-Id', 'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS' };
    await context.addCookies([{ name: 'mb_refresh_token', value: 'isolated-qa', url: browserUrl }]);
    await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/api/v1/ai-calling/') || path.startsWith('/api/v1/crm/leads')) {
        const response = await route.fetch({ url: `${apiOrigin}${path}${new URL(route.request().url()).search}` });
        await route.fulfill({ response, headers: { ...response.headers(), ...cors } }); return;
      }
      const data = path.endsWith('/auth/refresh') ? { accessToken: 'isolated-qa', refreshToken: 'isolated-qa' }
        : path.endsWith('/users/me') ? { _id: String(actor), firstName: 'Isolated', lastName: 'QA', role: { name: 'Admin', permissions: ['ai-calling:read', 'ai-calling:write', 'lead:read', 'crm:read'] } } : [];
      await route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ success: true, data }) });
    });
    await page.goto(`${browserUrl}/ai-calling`);
    await page.getByRole('button', { name: 'Create Agent', exact: true }).first().click();
    await page.getByLabel('Agent name *', { exact: true }).fill('Persisted QA Agent');
    await page.getByLabel('Title / role', { exact: true }).fill('Sales Qualification Agent');
    await page.getByRole('button', { name: 'Choose avatar', exact: true }).click();
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#6256ee' } }).png().toBuffer();
    await page.getByLabel('Upload avatar image').setInputFiles({ name: 'qa-avatar.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Use as avatar', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel('Company name (disclosed)').fill('Updata QA');
    await page.getByRole('combobox', { name: /^Voice/ }).selectOption('coral');
    await page.getByLabel('Call objective and instructions').fill('Ask whether the customer would like a callback.');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Add question', exact: true }).click();
    await page.getByLabel('Question 1 label').fill('Callback interest');
    await page.getByLabel('Question 1 text').fill('Would you like a callback?');
    await page.getByLabel('Question 1 answer type').selectOption('boolean');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: 'Create active agent', exact: true }).click();
    await page.getByRole('tab', { name: 'Leads', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select Isolated QA customer', exact: true }).check();
    await page.getByRole('button', { name: 'Review 1 assignments' }).click();
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/leads') && response.request().method() === 'PUT' && response.ok()),
      page.getByRole('button', { name: 'Confirm assignments' }).click(),
    ]);
    expect((await Agent.findOne().lean()).assignedLeadIds).toHaveLength(1);
    const saved = await Agent.findOne().lean();
    expect(saved.avatarFileId).toBeTruthy(); expect(await Files.countDocuments()).toBe(1);
    expect(saved.agentConfig.voice).toBe('coral'); expect(saved.questionnaire.questions[0].text).toBe('Would you like a callback?');
    await page.reload();
    await page.getByRole('button', { name: 'Open Persisted QA Agent' }).click();
    await page.getByRole('tab', { name: 'Questions', exact: true }).click();
    await page.getByLabel('Question 1 text').waitFor();
    expect(await page.getByLabel('Question 1 text').inputValue()).toBe('Would you like a callback?');
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await page.getByRole('button', { name: 'Start Campaign', exact: true }).click();
    const launch = page.getByRole('dialog', { name: 'Start Campaign', exact: true });
    await launch.getByLabel('Calling window start').fill('00:00');
    await launch.getByLabel('Calling window end').fill('23:59');
    await launch.getByLabel('Timezone (IANA)').fill('UTC');
    for (const day of ['Sun', 'Sat']) await launch.getByText(day, { exact: true }).click();
    await launch.getByRole('button', { name: 'Start Now', exact: true }).click();
    await page.getByRole('region', { name: 'Campaign details', exact: true }).waitFor();
    let campaign = await Campaign.findOne({ agentId: saved._id }).lean();
    expect(campaign.status).toBe('running'); expect(campaign.agentSnapshot.name).toBe('Persisted QA Agent');
    expect(addJob).toHaveBeenCalled();
    await calling.tickCampaign(campaign._id, campaign.tickToken);
    expect(dial).toHaveBeenCalledTimes(1);
    const call = await Calls.findOne({ campaignId: campaign._id }).lean();
    const callContext = await calling.getCallContext(call.internalCallId);
    expect(callContext.agentConfig.voice).toBe('coral'); expect(callContext.systemPrompt).toContain('Would you like a callback?');
    await calling.agentAnswered(call.internalCallId); await calling.agentDisclose(call.internalCallId);
    await calling.agentRecordAnswer(call.internalCallId, { fieldKey: campaign.questionnaire.questions[0].fieldKey, rawAnswer: 'yes' });
    await calling.agentEndCall(call.internalCallId, { durationSeconds: 15 });
    expect((await Calls.findById(call._id)).answers[0].normalizedValue).toBe(true);
    await page.getByRole('region', { name: 'Campaign details', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
    const startAgain = page.getByRole('button', { name: 'Start Campaign', exact: true });
    await startAgain.waitFor();
    await startAgain.click();
    const scheduled = page.getByRole('dialog', { name: 'Start Campaign', exact: true });
    await scheduled.getByRole('radio', { name: /Schedule Campaign/ }).check();
    await scheduled.getByLabel(/Launch date and time/).fill('2030-11-04T09:15');
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/launch') && response.status() === 202),
      scheduled.getByRole('button', { name: 'Schedule Campaign', exact: true }).click(),
    ]);
    expect(await Campaign.countDocuments({ agentId: saved._id })).toBe(2);
    campaign = await Campaign.findOne({ agentId: saved._id, status: 'scheduled' }).lean();
    expect(campaign.scheduledAt).toBeInstanceOf(Date); expect(campaign.scheduledAt.getTime()).toBeGreaterThan(Date.now());
    expect(dial).toHaveBeenCalledTimes(1);
    await page.screenshot({ path: '/tmp/updata-agent-full-stack.png', fullPage: true });
    await context.close();
  }, 150000);
});
