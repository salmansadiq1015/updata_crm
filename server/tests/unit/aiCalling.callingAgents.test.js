import express from 'express';
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { serve } from '../helpers/serve.js';

process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';
const actor = new mongoose.Types.ObjectId();
const outsider = new mongoose.Types.ObjectId();
const addJob = jest.fn(async () => ({}));
const dial = jest.fn(async () => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: crypto.randomUUID() }));
const health = jest.fn(async () => ({ configured: true, eligible: true }));
const queueStats = jest.fn(async () => ({ workers: 1 }));
const audit = jest.fn();
let Files;
let uploadedBytes;
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob, getQueueStats: queueStats } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: audit } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn(async () => ({})) } }));
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => { req.user = { _id: req.get('x-owner') || actor }; next(); },
  requirePermission: permission => (req, res, next) => permission === 'ai-calling:write' && req.get('x-read-only') ? res.status(403).json({ forbidden: true }) : next(),
}));
jest.unstable_mockModule('../../src/shared/middleware/rateLimiter.js', () => ({ uploadLimiter: (_req, _res, next) => next() }));
jest.unstable_mockModule('../../src/shared/storage/StorageService.js', () => ({ default: { getPresignedUrl: async key => `https://storage.test/${key}` } }));
jest.unstable_mockModule('../../src/modules/files/file.service.js', () => ({ default: {
  upload: async input => { uploadedBytes = input.buffer; return Files.create({ ...input, key: `avatars/${crypto.randomUUID()}`, originalName: input.originalName }); },
} }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class { constructor() { this.configured = false; } eligibleFor() { return false; } async health() { return { configured: false, eligible: false }; } },
  default: { configured: true, health, createOutboundCall: (...args) => dial(...args), roomStatus: async () => 'unknown', endCall: async () => ({ ended: true }) },
}));

let db; let service; let calling; let Agent; let Campaign; let Recipients; let Calls; let Lead; let app; let migration;
const questions = [{ fieldKey: 'interest', label: 'Interest', text: 'Are you interested?', type: 'boolean', required: true, order: 1 }];
const fullInput = () => ({
  name: 'Sarah Sales', title: 'Qualification Agent', description: 'Qualifies interest', availability: 'active',
  agentConfig: { organizationName: 'Updata', disclosure: 'I am an AI assistant for {company}.', objective: 'Qualify interest', voice: 'coral', language: 'en' },
  questionnaire: { questions }, statusRules: [{ id: 'qualified', when: { all: [{ field: 'interest', equals: true }] }, action: 'mark_qualified' }],
  schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxConcurrency: 2 },
});
async function lead(extra = {}) {
  return Lead.create({ leadNumber: `A-${crypto.randomUUID()}`, name: 'Real CRM fixture', source: 'manual', mobile: '+41791234567', address: { country: 'CH' }, createdBy: actor, ...extra });
}
async function ready(extra = {}) {
  let agent = await service.create({ ...fullInput(), ...extra }, actor);
  const selected = await lead();
  agent = await service.assign(agent._id, { leadIds: [String(selected._id)], version: agent.version }, actor);
  return { agent, selected };
}
const launchInput = extra => ({ idempotencyKey: crypto.randomUUID(), mode: 'now', continueAcrossDays: true, ...extra });

beforeAll(async () => {
  db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri());
  service = (await import('../../src/modules/aiCalling/callingAgent.service.js')).default;
  calling = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  Agent = (await import('../../src/modules/aiCalling/callingAgent.model.js')).default;
  Campaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  Recipients = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  Calls = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  Files = (await import('../../src/modules/files/file.model.js')).default;
  migration = await import('../../src/migrations/031_calling_agents.js');
  await migration.up();
  app = express(); app.use(express.json());
  app.use((await import('../../src/shared/middleware/responseEnvelope.js')).default);
  app.use('/ai-calling', (await import('../../src/modules/aiCalling/aiCalling.routes.js')).default);
  app.use((await import('../../src/shared/middleware/errorHandler.js')).default);
});
afterAll(async () => { await mongoose.disconnect(); if (db) await db.stop(); });
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  addJob.mockClear(); dial.mockClear(); health.mockResolvedValue({ configured: true, eligible: true }); queueStats.mockResolvedValue({ workers: 1 });
  process.env.AI_CALLING_REQUIRE_CONSENT = 'false'; process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
});

describe('persistent calling agents and API boundaries', () => {
  it('saves creation-time lead selections atomically and rejects unavailable leads before creating an agent', async () => {
    const selected = await lead();
    const response = await request(serve(app)).post('/ai-calling/agents').send({ name: 'Created with leads', assignedLeadIds: [String(selected._id), String(selected._id)] });
    expect(response.status).toBe(201);
    expect(response.body.data.assignedLeadIds).toEqual([String(selected._id)]);
    expect((await service.get(response.body.data._id, actor)).assignedLeadIds.map(String)).toEqual([String(selected._id)]);
    const unavailable = await request(serve(app)).post('/ai-calling/agents').send({ name: 'Unavailable', assignedLeadIds: [String(new mongoose.Types.ObjectId())] });
    expect(unavailable.status).toBe(400); expect(await Agent.countDocuments()).toBe(1);
    const patch = await request(serve(app)).patch(`/ai-calling/agents/${response.body.data._id}`).send({ version: 1, assignedLeadIds: [] });
    expect(patch.status).toBe(400);
    expect(await Campaign.countDocuments()).toBe(0); expect(dial).not.toHaveBeenCalled();
  });

  it('adds leads without replacing existing assignments, deduplicates, and refuses stale or unauthorized changes', async () => {
    const original = await lead(); const second = await lead({ name: 'Second' });
    const agent = await service.create({ name: 'Assignment target', assignedLeadIds: [String(original._id)] }, actor);
    const add = () => request(serve(app)).put(`/ai-calling/agents/${agent._id}/leads`).send({ leadIds: [String(second._id), String(second._id)], version: agent.version, mode: 'add' });
    const [a, b] = await Promise.all([add(), add()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const saved = await service.get(agent._id, actor);
    expect(saved.assignedLeadIds.map(String)).toEqual([String(original._id), String(second._id)]);
    const repeated = await service.assign(agent._id, { leadIds: [String(second._id)], version: saved.version, mode: 'add' }, actor);
    expect(repeated.assignedLeadIds).toHaveLength(2);
    const denied = await request(serve(app)).put(`/ai-calling/agents/${agent._id}/leads`).set('x-read-only', 'yes').send({ leadIds: [String(second._id)], version: repeated.version, mode: 'add' });
    expect(denied.status).toBe(403);
    await expect(service.assign(agent._id, { leadIds: [String(second._id)], version: repeated.version, mode: 'add' }, outsider)).rejects.toThrow(/not found/);
    expect(await Campaign.countDocuments()).toBe(0); expect(dial).not.toHaveBeenCalled();
  });

  it('rejects unavailable additions, archived agents and combined assignments over 500 without partial changes', async () => {
    const selected = await lead();
    let agent = await service.create({ name: 'Limits' }, actor);
    await expect(service.assign(agent._id, { leadIds: [String(new mongoose.Types.ObjectId())], version: agent.version, mode: 'add' }, actor)).rejects.toThrow(/unavailable/);
    await Agent.updateOne({ _id: agent._id }, { $set: { assignedLeadIds: Array.from({ length: 500 }, () => new mongoose.Types.ObjectId()) } });
    await expect(service.assign(agent._id, { leadIds: [String(selected._id)], version: agent.version, mode: 'add' }, actor)).rejects.toThrow(/500/);
    expect((await Agent.findById(agent._id)).assignedLeadIds).toHaveLength(500);
    await Agent.updateOne({ _id: agent._id }, { $set: { assignedLeadIds: [], availability: 'archived' } });
    await expect(service.assign(agent._id, { leadIds: [String(selected._id)], version: agent.version, mode: 'add' }, actor)).rejects.toThrow(/Restore/);
    expect((await Agent.findById(agent._id)).assignedLeadIds).toHaveLength(0);
  });

  it('loads built-in avatars without uploads and durably saves validated preset identities', async () => {
    const presets = await request(serve(app)).get('/ai-calling/agent-avatar-presets');
    expect(presets.status).toBe(200); expect(presets.body.data).toHaveLength(16);
    expect(presets.body.data.map(image => image.presetId)).toEqual(expect.arrayContaining(['maya', 'zara', 'elena', 'theo', 'owen', 'ravi', 'aster', 'echo', 'vega', 'sol']));
    expect(await Files.countDocuments()).toBe(0);
    const created = await request(serve(app)).post('/ai-calling/agents').send({ name: 'Premium', avatarPresetId: 'zara' });
    expect(created.status).toBe(201);
    let saved = await service.get(created.body.data._id, actor);
    expect(saved.avatarUrl).toBe('/avatars/agents/zara-v1.webp');
    const copy = await service.duplicate(saved._id, actor);
    expect(copy.avatarPresetId).toBe('zara'); expect(copy.avatarUrl).toBe(saved.avatarUrl);
    const bad = await request(serve(app)).post('/ai-calling/agents').send({ name: 'Invalid', avatarPresetId: '../../file' });
    expect(bad.status).toBe(400);
    await expect(service.create({ name: 'Invalid', avatarPresetId: 'unknown' }, actor)).rejects.toThrow(/premium avatar/);
    await expect(service.update(saved._id, { version: saved.version, avatarFileId: String(new mongoose.Types.ObjectId()) }, actor)).rejects.toThrow();
    saved = await service.update(saved._id, { version: saved.version, avatarPresetId: null }, actor);
    expect(saved.avatarUrl).toBeNull();
  });

  it('creates the two support profiles with exactly six questions each without launching a campaign', async () => {
    const profiles = JSON.parse(await readFile(new URL('../../scripts/data/support-agent-profiles.json', import.meta.url), 'utf8'));
    for (const profile of profiles) {
      const created = await request(serve(app)).post('/ai-calling/agents').send(profile);
      expect(created.status).toBe(201);
      const saved = await service.get(created.body.data._id, actor);
      expect(saved.readiness.ready).toBe(true); expect(saved.availability).toBe('active');
      expect(saved.questionnaire.questions).toHaveLength(6); expect(saved.assignedLeadIds).toHaveLength(0);
      expect(saved.avatarUrl).toMatch(/^\/avatars\/agents\//);
      expect(new Set(saved.questionnaire.questions.map(q => q.fieldKey)).size).toBe(6);
    }
    expect(await Agent.countDocuments()).toBe(2); expect(await Campaign.countDocuments()).toBe(0);
    expect(dial).not.toHaveBeenCalled();
  });

  it('creates, reloads, updates, duplicates and deletes drafts independently of leads or campaigns', async () => {
    const response = await request(serve(app)).post('/ai-calling/agents').send({ name: 'Draft agent', questionnaire: { questions: [{ ...questions[0], label: '', text: '' }] } });
    expect(response.status).toBe(201);
    const saved = response.body.data;
    expect(saved.availability).toBe('draft'); expect(saved.readiness.ready).toBe(false);
    expect(saved.questionnaire.questions[0].text).toBe('');
    const updated = await service.update(saved._id, { name: 'Renamed', version: saved.version }, actor);
    expect((await service.get(saved._id, actor)).agentConfig.agentName).toBe('Renamed');
    await expect(service.update(saved._id, { name: 'Stale', version: saved.version }, actor)).rejects.toThrow(/changed/);
    const copy = await service.duplicate(updated._id, actor);
    expect(copy.name).toBe('Renamed (copy)'); expect(copy.assignedLeadIds).toEqual([]);
    await service.remove(saved._id, actor); expect(await Agent.countDocuments()).toBe(1);
    expect(await Campaign.countDocuments()).toBe(0);
  });

  it('rejects invalid identity, invalid timezone, empty days and incomplete activation over HTTP', async () => {
    for (const data of [{ name: '' }, { name: 'A', schedule: { timezone: 'Not/AZone' } }, { name: 'A', schedule: { daysOfWeek: [] } }, { name: 'A', availability: 'active' }]) {
      expect((await request(serve(app)).post('/ai-calling/agents').send(data)).status).toBe(400);
    }
    expect(await Agent.countDocuments()).toBe(0);
  });

  it('does not advertise call recording when the calling engine has no capture integration', async () => {
    const input = fullInput(); input.agentConfig.recordCall = true;
    await expect(service.create(input, actor)).rejects.toThrow(/recording is unavailable/);
    const draft = await service.create({ ...input, availability: 'draft' }, actor);
    expect(draft.readiness.ready).toBe(false);
    expect(draft.readiness.missing.join(' ')).toMatch(/recording is unavailable/);
  });

  it('enforces owner boundaries on agent reads, writes, assignments, launch and images; read-only cannot mutate', async () => {
    const { agent, selected } = await ready();
    for (const method of ['get', 'delete']) expect((await request(serve(app))[method](`/ai-calling/agents/${agent._id}`).set('x-owner', String(outsider))).status).toBe(404);
    expect((await request(serve(app)).put(`/ai-calling/agents/${agent._id}/leads`).set('x-owner', String(outsider)).send({ version: agent.version, leadIds: [String(selected._id)] })).status).toBe(404);
    expect((await request(serve(app)).post(`/ai-calling/agents/${agent._id}/launch`).set('x-owner', String(outsider)).send(launchInput())).status).toBe(404);
    expect((await request(serve(app)).post('/ai-calling/agents').set('x-read-only', 'yes').send({ name: 'Denied' })).status).toBe(403);
    const listing = await service.list(outsider); expect(listing.data).toEqual([]);
  });

  it('persists assignments, deduplicates selections, flags ineligible leads and preserves prior history on removal', async () => {
    const { agent, selected } = await ready(); const noPhone = await lead({ mobile: null, phone: null });
    const assigned = await service.assign(agent._id, { version: agent.version, leadIds: [selected._id, selected._id, noPhone._id] }, actor);
    expect(assigned.assignedLeadIds).toHaveLength(2); expect(assigned.eligibility.eligible).toBe(1);
    expect(assigned.eligibility.reasonCounts.missing_phone).toBe(1);
    const campaign = await service.launch(agent._id, launchInput(), actor);
    await service.assign(agent._id, { version: assigned.version, leadIds: [] }, actor);
    expect(await Recipients.countDocuments({ campaignId: campaign._id })).toBe(2);
    expect(await Lead.countDocuments()).toBe(2);
    await expect(service.assign(agent._id, { version: assigned.version + 1, leadIds: [new mongoose.Types.ObjectId()] }, actor)).rejects.toThrow(/unavailable/);
  });

  it('uploads decoded images to the existing storage boundary, reloads gallery, changes avatars and enforces private selection', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#3366ff' } }).png().toBuffer();
    const response = await request(serve(app)).post('/ai-calling/agent-images').attach('image', png, { filename: 'avatar.png', contentType: 'image/png' });
    expect(response.status).toBe(201); const image = response.body.data;
    expect((await sharp(uploadedBytes).metadata()).format).toBe('webp');
    expect((await service.listImages(actor)).data[0]._id).toBe(image._id);
    expect((await service.listImages(outsider)).data).toEqual([]);
    await expect(service.create({ name: 'Other', avatarFileId: image._id }, outsider)).rejects.toThrow(/gallery/);
    let agent = await service.create({ name: 'Avatar agent', avatarFileId: image._id }, actor);
    expect(agent.avatarUrl).toMatch(/^https:\/\/storage.test/);
    agent = await service.update(agent._id, { version: agent.version, avatarFileId: null }, actor);
    expect(agent.avatarUrl).toBeNull();
    await service.removeImage(image._id, actor); expect((await service.listImages(actor)).data).toEqual([]);
    expect(await Files.exists({ _id: image._id })).toBeTruthy(); // references remain valid for historical records
  });

  it('rejects unsupported, oversized and disguised image uploads', async () => {
    expect((await request(serve(app)).post('/ai-calling/agent-images').attach('image', Buffer.from('<svg/>'), { filename: 'fake.png', contentType: 'image/png' })).status).toBe(400);
    await expect(service.uploadImage({ mimetype: 'image/svg+xml', size: 1 }, actor)).rejects.toThrow(/JPG/);
    await expect(service.uploadImage({ mimetype: 'image/png', size: 6 * 1024 * 1024 }, actor)).rejects.toThrow(/5 MB/);
  });

  it('filters before pagination and exposes only real per-owner metrics', async () => {
    await service.create({ name: 'Zeta draft' }, actor); const { agent } = await ready();
    const first = await service.list(actor, { readiness: 'ready', limit: 1, sort: 'name' });
    expect(first.pagination.total).toBe(1); expect(first.data[0]._id).toEqual(agent._id);
    expect(first.summary.completed).toBe(0);
    expect((await service.list(actor, { search: 'Qualification' })).data).toHaveLength(1);
    expect((await service.list(actor, { search: '.*' })).data).toHaveLength(0); // literal, not a regex injection
  });
});

describe('agent campaign execution through the existing calling engine', () => {
  it('launches the selected owner ESP32 route without requiring SIP or changing agent defaults', async () => {
    const { agent } = await ready();
    const PairedDevice = (await import('../../src/modules/pairedPhone/pairedDevice.model.js')).default;
    const phone = await PairedDevice.create({ name: 'Owner ESP32', createdBy: actor, audioVerifiedAt: new Date() });
    health.mockResolvedValue({ configured: false, eligible: false, reason: 'no_sip_trunk' });
    const input = launchInput({ transport: 'paired_phone', pairedDeviceId: String(phone._id) });
    const response = await request(serve(app)).post(`/ai-calling/agents/${agent._id}/launch`).send(input);
    expect(response.status).toBe(202);
    expect(response.body.data).toMatchObject({ transport: 'paired_phone', pairedDeviceId: String(phone._id) });
    expect((await Agent.findById(agent._id).lean()).transport).toBe('cloud_sip');
    expect((await service.launch(agent._id, input, actor))._id.toString()).toBe(response.body.data._id);
    expect(await Campaign.countDocuments()).toBe(1);
    expect(dial).not.toHaveBeenCalled();
  });

  it('rejects another owner or revoked ESP32 before allocating a launch', async () => {
    const { agent } = await ready();
    const PairedDevice = (await import('../../src/modules/pairedPhone/pairedDevice.model.js')).default;
    const phone = await PairedDevice.create({ name: 'Other phone', createdBy: outsider, audioVerifiedAt: new Date() });
    const input = launchInput({ transport: 'paired_phone', pairedDeviceId: String(phone._id) });
    await expect(service.launch(agent._id, input, actor)).rejects.toThrow(/available paired phone/);
    await PairedDevice.updateOne({ _id: phone._id }, { $set: { createdBy: actor, revokedAt: new Date() } });
    await expect(service.launch(agent._id, input, actor)).rejects.toThrow(/available paired phone/);
    expect(await Campaign.countDocuments()).toBe(0); expect(dial).not.toHaveBeenCalled();
  });

  it('launches once, snapshots configuration, queues real engine work and keeps history immutable after agent edits', async () => {
    const { agent } = await ready(); const input = launchInput();
    const campaign = await service.launch(agent._id, input, actor);
    expect(campaign.agentId).toEqual(agent._id); expect(campaign.agentConfig.voice).toBe('coral');
    expect(addJob).toHaveBeenCalled(); expect(await Recipients.countDocuments()).toBe(1);
    expect((await service.launch(agent._id, input, actor))._id).toEqual(campaign._id);
    expect(await Campaign.countDocuments()).toBe(1);
    const tick = await calling.tickCampaign(campaign._id, campaign.tickToken);
    expect(tick.dispatched).toBe(1); expect(dial).toHaveBeenCalledTimes(1);
    await calling.tickCampaign(campaign._id, campaign.tickToken); expect(dial).toHaveBeenCalledTimes(1);
    const record = await Calls.findOne({ campaignId: campaign._id });
    const context = await calling.getCallContext(record.internalCallId);
    expect(context.agentConfig.voice).toBe('coral'); expect(context.systemPrompt).toContain('Are you interested?');
    await service.update(agent._id, { version: agent.version, name: 'New name', questionnaire: { questions: [{ ...questions[0], text: 'Changed later' }] } }, actor);
    const original = await calling.getCampaign(campaign._id, actor);
    expect(original.agentSnapshot.name).toBe('Sarah Sales'); expect(original.questionnaire.questions[0].text).toBe('Are you interested?');
    await expect(calling.updateCampaign(campaign._id, { agentConfig: { voice: 'echo' } }, actor)).rejects.toThrow(/immutable/);
    await expect(service.remove(agent._id, actor)).rejects.toThrow(/history/);
  });

  it('concurrent launch requests cannot produce duplicate campaigns or recipients', async () => {
    const { agent } = await ready(); const input = launchInput();
    const results = await Promise.allSettled([service.launch(agent._id, input, actor), service.launch(agent._id, input, actor)]);
    expect(results.some(r => r.status === 'fulfilled')).toBe(true);
    expect(await Campaign.countDocuments()).toBe(1); expect(await Recipients.countDocuments()).toBe(1);
    expect((await service.launch(agent._id, input, actor)).agentId).toEqual(agent._id);
    await expect(service.launch(agent._id, launchInput(), actor)).rejects.toThrow(/active campaign/);
  });

  it('keeps original lead selection after queue removals and completes an emptied agent run', async () => {
    const { agent, selected } = await ready();
    const campaign = await service.launch(agent._id, launchInput(), actor);
    const recipient = await Recipients.findOne({ campaignId: campaign._id });
    await calling.removeRecipients(campaign._id, actor, { recipientIds: [recipient._id] });
    const saved = await calling.getCampaign(campaign._id, actor);
    expect(saved.selection.leadIds.map(String)).toEqual([String(selected._id)]);
    expect(saved.status).toBe('completed');
    expect(dial).not.toHaveBeenCalled();
  });

  it('does not allocate a campaign if provider, worker, configuration or eligibility is unavailable', async () => {
    const { agent } = await ready();
    health.mockResolvedValue({ configured: false, eligible: false, reason: 'missing_sip' });
    await expect(service.launch(agent._id, launchInput(), actor)).rejects.toThrow(/Cloud calling/);
    health.mockResolvedValue({ configured: true, eligible: true }); queueStats.mockResolvedValue({ workers: 0 });
    await expect(service.launch(agent._id, launchInput(), actor)).rejects.toThrow(/offline/);
    queueStats.mockResolvedValue({ workers: 1 });
    await service.assign(agent._id, { version: agent.version, leadIds: [] }, actor);
    await expect(service.launch(agent._id, launchInput(), actor)).rejects.toThrow(/No eligible/);
    expect(await Campaign.countDocuments()).toBe(0);
  });

  it('an enqueue failure can be retried with the same key without creating another campaign', async () => {
    const { agent } = await ready(); const input = launchInput();
    addJob.mockRejectedValueOnce(new Error('Redis acknowledgement lost'));
    await expect(service.launch(agent._id, input, actor)).rejects.toThrow(/queue/);
    expect(await Campaign.countDocuments()).toBe(1);
    const campaign = await service.launch(agent._id, input, actor);
    expect(campaign.status).toBe('running'); expect(await Campaign.countDocuments()).toBe(1);
  });

  it('recovers a crash before recipient initialization and refuses reusing a launch key with different settings', async () => {
    const { agent } = await ready(); const input = launchInput();
    const insert = jest.spyOn(Recipients, 'insertMany').mockRejectedValueOnce(new Error('Simulated process interruption'));
    await expect(service.launch(agent._id, input, actor)).rejects.toThrow(/interruption/);
    insert.mockRestore();
    expect((await Campaign.findOne()).initializationPending).toBe(true);
    const campaign = await service.launch(agent._id, input, actor);
    expect(campaign.initializationPending).toBe(false);
    expect(await Campaign.countDocuments()).toBe(1); expect(await Recipients.countDocuments()).toBe(1);
    await expect(service.launch(agent._id, { ...input, name: 'A different run' }, actor)).rejects.toThrow(/different settings/);
  });

  it('keeps snapshotted concurrency on resume and preserves a paused future launch time', async () => {
    const { agent } = await ready(); const future = new Date(Date.now() + 3600000);
    const campaign = await service.launch(agent._id, launchInput({ mode: 'scheduled', scheduledAt: future }), actor);
    await calling.pauseCampaign(campaign._id, actor);
    const resumed = await calling.startCampaign(campaign._id, actor, { sequential: true });
    expect(resumed.status).toBe('scheduled'); expect(resumed.scheduledAt).toEqual(future);
    expect(resumed.schedule.maxConcurrency).toBe(2);
    expect(dial).not.toHaveBeenCalled();
  });

  it('Start Now launches and dials immediately despite closed saved and recipient hours', async () => {
    const { agent } = await ready({ schedule: { ...fullInput().schedule, callWindow: { start: '00:00', end: '00:00' } } });
    process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-00:00';
    const campaign = await service.launch(agent._id, launchInput({ continueAcrossDays: false }), actor);
    expect(campaign.executionEndsAt).toBeNull();
    expect((await calling.campaignRunStatus(campaign._id, actor)).waits).toEqual([]);
    expect(await calling.tickCampaign(campaign._id, campaign.tickToken)).toMatchObject({ dispatched: 1 });
    expect(dial).toHaveBeenCalledTimes(1); expect((await Recipients.findOne()).attemptCount).toBe(1);
  });

  it('persists future launches, runs automatically when due, and recovers a lost delayed tick', async () => {
    const { agent } = await ready(); const future = new Date(Date.now() + 3600000);
    const campaign = await service.launch(agent._id, launchInput({ mode: 'scheduled', scheduledAt: future }), actor);
    expect(campaign.status).toBe('scheduled'); expect(campaign.startedAt).toBeNull();
    expect(await calling.tickCampaign(campaign._id, campaign.tickToken)).toEqual({ rescheduled: true });
    expect(dial).not.toHaveBeenCalled();
    await Campaign.updateOne({ _id: campaign._id }, { $set: { scheduledAt: new Date(Date.now() - 1000), nextTickAt: null } });
    await calling.reconcileStuckCalls(); // existing watchdog recreates the lost job
    const revived = await Campaign.findById(campaign._id);
    expect(revived.tickToken).not.toEqual(campaign.tickToken);
    await calling.tickCampaign(campaign._id, revived.tickToken);
    expect(dial).toHaveBeenCalledTimes(1);
  });

  it('stops new calls at the execution end, leaves active calls intact, and supports pause/resume/cancel safely', async () => {
    const { agent } = await ready(); const campaign = await service.launch(agent._id, launchInput(), actor);
    await calling.pauseCampaign(campaign._id, actor);
    expect(await calling.tickCampaign(campaign._id, campaign.tickToken)).toMatchObject({ stopped: true });
    const resumed = await calling.startCampaign(campaign._id, actor);
    await Campaign.updateOne({ _id: campaign._id }, { $set: { executionEndsAt: new Date(Date.now() - 1000) } });
    expect(await calling.tickCampaign(campaign._id, resumed.tickToken)).toMatchObject({ executionEnded: true });
    expect(dial).not.toHaveBeenCalled(); expect((await Recipients.findOne()).state).toBe('cancelled');
    const another = await service.launch(agent._id, launchInput(), actor);
    await calling.cancelCampaign(another._id, actor);
    expect(await calling.tickCampaign(another._id, another.tickToken)).toMatchObject({ superseded: true });
  });

  it('migration is repeatable and rollback preserves agent and campaign records', async () => {
    const { agent } = await ready(); await service.launch(agent._id, launchInput(), actor);
    await migration.up(); await migration.up(); await migration.down();
    expect(await Agent.countDocuments()).toBe(1); expect(await Campaign.countDocuments()).toBe(1);
    await migration.up();
  });
});
