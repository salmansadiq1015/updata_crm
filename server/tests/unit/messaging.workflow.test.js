import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

const addJob = jest.fn();
const addJobs = jest.fn(async (_queue, jobs) => jobs);
const logEvent = jest.fn();

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: {
    addJob, addJobs,
    getQueueStats: jest.fn(async () => ({ name: 'outbound-messaging', waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 })),
  },
}));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent } }));

let mongod;
let service;
let refreshCampaignSummary;
let buildCampaignMonitoring;
let Campaign;
let MessageRecipient;
let ProviderAttempt;
let DeliveryEvent;
let MessageTemplate;
let Lead;
let Consent;
let Suppression;
let ProviderSettings;
let FrequencyLedger;
let createUnsubscribeToken;
let destinationHash;
let messagingSchemas;
let existingEmail;
let textBee;
let twilio;
let metaWhatsapp;
let IntegrationHealthCheck;
let eventBus;

const actor = new mongoose.Types.ObjectId();
const leadId = new mongoose.Types.ObjectId();

async function campaign(overrides = {}) {
  return Campaign.create({
    name: 'Operations test', channel: 'sms', purpose: 'support', status: 'running',
    selection: { mode: 'explicit', leadIds: [leadId], selectedAt: new Date() },
    createdBy: actor, updatedBy: actor, ...overrides,
  });
}

async function recipient(campaignId, overrides = {}) {
  return MessageRecipient.create({
    campaignId, leadId, channel: 'sms', destination: '+41791234567',
    destinationHash: `hash-${new mongoose.Types.ObjectId()}`, status: 'queued',
    eligibility: { eligible: true, reasons: [] }, rendered: { bodyText: 'Hello' },
    createdBy: actor, ...overrides,
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ default: service, refreshCampaignSummary, buildCampaignMonitoring } = await import('../../src/modules/messaging/messaging.service.js'));
  Campaign = (await import('../../src/modules/messaging/campaign.model.js')).default;
  MessageRecipient = (await import('../../src/modules/messaging/messageRecipient.model.js')).default;
  ProviderAttempt = (await import('../../src/modules/messaging/providerAttempt.model.js')).default;
  DeliveryEvent = (await import('../../src/modules/messaging/deliveryEvent.model.js')).default;
  MessageTemplate = (await import('../../src/modules/messaging/messageTemplate.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  Consent = (await import('../../src/modules/messaging/consent.model.js')).default;
  Suppression = (await import('../../src/modules/messaging/suppression.model.js')).default;
  ProviderSettings = (await import('../../src/modules/messaging/providerSettings.model.js')).default;
  FrequencyLedger = (await import('../../src/modules/messaging/frequencyLedger.model.js')).default;
  ({ createUnsubscribeToken } = await import('../../src/modules/messaging/unsubscribeToken.js'));
  ({ destinationHash } = await import('../../src/modules/messaging/destinationHash.js'));
  messagingSchemas = await import('../../src/modules/messaging/messaging.validation.js');
  existingEmail = (await import('../../src/modules/messaging/providers/existingEmail.provider.js')).default;
  textBee = (await import('../../src/modules/messaging/providers/textbee.provider.js')).default;
  twilio = (await import('../../src/modules/messaging/providers/twilio.provider.js')).default;
  metaWhatsapp = (await import('../../src/modules/messaging/providers/metaWhatsApp.provider.js')).default;
  IntegrationHealthCheck = (await import('../../src/modules/integrations/integrationHealthCheck.model.js')).default;
  eventBus = (await import('../../src/shared/events/EventBus.js')).default;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  jest.restoreAllMocks();
  addJob.mockReset();
  addJobs.mockClear();
  logEvent.mockReset();
  await Promise.all([
    Campaign.deleteMany({}), MessageRecipient.deleteMany({}),
    ProviderAttempt.deleteMany({}), DeliveryEvent.deleteMany({}),
    Lead.deleteMany({}), Consent.deleteMany({}), Suppression.deleteMany({}), MessageTemplate.deleteMany({}),
    ProviderSettings.deleteMany({}),
    FrequencyLedger.deleteMany({}),
    IntegrationHealthCheck.deleteMany({ integrationKey: /^messaging_/ }),
  ]);
});

describe('messaging campaign operations', () => {
  it('reserves WhatsApp approval metadata for the Meta synchronization path', async () => {
    await expect(service.createTemplate({
      name: 'Manual approved claim', channel: 'whatsapp', purpose: 'promotional',
      bodyText: 'Hello {{firstName}}', whatsapp: {
        metaName: 'manual_claim', language: 'en', approvalStatus: 'approved',
      },
    }, actor)).rejects.toThrow(/synchronizing with Meta/i);

    const draft = await service.createTemplate({
      name: 'Editable WhatsApp draft', channel: 'whatsapp', purpose: 'promotional',
      bodyText: 'Hello {{firstName}}', whatsapp: {},
    }, actor);
    expect(draft.whatsapp.approvalStatus).toBeNull();
  });

  it('keeps Meta-synchronized template structure read-only', async () => {
    const template = await MessageTemplate.create({
      name: 'approved_intro', channel: 'whatsapp', purpose: 'promotional',
      bodyText: 'Approved {{1}}',
      whatsapp: {
        metaName: 'approved_intro', language: 'en', approvalStatus: 'approved',
        providerDefinition: [{ type: 'BODY', text: 'Approved {{1}}' }],
      },
      createdBy: actor, updatedBy: actor,
    });

    await expect(service.updateTemplate(template._id, { bodyText: 'Altered text' }, actor)).rejects.toThrow(/read-only/i);
    const updated = await service.updateTemplate(template._id, { description: 'Local internal description' }, actor);
    expect(updated.description).toBe('Local internal description');
    expect(updated.bodyText).toBe('Approved {{1}}');
  });

  it('enforces shared-template ownership and audits every owner lifecycle operation', async () => {
    const owner = new mongoose.Types.ObjectId();
    const shared = await service.createTemplate({
      name: 'Shared introduction', channel: 'email', purpose: 'promotional',
      subject: 'Hello {{firstName}}', bodyText: 'Welcome', isShared: true,
    }, owner, { ipAddress: '127.0.0.1', userAgent: 'test' });

    const visible = await service.listTemplates(actor);
    expect(visible.map((template) => String(template._id))).toContain(String(shared._id));
    await expect(service.updateTemplate(shared._id, { description: 'Not mine' }, actor)).rejects.toThrow(/not found/i);
    await expect(service.archiveTemplate(shared._id, actor)).rejects.toThrow(/not found/i);

    const copy = await service.duplicateTemplate(shared._id, actor, { ipAddress: '127.0.0.1' });
    expect(copy).toMatchObject({ name: 'Shared introduction (copy)', isShared: false });
    expect(String(copy.createdBy)).toBe(String(actor));

    await service.updateTemplate(copy._id, { description: 'Owned copy' }, actor);
    await service.archiveTemplate(copy._id, actor);
    expect(logEvent.mock.calls.map(([entry]) => entry.eventType)).toEqual(expect.arrayContaining([
      'messaging.template.created', 'messaging.template.duplicated',
      'messaging.template.updated', 'messaging.template.archived',
    ]));
  });

  it('applies structured campaign company, sender, and lead fallback fields during personalization', async () => {
    const lead = await Lead.create({
      leadNumber: 'L-99010', name: 'Example Business', type: 'business',
      email: 'hello@example.test', createdBy: actor,
    });
    const template = await MessageTemplate.create({
      name: 'Structured email', channel: 'email', purpose: 'support', isShared: true,
      subject: '{{companyName}} for {{businessName}}',
      bodyText: 'Hello {{firstName}}, from {{senderName}} at {{companyName}}.',
      bodyHtml: '<p>Hello {{firstName}}, from {{senderName}} at {{companyName}}.</p>',
      requiredVariables: ['companyName', 'businessName', 'firstName', 'senderName'],
      createdBy: actor, updatedBy: actor,
    });

    const created = await service.createCampaign({
      name: 'Structured personalization', channel: 'email', purpose: 'support', templateId: template._id,
      content: {
        subject: template.subject, bodyText: template.bodyText, bodyHtml: template.bodyHtml,
        fallbackValues: { companyName: 'Behjja', senderName: 'Salman Sadiq', firstName: 'there' },
      },
      selection: { mode: 'explicit', leadIds: [lead._id] },
    }, actor);
    const rendered = await MessageRecipient.findOne({ campaignId: created._id }).lean();

    expect(rendered.rendered).toMatchObject({
      subject: 'Behjja for Example Business',
      bodyText: 'Hello Example, from Salman Sadiq at Behjja.',
      bodyHtml: '<p>Hello Example, from Salman Sadiq at Behjja.</p>',
    });
    expect(rendered.eligibility).toMatchObject({ eligible: true, reasons: [] });
  });

  it('does not infer completion for an ineligible draft', async () => {
    const item = await campaign({ status: 'draft' });
    await recipient(item._id, {
      status: 'ineligible',
      eligibility: { eligible: false, reasons: ['missing_phone'] },
    });

    await refreshCampaignSummary(item._id);

    await expect(Campaign.findById(item._id).lean()).resolves.toMatchObject({
      status: 'draft', summary: { total: 1, eligible: 0, ineligible: 1 },
    });
  });

  it('paginates and safely searches actor-scoped campaigns on the server', async () => {
    await campaign({ name: 'October nurture', description: 'Enterprise email', channel: 'email', status: 'running' });
    await campaign({ name: 'November follow-up', description: 'SMS list', channel: 'sms', status: 'draft' });
    const otherActor = new mongoose.Types.ObjectId();
    await Campaign.create({
      name: 'Other actor campaign', channel: 'email', status: 'running', purpose: 'support',
      selection: { mode: 'explicit', leadIds: [], selectedAt: new Date() },
      createdBy: otherActor, updatedBy: otherActor,
    });

    const result = await service.listCampaigns(actor, { page: 1, limit: 1, q: 'October', channel: 'email', status: 'running' });
    expect(result.pagination).toMatchObject({ page: 1, limit: 1, total: 1, pages: 1 });
    expect(result.data.map((item) => item.name)).toEqual(['October nurture']);
    await expect(service.listCampaigns(actor, { q: '[literal-regex' })).resolves.toMatchObject({ pagination: { total: 0 } });
  });

  it('does not disclose another actor campaign through detail, recipients, or export operations', async () => {
    const otherActor = new mongoose.Types.ObjectId();
    const foreignCampaign = await campaign({ createdBy: otherActor, updatedBy: otherActor });
    await recipient(foreignCampaign._id, { createdBy: otherActor });

    await expect(service.getCampaign(foreignCampaign._id, actor)).rejects.toThrow(/not found/i);
    await expect(service.listRecipients(foreignCampaign._id, actor)).rejects.toThrow(/not found/i);
    await expect(service.exportCampaign(foreignCampaign._id, actor)).rejects.toThrow(/not found/i);
  });

  it('reports durable campaign progress, schedule state, throughput, and large audiences', () => {
    const now = new Date('2026-10-13T10:00:00.000Z');
    const result = buildCampaignMonitoring({
      status: 'running', scheduledAt: new Date('2026-10-13T09:00:00.000Z'), timezone: 'Europe/Zurich',
      startedAt: new Date('2026-10-13T09:50:00.000Z'),
      summary: { total: 1200, eligible: 1000, draft: 100, queued: 200, submitting: 20 },
    }, now);

    expect(result).toMatchObject({
      progress: { eligible: 1000, processed: 680, pending: 320, queued: 200, inFlight: 20, percent: 68 },
      schedule: { state: 'processing', timezone: 'Europe/Zurich' },
      throughput: { processedPerMinute: 68, estimatedSecondsRemaining: 283 },
      largeAudience: true,
    });
  });

  it('keeps cancellation terminal when recipient summaries are refreshed', async () => {
    const item = await campaign({ status: 'running' });
    await recipient(item._id, { status: 'queued' });

    const result = await service.cancelCampaign(item._id, actor);

    expect(result.status).toBe('cancelled');
    expect((await Campaign.findById(item._id)).status).toBe('cancelled');
  });

  it('removes an individual recipient only while the campaign is a draft', async () => {
    const item = await campaign({ status: 'draft' });
    const message = await recipient(item._id, { status: 'draft' });

    const result = await service.removeDraftRecipient(item._id, message._id, actor);

    expect(result).toMatchObject({ status: 'draft', summary: { total: 0, eligible: 0 } });
    expect(await MessageRecipient.countDocuments({ campaignId: item._id })).toBe(0);
    expect(result.selection.leadIds.map(String)).not.toContain(String(leadId));
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'messaging.campaign.recipient_removed' }));

    const running = await campaign({ status: 'running', selection: { mode: 'explicit', leadIds: [new mongoose.Types.ObjectId()], selectedAt: new Date() } });
    const locked = await recipient(running._id, { leadId: new mongoose.Types.ObjectId(), status: 'queued' });
    await expect(service.removeDraftRecipient(running._id, locked._id, actor)).rejects.toThrow(/draft campaign/i);
  });

  it('lets an administrator verify consent for multiple draft recipients and refreshes eligibility', async () => {
    const secondLeadId = new mongoose.Types.ObjectId();
    await Lead.create([
      { _id: leadId, leadNumber: 'L-99101', name: 'Consent One', email: 'one@example.com', createdBy: actor },
      { _id: secondLeadId, leadNumber: 'L-99102', name: 'Consent Two', email: 'two@example.com', createdBy: actor },
    ]);
    const item = await campaign({
      channel: 'email', purpose: 'promotional', status: 'draft',
      content: { subject: 'Hello', bodyText: 'Welcome', bodyHtml: '<p>Welcome</p>' },
      selection: { mode: 'explicit', leadIds: [leadId, secondLeadId], selectedAt: new Date() },
    });
    const first = await recipient(item._id, {
      channel: 'email', destination: 'one@example.com', destinationHash: destinationHash('email', 'one@example.com'),
      status: 'ineligible', eligibility: { eligible: false, reasons: ['consent_required'] },
    });
    const second = await recipient(item._id, {
      leadId: secondLeadId, channel: 'email', destination: 'two@example.com', destinationHash: destinationHash('email', 'two@example.com'),
      status: 'ineligible', eligibility: { eligible: false, reasons: ['consent_required'] },
    });
    await refreshCampaignSummary(item._id);

    const result = await service.verifyCampaignRecipientConsent(item._id, {
      recipientIds: [String(first._id), String(second._id)],
      evidence: 'Both recipients opted in through the signed event form.',
      source: 'signed_form', capturedAt: new Date().toISOString(), expiresAt: null, confirmation: true,
    }, actor, { ipAddress: '127.0.0.1' });

    expect(result).toMatchObject({ verified: 2, campaign: { summary: { total: 2, eligible: 2, ineligible: 0 } } });
    expect(await Consent.countDocuments({
      leadId: { $in: [leadId, secondLeadId] }, channel: 'email', status: 'granted', source: 'signed_form',
    })).toBe(2);
    expect(await MessageRecipient.countDocuments({
      campaignId: item._id, status: 'draft', 'eligibility.eligible': true,
    })).toBe(2);
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'messaging.campaign.consent_bulk_verified',
      details: expect.objectContaining({ recipientCount: 2, evidenceRecorded: true }),
    }));
  });

  it('does not use campaign consent verification to bypass suppression', async () => {
    await Lead.create({ _id: leadId, leadNumber: 'L-99103', name: 'Suppressed Lead', email: 'blocked@example.com', createdBy: actor });
    const item = await campaign({
      channel: 'email', purpose: 'promotional', status: 'draft',
      content: { subject: 'Hello', bodyText: 'Welcome' },
    });
    const hash = destinationHash('email', 'blocked@example.com');
    const message = await recipient(item._id, {
      channel: 'email', destination: 'blocked@example.com', destinationHash: hash,
      status: 'ineligible', eligibility: { eligible: false, reasons: ['consent_required'] },
    });
    await Suppression.create({
      leadId, channel: 'email', destinationHash: hash, reason: 'opt_out', source: 'recipient',
      suppressedAt: new Date(), createdBy: actor,
    });

    await expect(service.verifyCampaignRecipientConsent(item._id, {
      recipientIds: [String(message._id)], evidence: 'Claimed renewed consent', source: 'manual_admin_verification',
      capturedAt: new Date().toISOString(), expiresAt: null, confirmation: true,
    }, actor)).rejects.toThrow(/suppressed/i);
    expect(await Consent.countDocuments({ leadId, channel: 'email' })).toBe(0);
  });

  it('pauses only recipients that have not crossed the provider submission boundary', async () => {
    const item = await campaign();
    const queued = await recipient(item._id);
    const submitting = await recipient(item._id, { leadId: new mongoose.Types.ObjectId(), status: 'submitting' });

    const result = await service.pauseCampaign(item._id, actor);

    expect(result.status).toBe('paused');
    expect((await MessageRecipient.findById(queued._id)).status).toBe('draft');
    expect((await MessageRecipient.findById(submitting._id)).status).toBe('submitting');
  });

  it('safely re-enqueues stale work that never reached a provider', async () => {
    const item = await campaign();
    const boundaryAt = new Date(Date.now() - 20 * 60_000);
    const message = await recipient(item._id, {
      status: 'submitting', provider: null, submissionStartedAt: boundaryAt,
      quotaReservationId: new mongoose.Types.ObjectId(), quotaReservationState: 'pending',
    });
    await service._reserveQuota(message, { quotas: { daily: 5, monthly: 5 } });

    const result = await service.recoverStaleWork({ now: new Date(), staleAfterMs: 10 * 60_000 });

    expect(result).toMatchObject({ inspected: 1, returnedToQueue: 1, unknown: 0, reEnqueued: 1 });
    await expect(MessageRecipient.findById(message._id).lean()).resolves.toMatchObject({
      status: 'queued', submissionStartedAt: null,
      error: { code: 'RECOVERED_BEFORE_SUBMISSION' },
      quotaReservationState: 'released',
    });
    await expect(service._quotaUsage()).resolves.toEqual({ daily: 0, monthly: 0 });
    expect(addJob).toHaveBeenCalledWith(
      'outbound-messaging', expect.stringContaining('recovery-'),
      { recipientId: String(message._id) }, expect.objectContaining({ attempts: 1 }),
    );
  });

  it('atomically prevents parallel workers from exceeding daily or monthly quotas', async () => {
    const item = await campaign();
    const messages = await Promise.all(Array.from({ length: 8 }, async () => recipient(item._id, {
      leadId: new mongoose.Types.ObjectId(), status: 'submitting',
      submissionStartedAt: new Date(), quotaReservationId: new mongoose.Types.ObjectId(),
      quotaReservationState: 'pending',
    })));

    const results = await Promise.all(messages.map((message) => service._reserveQuota(
      message,
      { quotas: { daily: 2, monthly: 2 } },
      new Date(),
    )));

    expect(results.filter(Boolean)).toHaveLength(2);
    await expect(service._quotaUsage()).resolves.toEqual({ daily: 2, monthly: 2 });
    expect(await MessageRecipient.countDocuments({ quotaReservationState: 'reserved' })).toBe(2);
  });

  it('enforces the quota at the real dispatch boundary under parallel workers', async () => {
    const item = await campaign({ channel: 'email', purpose: 'support' });
    await ProviderSettings.create({
      key: 'global', updatedBy: actor,
      providers: { emailEnabled: true }, quotas: { daily: 2, monthly: 2, perCampaign: 100 },
    });
    const messages = await Promise.all(Array.from({ length: 8 }, async (_, index) => recipient(item._id, {
      leadId: new mongoose.Types.ObjectId(), channel: 'email',
      destination: `quota-${index}@example.com`, status: 'queued',
      rendered: { subject: 'Quota test', bodyText: 'Hello', bodyHtml: '<p>Hello</p>' },
    })));
    const send = jest.spyOn(existingEmail, 'send').mockImplementation(async ({ to }) => ({
      provider: 'existing_email', outcome: 'accepted', safeToFallback: false,
      providerMessageId: `email-${to}`, providerStatus: 'queued',
    }));

    const results = await Promise.all(messages.map((message) => service.dispatchRecipient(message._id)));

    expect(results.filter((result) => result.outcome === 'accepted')).toHaveLength(2);
    expect(results.filter((result) => result.reason === 'quota')).toHaveLength(6);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await MessageRecipient.countDocuments({ status: 'accepted' })).toBe(2);
    expect(await MessageRecipient.countDocuments({ status: 'failed', 'error.code': 'QUOTA_EXCEEDED' })).toBe(6);
    await expect(service._quotaUsage()).resolves.toEqual({ daily: 2, monthly: 2 });
  });

  it('atomically enforces recipient frequency limits across parallel campaigns', async () => {
    const item = await campaign({ channel: 'email', purpose: 'support' });
    await ProviderSettings.create({
      key: 'global', updatedBy: actor,
      providers: { emailEnabled: true }, quotas: { daily: 20, monthly: 20, perCampaign: 100 },
      frequencyLimits: {
        enabled: true, purposes: ['support'],
        email: { minIntervalHours: 0, dailyMax: 2, weeklyMax: 10 },
      },
    });
    const sharedHash = destinationHash('email', 'frequency@example.com');
    const messages = await Promise.all(Array.from({ length: 8 }, async () => recipient(item._id, {
      leadId: new mongoose.Types.ObjectId(), channel: 'email', destination: 'frequency@example.com',
      destinationHash: sharedHash, status: 'queued',
      rendered: { subject: 'Frequency test', bodyText: 'Hello', bodyHtml: '<p>Hello</p>' },
    })));
    let providerSequence = 0;
    const send = jest.spyOn(existingEmail, 'send').mockImplementation(async () => ({
      provider: 'existing_email', outcome: 'accepted', safeToFallback: false,
      providerMessageId: `frequency-email-${providerSequence += 1}`, providerStatus: 'queued',
    }));

    const results = await Promise.all(messages.map((message) => service.dispatchRecipient(message._id)));

    expect(results.filter((result) => result.outcome === 'accepted')).toHaveLength(2);
    expect(results.filter((result) => result.reason === 'frequency_daily_limit')).toHaveLength(6);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await MessageRecipient.countDocuments({ status: 'failed', 'error.code': 'COMPLIANCE_FREQUENCY_LIMIT' })).toBe(6);
    await expect(FrequencyLedger.findOne({ destinationHash: sharedHash }).lean()).resolves.toMatchObject({
      events: expect.arrayContaining([expect.objectContaining({ at: expect.any(Date) })]),
    });
    expect((await FrequencyLedger.findOne({ destinationHash: sharedHash }).lean()).events).toHaveLength(2);
  });

  it('marks a recipient ineligible when confirmed history already reaches the frequency cap', async () => {
    const lead = await Lead.create({
      leadNumber: 'L-99200', name: 'Frequency Lead', email: 'frequency-lead@example.com', createdBy: actor,
    });
    const previous = await campaign({ channel: 'email', purpose: 'promotional', status: 'completed' });
    await recipient(previous._id, {
      leadId: lead._id, channel: 'email', destination: lead.email,
      destinationHash: destinationHash('email', lead.email), status: 'accepted', acceptedAt: new Date(),
    });
    await Consent.create({
      leadId: lead._id, channel: 'email', status: 'granted', source: 'form', evidence: 'Explicit opt-in',
      capturedAt: new Date(), changedBy: actor,
    });
    await ProviderSettings.create({
      key: 'global', updatedBy: actor,
      frequencyLimits: {
        enabled: true, purposes: ['promotional'],
        email: { minIntervalHours: 0, dailyMax: 1, weeklyMax: 10 },
      },
    });

    const created = await service.createCampaign({
      name: 'Frequency eligibility', channel: 'email', purpose: 'promotional',
      content: { subject: 'Hello', bodyText: 'Message', bodyHtml: '<p>Message</p>' },
      selection: { mode: 'explicit', leadIds: [lead._id] },
    }, actor);
    const listed = await service.listRecipients(created._id, actor);

    expect(created.summary).toMatchObject({ eligible: 0, ineligible: 1 });
    expect(listed.data[0]).toMatchObject({
      status: 'ineligible', eligibility: { eligible: false, reasons: expect.arrayContaining(['frequency_daily_limit']) },
    });
  });

  it('rechecks frequency immediately before queue insertion', async () => {
    const destination = 'queue-frequency@example.com';
    const draftCampaign = await campaign({ channel: 'email', purpose: 'support', status: 'draft' });
    const draftRecipient = await recipient(draftCampaign._id, {
      channel: 'email', destination, destinationHash: destinationHash('email', destination), status: 'draft',
    });
    const priorCampaign = await campaign({ channel: 'email', purpose: 'support', status: 'completed' });
    await recipient(priorCampaign._id, {
      leadId: new mongoose.Types.ObjectId(), channel: 'email', destination,
      destinationHash: destinationHash('email', destination), status: 'accepted', acceptedAt: new Date(),
    });
    await ProviderSettings.create({
      key: 'global', updatedBy: actor,
      frequencyLimits: {
        enabled: true, purposes: ['support'],
        email: { minIntervalHours: 0, dailyMax: 1, weeklyMax: 10 },
      },
    });

    await expect(service.startCampaign(draftCampaign._id, actor)).rejects.toThrow(/no eligible recipients/i);

    await expect(MessageRecipient.findById(draftRecipient._id).lean()).resolves.toMatchObject({
      status: 'ineligible', eligibility: { eligible: false, reasons: ['frequency_daily_limit'] },
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  it('applies regional quiet hours only to matching country, channel, and purpose', () => {
    const now = new Date('2026-10-12T21:30:00.000Z');
    const providerSettings = {
      quietHours: { enabled: false },
      regionalQuietHours: [{
        enabled: true, countries: ['CH'], channel: 'sms', purpose: 'promotional',
        start: '20:00', end: '08:00', timezone: 'UTC',
      }],
    };

    expect(service._complianceQuietHoursDelay(
      providerSettings, { purpose: 'promotional' }, { channel: 'sms', country: 'CH' }, now,
    )).toBe(10.5 * 60 * 60_000);
    expect(service._complianceQuietHoursDelay(
      providerSettings, { purpose: 'support' }, { channel: 'sms', country: 'CH' }, now,
    )).toBe(0);
    expect(service._complianceQuietHoursDelay(
      providerSettings, { purpose: 'promotional' }, { channel: 'email', country: 'CH' }, now,
    )).toBe(0);
  });

  it('releases rejected capacity idempotently so another worker can reserve it', async () => {
    const item = await campaign();
    const sharedHash = destinationHash('sms', '+41791234567');
    const first = await recipient(item._id, {
      status: 'submitting', submissionStartedAt: new Date(),
      destinationHash: sharedHash,
      quotaReservationId: new mongoose.Types.ObjectId(), quotaReservationState: 'pending',
    });
    const second = await recipient(item._id, {
      leadId: new mongoose.Types.ObjectId(), status: 'submitting', submissionStartedAt: new Date(),
      destinationHash: sharedHash,
      quotaReservationId: new mongoose.Types.ObjectId(), quotaReservationState: 'pending',
    });
    const limits = {
      quotas: { daily: 1, monthly: 1 },
      frequencyLimits: {
        enabled: true, purposes: ['support'],
        sms: { minIntervalHours: 0, dailyMax: 1, weeklyMax: 1 },
      },
    };

    await expect(service._reserveQuota(first, limits)).resolves.toBe(true);
    await expect(service._reserveFrequency(first, item, limits)).resolves.toMatchObject({ allowed: true, applied: true });
    await service._releaseQuotaReservation(first);
    await service._releaseFrequencyReservation(first);
    await service._releaseQuotaReservation(first);
    await service._releaseFrequencyReservation(first);
    await expect(service._reserveQuota(second, limits)).resolves.toBe(true);
    await expect(service._reserveFrequency(second, item, limits)).resolves.toMatchObject({ allowed: true, applied: true });

    await expect(service._quotaUsage()).resolves.toEqual({ daily: 1, monthly: 1 });
    await expect(MessageRecipient.findById(first._id).lean()).resolves.toMatchObject({
      quotaReservationState: 'released', frequencyReservationState: 'released',
    });
    expect((await FrequencyLedger.findOne({ destinationHash: sharedHash }).lean()).events).toHaveLength(1);
  });

  it('quarantines a stale provider-bound submission instead of resending it', async () => {
    const item = await campaign();
    const message = await recipient(item._id, {
      status: 'submitting', provider: 'textbee',
      submissionStartedAt: new Date(Date.now() - 20 * 60_000),
      quotaReservationId: new mongoose.Types.ObjectId(), quotaReservationState: 'pending',
    });
    await service._reserveQuota(message, { quotas: { daily: 5, monthly: 5 } });

    const result = await service.recoverStaleWork({ now: new Date(), staleAfterMs: 10 * 60_000 });

    expect(result).toMatchObject({ inspected: 1, returnedToQueue: 0, unknown: 1, reEnqueued: 0 });
    await expect(MessageRecipient.findById(message._id).lean()).resolves.toMatchObject({
      status: 'unknown', provider: 'textbee',
      error: { code: 'STALE_SUBMISSION_UNCERTAIN' },
      quotaReservationState: 'consumed',
    });
    await expect(service._quotaUsage()).resolves.toEqual({ daily: 1, monthly: 1 });
    expect(addJob).not.toHaveBeenCalled();
    await expect(DeliveryEvent.findOne({ recipientId: message._id }).lean()).resolves.toMatchObject({
      direction: 'internal', eventType: 'recovery_submission_unknown', normalizedStatus: 'unknown',
    });
  });

  it('restores a durable accepted attempt after a worker crashes before the recipient update', async () => {
    const item = await campaign();
    const boundaryAt = new Date(Date.now() - 20 * 60_000);
    const message = await recipient(item._id, {
      status: 'submitting', provider: 'twilio', submissionStartedAt: boundaryAt,
    });
    await ProviderAttempt.create({
      recipientId: message._id, campaignId: item._id, internalMessageId: String(message._id),
      attemptNumber: 1, provider: 'twilio', idempotencyKey: `${message._id}:twilio:1`,
      outcome: 'accepted', safeToFallback: false, providerMessageId: 'SM-recovered',
      submittedAt: new Date(boundaryAt.getTime() + 1000), resolvedAt: new Date(boundaryAt.getTime() + 2000),
    });

    const result = await service.recoverStaleWork({ now: new Date(), staleAfterMs: 10 * 60_000 });

    expect(result).toMatchObject({ inspected: 1, restored: 1, unknown: 0, reEnqueued: 0 });
    await expect(MessageRecipient.findById(message._id).lean()).resolves.toMatchObject({
      status: 'accepted', provider: 'twilio', providerMessageId: 'SM-recovered',
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  it('advances an accepted TextBee recipient from provider reconciliation evidence', async () => {
    const item = await campaign();
    const message = await recipient(item._id, {
      status: 'accepted', provider: 'textbee', providerMessageId: 'batch-reconcile',
      acceptedAt: new Date(Date.now() - 10 * 60_000), lastEventAt: new Date(Date.now() - 10 * 60_000),
    });
    jest.spyOn(textBee, 'reconcile').mockResolvedValue({
      checked: true, found: true, status: 'delivered', occurredAt: '2026-10-12T10:01:00.000Z',
      evidenceKey: 'delivered:2026-10-12T10:01:00.000Z', details: { deliveredCount: 1 },
    });

    const result = await service.reconcileProviderStatuses({ minAgeMs: 0, maxAgeMs: 24 * 60 * 60_000 });

    expect(result).toMatchObject({ inspected: 1, checked: 1, advanced: 1, notFound: 0 });
    await expect(MessageRecipient.findById(message._id).lean()).resolves.toMatchObject({
      status: 'delivered', deliveredAt: new Date('2026-10-12T10:01:00.000Z'),
      lastReconciliationAt: expect.any(Date),
    });
    expect(await DeliveryEvent.countDocuments({ recipientId: message._id, eventType: 'delivered' })).toBe(1);
  });

  it('records terminal Twilio evidence and cost without creating a retry', async () => {
    const item = await campaign();
    const message = await recipient(item._id, {
      status: 'sent', provider: 'twilio', providerMessageId: 'SM-reconcile',
      sentAt: new Date(Date.now() - 10 * 60_000),
    });
    jest.spyOn(twilio, 'reconcile').mockResolvedValue({
      checked: true, found: true, status: 'undelivered', occurredAt: '2026-10-12T10:02:00.000Z',
      evidenceKey: 'undelivered:2026-10-12T10:02:00.000Z',
      cost: { amount: 0.0075, currency: 'USD' },
      details: { errorCode: 30003, errorMessage: 'Unreachable handset' },
    });

    const result = await service.reconcileProviderStatuses({ minAgeMs: 0, maxAgeMs: 24 * 60 * 60_000 });

    expect(result).toMatchObject({ inspected: 1, checked: 1, advanced: 1 });
    await expect(MessageRecipient.findById(message._id).lean()).resolves.toMatchObject({
      status: 'undelivered', actualCost: { amount: 0.0075, currency: 'USD' },
      error: { code: '30003', message: 'Unreachable handset' },
    });
    expect(addJob).not.toHaveBeenCalled();
  });

  it('never polls or retries an ambiguous submission without a provider id', async () => {
    const item = await campaign();
    await recipient(item._id, {
      status: 'unknown', provider: 'textbee', providerMessageId: null,
      error: { code: 'AMBIGUOUS_SUBMISSION', message: 'Timeout after request body was sent' },
    });
    const reconcile = jest.spyOn(textBee, 'reconcile');

    await expect(service.reconcileProviderStatuses({ minAgeMs: 0 })).resolves.toMatchObject({ inspected: 0 });
    expect(reconcile).not.toHaveBeenCalled();
    expect(addJob).not.toHaveBeenCalled();
  });

  it('persists redacted provider health snapshots in the shared monitoring history', async () => {
    const now = new Date('2026-10-12T12:00:00.000Z');
    const result = await service.monitorProviders({ now, results: {
      email: { configured: true, reachable: true, eligible: true },
      metaWhatsapp: { configured: true, reachable: false, eligible: false, reason: 'timeout' },
      textbee: { configured: true, reachable: true, eligible: false, reason: 'device_offline', apiKey: 'must-not-persist' },
      twilio: { configured: false, reachable: false, eligible: false, reason: 'not_configured' },
    } });

    expect(result.snapshots).toMatchObject({
      email: { status: 'healthy' }, metaWhatsapp: { status: 'down' },
      textbee: { status: 'degraded' }, twilio: { status: 'down' },
    });
    const stored = await IntegrationHealthCheck.findOne({ integrationKey: 'messaging_textbee' }).lean();
    expect(stored).toMatchObject({ status: 'degraded', errorMessage: 'device_offline', details: { apiKey: '[REDACTED]' } });
  });

  it('publishes a provider status transition only after a previous health snapshot exists', async () => {
    await IntegrationHealthCheck.create({
      integrationKey: 'messaging_textbee', status: 'healthy', checkedAt: new Date('2026-10-12T11:55:00.000Z'),
    });
    const publish = jest.spyOn(eventBus, 'publish').mockImplementation(() => {});

    await service.monitorProviders({ now: new Date('2026-10-12T12:00:00.000Z'), results: {
      textbee: { configured: true, reachable: true, eligible: false, reason: 'device_offline' },
    } });

    expect(publish).toHaveBeenCalledWith('integration.status.changed', expect.objectContaining({
      integrationKey: 'messaging_textbee', oldStatus: 'healthy', newStatus: 'degraded',
      settingsPath: '/admin/messaging',
    }), { source: 'messaging:provider-health' });
  });

  it('blocks retry of an ambiguous provider outcome until an explicit reconciliation decision', async () => {
    const item = await campaign({ status: 'completed' });
    const message = await recipient(item._id, { status: 'failed', error: { code: 'AMBIGUOUS_SUBMISSION', message: 'timeout' } });
    await ProviderAttempt.create({
      recipientId: message._id, campaignId: item._id, internalMessageId: String(message._id),
      attemptNumber: 1, provider: 'textbee', idempotencyKey: `${message._id}:textbee:1`,
      outcome: 'ambiguous', safeToFallback: false, failureClass: 'ambiguous', submittedAt: new Date(),
    });

    await expect(service.retryRecipients(item._id, [message._id], actor)).rejects.toThrow(/reconciled/i);
    expect(addJob).not.toHaveBeenCalled();
  });

  it('allows retry after an administrator confirms the provider did not accept the message', async () => {
    const item = await campaign({ status: 'completed' });
    const message = await recipient(item._id, { status: 'unknown', provider: 'textbee' });
    await ProviderAttempt.create({
      recipientId: message._id, campaignId: item._id, internalMessageId: String(message._id),
      attemptNumber: 1, provider: 'textbee', idempotencyKey: `${message._id}:textbee:1`,
      outcome: 'ambiguous', safeToFallback: false, failureClass: 'ambiguous', submittedAt: new Date(),
    });

    await service.reconcileRecipient(item._id, message._id, {
      decision: 'confirm_not_accepted', note: 'Provider support confirmed no batch was created.',
    }, actor);
    const result = await service.retryRecipients(item._id, [message._id], actor);

    expect(result.status).toBe('queued');
    expect(addJob).toHaveBeenCalledTimes(1);
    expect((await MessageRecipient.findById(message._id)).status).toBe('queued');
    expect(await DeliveryEvent.countDocuments({ recipientId: message._id, direction: 'internal' })).toBe(1);
  });

  it('previews and bulk queues only definitive retryable failures after exact-count confirmation', async () => {
    const item = await campaign({ status: 'completed' });
    const transient = await recipient(item._id, { status: 'failed', error: { code: 'NETWORK', message: 'network' } });
    const ambiguous = await recipient(item._id, {
      leadId: new mongoose.Types.ObjectId(), status: 'failed', error: { code: 'AMBIGUOUS_SUBMISSION', message: 'timeout' },
    });
    const permanent = await recipient(item._id, {
      leadId: new mongoose.Types.ObjectId(), status: 'undelivered', error: { code: 'INVALID_DESTINATION', message: 'invalid' },
    });
    await ProviderAttempt.insertMany([
      {
        recipientId: transient._id, campaignId: item._id, internalMessageId: String(transient._id),
        attemptNumber: 1, provider: 'textbee', idempotencyKey: `${transient._id}:textbee:1`,
        outcome: 'rejected', safeToFallback: false, failureClass: 'transient', submittedAt: new Date(),
      },
      {
        recipientId: ambiguous._id, campaignId: item._id, internalMessageId: String(ambiguous._id),
        attemptNumber: 1, provider: 'textbee', idempotencyKey: `${ambiguous._id}:textbee:1`,
        outcome: 'ambiguous', safeToFallback: false, failureClass: 'ambiguous', submittedAt: new Date(),
      },
      {
        recipientId: permanent._id, campaignId: item._id, internalMessageId: String(permanent._id),
        attemptNumber: 1, provider: 'textbee', idempotencyKey: `${permanent._id}:textbee:1`,
        outcome: 'rejected', safeToFallback: false, failureClass: 'permanent', submittedAt: new Date(),
      },
    ]);

    await expect(service.retryEligibility(item._id, actor)).resolves.toMatchObject({
      candidates: 3, retryable: 1, blocked: { ambiguous: 1, permanent: 1 },
    });
    await expect(service.retryEligibleRecipients(item._id, {
      expectedCount: 2, confirmation: true,
    }, actor)).rejects.toThrow(/changed from 2 to 1/i);
    expect(addJobs).not.toHaveBeenCalled();

    const result = await service.retryEligibleRecipients(item._id, {
      expectedCount: 1, confirmation: true,
    }, actor);
    expect(result).toMatchObject({ queued: 1, blocked: { ambiguous: 1, permanent: 1 } });
    expect(result.campaign.status).toBe('queued');
    expect(addJobs).toHaveBeenCalledWith('outbound-messaging', [expect.objectContaining({
      data: { recipientId: String(transient._id) },
    })]);
    expect((await MessageRecipient.findById(transient._id)).status).toBe('queued');
    expect((await MessageRecipient.findById(ambiguous._id)).status).toBe('failed');
    expect((await MessageRecipient.findById(permanent._id)).status).toBe('undelivered');
  });

  it('exports recipient outcome and immutable attempt count', async () => {
    const item = await campaign({ status: 'completed' });
    const message = await recipient(item._id, { status: 'delivered', provider: 'twilio', providerMessageId: 'SM123' });
    await ProviderAttempt.create({
      recipientId: message._id, campaignId: item._id, internalMessageId: String(message._id),
      attemptNumber: 1, provider: 'twilio', idempotencyKey: `${message._id}:twilio:1`,
      outcome: 'accepted', safeToFallback: false, providerMessageId: 'SM123', submittedAt: new Date(), resolvedAt: new Date(),
    });

    const rows = await service.exportCampaign(item._id, actor);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'delivered', provider: 'twilio', providerMessageId: 'SM123', attempts: 1 });
    const listed = await service.listRecipients(item._id, actor);
    expect(listed.data[0].latestAttempt).toMatchObject({ attemptNumber: 1, outcome: 'accepted' });
  });

  it('keeps configured carrier rates as estimates instead of actual cost', () => {
    const estimate = service._estimatedCost(
      { channel: 'sms', routing: { smsProvider: 'textbee' } },
      { bodyText: 'a'.repeat(161) },
      { pricing: { currency: 'CHF', textbeeCarrierPerSegment: 0.08 } },
    );
    expect(estimate).toEqual({ amount: 0.16, currency: 'CHF' });
  });

  it('honors the administrator switch for direct Twilio routing', async () => {
    const result = await service._sendSms(
      { purpose: 'support', routing: { smsProvider: 'twilio', allowFallback: false } },
      { destination: '+41791234567', rendered: { bodyText: 'Hello' }, country: 'CH' },
      { providers: { twilioEnabled: false, textbeeEnabled: true }, smsFallback: { enabled: false } },
    );

    expect(result).toMatchObject({
      provider: 'twilio', outcome: 'rejected', failureClass: 'configuration', errorCode: 'DISABLED',
    });
  });

  it('enforces provider-specific country eligibility before direct Twilio routing', async () => {
    const result = await service._sendSms(
      { purpose: 'support', routing: { smsProvider: 'twilio', allowFallback: false } },
      { destination: '+41791234567', rendered: { bodyText: 'Hello' }, country: 'CH' },
      {
        providers: { twilioEnabled: true, textbeeEnabled: true }, smsFallback: { enabled: false },
        countryRouting: { twilioAllowedCountries: ['DE'], textbeeAllowedCountries: [], whatsappAllowedCountries: [] },
      },
    );

    expect(result).toMatchObject({
      provider: 'twilio', outcome: 'rejected', failureClass: 'policy', errorCode: 'COUNTRY_NOT_ALLOWED',
    });
  });

  it('records policy failures and checks projected Twilio fallback spend', async () => {
    const item = await campaign({ status: 'running' });
    const message = await recipient(item._id, { rendered: { bodyText: 'a'.repeat(161) }, country: 'CH' });
    await service._recordAttempt(message, {
      provider: 'twilio', outcome: 'rejected', safeToFallback: false,
      failureClass: 'policy', errorCode: 'COUNTRY_NOT_ALLOWED', errorMessage: 'Country blocked',
    });
    await expect(ProviderAttempt.findOne({ recipientId: message._id }).lean()).resolves.toMatchObject({
      failureClass: 'policy', errorCode: 'COUNTRY_NOT_ALLOWED',
    });

    const allowed = await service._fallbackEligible(
      { purpose: 'support' }, message,
      {
        smsFallback: { enabled: true, allowedCountries: ['CH'], allowedPurposes: ['support'], dailySpendLimit: 0.1, monthlySpendLimit: 0.1 },
        countryRouting: { twilioAllowedCountries: ['CH'] },
        pricing: { twilioDefaultPerSegment: 0.08, currency: 'CHF' },
      },
    );
    expect(service._twilioEstimatedCost(message, { pricing: { twilioDefaultPerSegment: 0.08, currency: 'CHF' } })).toEqual({ amount: 0.16, currency: 'CHF' });
    expect(allowed).toBe(false);
  });

  it('falls back from Meta to Twilio WhatsApp only after definite non-acceptance', async () => {
    const item = await campaign({
      channel: 'whatsapp', status: 'running', purpose: 'support',
      routing: { allowFallback: true },
      content: {
        whatsappTemplateName: 'approved_intro', whatsappLanguage: 'en_US',
        whatsappTwilioContentSid: `HX${'a'.repeat(32)}`,
      },
    });
    const message = await recipient(item._id, {
      channel: 'whatsapp', country: 'CH', status: 'queued',
      rendered: { bodyText: '', whatsappComponents: [{ type: 'body', parameters: [{ type: 'text', text: 'Ada' }] }] },
    });
    await Consent.create({ leadId, channel: 'whatsapp', status: 'granted', source: 'form', evidence: 'Verified opt in', capturedAt: new Date(), changedBy: actor });
    await ProviderSettings.create({
      key: 'global', updatedBy: actor,
      providers: { metaWhatsappEnabled: true, twilioWhatsappEnabled: true },
      whatsappFallback: { enabled: true, allowedCountries: ['CH'], allowedPurposes: ['support'], dailySpendLimit: 10, monthlySpendLimit: 100 },
      countryRouting: { whatsappAllowedCountries: ['CH'], twilioWhatsappAllowedCountries: ['CH'] },
      quotas: { daily: 100, monthly: 1000, perCampaign: 1000 },
      pricing: { currency: 'CHF', twilioWhatsappDefaultPerMessage: 0.08 },
    });
    jest.spyOn(metaWhatsapp, 'sendTemplate').mockResolvedValue({
      provider: 'meta_whatsapp', outcome: 'rejected', safeToFallback: true,
      failureClass: 'permanent', errorCode: 'HTTP_400', errorMessage: 'Template rejected',
    });
    jest.spyOn(twilio, 'whatsappConfigured', 'get').mockReturnValue(true);
    jest.spyOn(twilio, 'sendWhatsAppTemplate').mockResolvedValue({
      provider: 'twilio_whatsapp', outcome: 'accepted', safeToFallback: false,
      providerMessageId: 'SM-WA-1', providerStatus: 'queued',
    });

    await service.dispatchRecipient(message._id);

    const updated = await MessageRecipient.findById(message._id).lean();
    expect(updated).toMatchObject({
      status: 'accepted', provider: 'twilio_whatsapp', providerMessageId: 'SM-WA-1',
      fallbackFrom: 'meta_whatsapp', fallbackReason: 'HTTP_400',
    });
    const attempts = await ProviderAttempt.find({ recipientId: message._id }).sort({ attemptNumber: 1 }).lean();
    expect(attempts.map((attempt) => [attempt.provider, attempt.outcome])).toEqual([
      ['meta_whatsapp', 'rejected'], ['twilio_whatsapp', 'accepted'],
    ]);
  });

  it('never falls back from an ambiguous Meta submission', async () => {
    const item = await campaign({
      channel: 'whatsapp', status: 'running', purpose: 'support', routing: { allowFallback: true },
      content: { whatsappTemplateName: 'approved_intro', whatsappLanguage: 'en_US', whatsappTwilioContentSid: `HX${'a'.repeat(32)}` },
    });
    const message = await recipient(item._id, { channel: 'whatsapp', country: 'CH', status: 'queued' });
    await Consent.create({ leadId, channel: 'whatsapp', status: 'granted', source: 'form', evidence: 'Verified opt in', capturedAt: new Date(), changedBy: actor });
    await ProviderSettings.create({
      key: 'global', updatedBy: actor,
      providers: { metaWhatsappEnabled: true, twilioWhatsappEnabled: true },
      whatsappFallback: { enabled: true, allowedCountries: ['CH'], allowedPurposes: ['support'], dailySpendLimit: 10, monthlySpendLimit: 100 },
      countryRouting: { whatsappAllowedCountries: ['CH'], twilioWhatsappAllowedCountries: ['CH'] },
      quotas: { daily: 100, monthly: 1000, perCampaign: 1000 },
    });
    jest.spyOn(metaWhatsapp, 'sendTemplate').mockResolvedValue({
      provider: 'meta_whatsapp', outcome: 'ambiguous', safeToFallback: false,
      failureClass: 'ambiguous', errorCode: 'AMBIGUOUS_SUBMISSION', errorMessage: 'Connection lost',
    });
    jest.spyOn(twilio, 'whatsappConfigured', 'get').mockReturnValue(true);
    const fallback = jest.spyOn(twilio, 'sendWhatsAppTemplate');

    await service.dispatchRecipient(message._id);
    expect(fallback).not.toHaveBeenCalled();
    await expect(MessageRecipient.findById(message._id).lean()).resolves.toMatchObject({ status: 'unknown', provider: 'meta_whatsapp' });
  });

  it('fails quiet hours safely and rejects invalid IANA timezone settings', () => {
    expect(service._quietHoursDelay({ enabled: true, start: '00:00', end: '23:59', timezone: 'Not/A_Timezone' }, 'promotional')).toBe(60 * 60_000);
    const result = messagingSchemas.providerSettings.body.validate({ quietHours: { timezone: 'Not/A_Timezone' } });
    expect(result.error?.message).toMatch(/valid IANA timezone/i);
  });

  it('rechecks consent expiry immediately before provider submission', async () => {
    const item = await campaign({ status: 'queued', purpose: 'promotional' });
    const message = await recipient(item._id, { status: 'queued' });
    await Consent.create({
      leadId, channel: 'sms', status: 'granted', source: 'form', evidence: 'Old consent',
      capturedAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() - 1000), changedBy: actor,
    });

    const result = await service.dispatchRecipient(message._id);

    expect(result).toEqual({ suppressed: true });
    await expect(MessageRecipient.findById(message._id).lean()).resolves.toMatchObject({
      status: 'suppressed', eligibility: { eligible: false, reasons: ['consent_or_suppression_changed'] },
    });
  });

  it('merges matched inbound replies into the scoped lead communication timeline', async () => {
    const item = await campaign({ status: 'running' });
    await recipient(item._id, { status: 'sent', provider: 'textbee', providerMessageId: 'batch-1' });
    await DeliveryEvent.create({
      eventKey: 'textbee:inbound:sms-2', provider: 'textbee', providerMessageId: 'sms-2',
      leadId, campaignId: item._id, createdBy: actor, channel: 'sms', direction: 'inbound',
      messagePreview: 'Thanks, please call tomorrow.', eventType: 'inbound', occurredAt: new Date(Date.now() + 1000),
    });

    const history = await service.historyForLead(leadId, actor);

    expect(history.pagination.total).toBe(2);
    expect(history.data[0]).toMatchObject({ direction: 'inbound', status: 'received', rendered: { bodyText: 'Thanks, please call tomorrow.' } });
    expect(history.data[1]).toMatchObject({ direction: 'outbound', status: 'sent' });
    const responses = await service.historyForLead(leadId, actor, { status: 'received' });
    expect(responses.pagination.total).toBe(1);
    expect(responses.data).toHaveLength(1);
    expect(responses.data[0].rendered.bodyText).toBe('Thanks, please call tomorrow.');
  });

  it('stores out-of-order failure evidence without downgrading proven delivery', async () => {
    const item = await campaign({ status: 'completed' });
    const message = await recipient(item._id, {
      status: 'delivered', provider: 'twilio', providerMessageId: 'SM-delivered',
      deliveredAt: new Date(),
    });

    const result = await service.applyProviderEvent({
      provider: 'twilio', providerMessageId: 'SM-delivered', status: 'failed',
      eventKey: 'twilio:SM-delivered:failed:late', occurredAt: new Date(Date.now() + 1000),
      payload: { MessageStatus: 'failed' },
    });

    expect(result).toMatchObject({ accepted: true, matched: true, status: 'delivered' });
    expect((await MessageRecipient.findById(message._id)).status).toBe('delivered');
    expect(await DeliveryEvent.countDocuments({ recipientId: message._id, eventType: 'failed' })).toBe(1);
  });

  it('deduplicates repeated provider events without applying their state twice', async () => {
    const item = await campaign({ status: 'running' });
    const message = await recipient(item._id, {
      status: 'sent', provider: 'textbee', providerMessageId: 'batch-deduplicated',
    });
    const event = {
      provider: 'textbee', providerMessageId: 'batch-deduplicated', status: 'delivered',
      eventKey: 'textbee:stable-provider-event-key', occurredAt: new Date('2026-10-13T10:00:00.000Z'),
      payload: { webhookEvent: 'MESSAGE_DELIVERED', idempotencyKey: 'stable-provider-event-key' },
    };

    await expect(service.applyProviderEvent(event)).resolves.toMatchObject({
      accepted: true, matched: true, status: 'delivered',
    });
    await expect(service.applyProviderEvent(event)).resolves.toEqual({ duplicate: true });

    await expect(DeliveryEvent.countDocuments({ eventKey: event.eventKey })).resolves.toBe(1);
    await expect(MessageRecipient.findById(message._id).lean()).resolves.toMatchObject({ status: 'delivered' });
  });

  it('resumes an unprocessed provider event after a transient database failure', async () => {
    const item = await campaign({ status: 'running' });
    const message = await recipient(item._id, {
      status: 'sent', provider: 'twilio', providerMessageId: 'SM-resumable-event',
    });
    const event = {
      provider: 'twilio', providerMessageId: 'SM-resumable-event', status: 'delivered',
      eventKey: 'twilio:SM-resumable-event:delivered', occurredAt: new Date('2026-10-13T11:00:00.000Z'),
      payload: {
        MessageStatus: 'delivered',
        metadata: { Authorization: 'Bearer secret', nested: { api_key: 'secret-key', safe: 'retained' } },
        credentials: [{ clientSecret: 'nested-secret' }],
        ...JSON.parse('{"__proto__":{"polluted":true}}'),
      },
    };
    const transientFailure = jest.spyOn(MessageRecipient, 'findOne').mockRejectedValueOnce(new Error('temporary database failure'));

    await expect(service.applyProviderEvent(event)).rejects.toThrow(/temporary database failure/i);
    transientFailure.mockRestore();
    await expect(DeliveryEvent.findOne({ eventKey: event.eventKey }).lean()).resolves.toMatchObject({ processedAt: null });

    await expect(service.applyProviderEvent(event)).resolves.toMatchObject({
      accepted: true, matched: true, status: 'delivered',
    });
    const storedEvent = await DeliveryEvent.findOne({ eventKey: event.eventKey }).lean();
    expect(storedEvent.processedAt).toBeInstanceOf(Date);
    expect(storedEvent.payload).toMatchObject({
      metadata: { Authorization: '[REDACTED]', nested: { api_key: '[REDACTED]', safe: 'retained' } },
      credentials: [{ clientSecret: '[REDACTED]' }],
    });
    expect(Object.hasOwn(storedEvent.payload, '__proto__')).toBe(false);
    expect({}.polluted).toBeUndefined();
    await expect(MessageRecipient.findById(message._id).lean()).resolves.toMatchObject({ status: 'delivered' });
  });

  it('resumes inbound STOP processing once and deduplicates later webhook replays', async () => {
    const lead = await Lead.create({
      leadNumber: 'L-99000', name: 'Inbound opt-out lead', mobile: '+41791234567', createdBy: actor,
    });
    const item = await campaign({ status: 'running', selection: { mode: 'explicit', leadIds: [lead._id], selectedAt: new Date() } });
    await MessageRecipient.create({
      campaignId: item._id, leadId: lead._id, channel: 'sms', destination: '+41791234567',
      destinationHash: destinationHash('sms', '+41791234567'), status: 'sent',
      eligibility: { eligible: true, reasons: [] }, rendered: { bodyText: 'Hello' },
      provider: 'textbee', providerMessageId: 'batch-inbound-stop', createdBy: actor,
    });
    const inbound = {
      channel: 'sms', from: '+41791234567', provider: 'textbee', messageId: 'sms-inbound-stop', text: 'STOP',
      payload: { webhookEvent: 'MESSAGE_RECEIVED', message: 'STOP', security: { token: 'do-not-store' } },
    };
    const transientFailure = jest.spyOn(Suppression, 'updateOne').mockRejectedValueOnce(new Error('temporary suppression failure'));

    await expect(service.suppressInbound(inbound)).rejects.toThrow(/temporary suppression failure/i);
    transientFailure.mockRestore();
    await expect(DeliveryEvent.findOne({ eventKey: 'textbee:inbound:sms-inbound-stop' }).lean()).resolves.toMatchObject({ processedAt: null });

    await expect(service.suppressInbound(inbound)).resolves.toEqual({ received: true, optOut: true });
    const consent = await Consent.findOne({ leadId: lead._id, channel: 'sms' }).lean();
    const replay = await service.suppressInbound(inbound);

    expect(replay).toEqual({ received: true, optOut: true, duplicate: true });
    expect(await DeliveryEvent.countDocuments({ eventKey: 'textbee:inbound:sms-inbound-stop' })).toBe(1);
    await expect(Consent.findOne({ leadId: lead._id, channel: 'sms' }).lean()).resolves.toMatchObject({
      status: 'revoked', capturedAt: consent.capturedAt,
    });
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect((await DeliveryEvent.findOne({ eventKey: 'textbee:inbound:sms-inbound-stop' }).lean()).payload.security.token).toBe('[REDACTED]');
  });

  it('turns a valid signed email unsubscribe into consent revocation and suppression', async () => {
    const lead = await Lead.create({ leadNumber: 'L-99001', name: 'Consent Lead', email: 'consent@example.com', createdBy: actor });
    await Consent.create({ leadId: lead._id, channel: 'email', status: 'granted', source: 'form', evidence: 'Form submission', capturedAt: new Date(), changedBy: actor });
    const token = createUnsubscribeToken({ leadId: String(lead._id), destinationHash: destinationHash('email', lead.email) });

    await expect(service.unsubscribeEmail(token)).resolves.toEqual({ unsubscribed: true });
    await expect(Consent.findOne({ leadId: lead._id, channel: 'email' }).lean()).resolves.toMatchObject({ status: 'revoked', source: 'email_unsubscribe' });
    await expect(Suppression.findOne({ leadId: lead._id, channel: 'email' }).lean()).resolves.toMatchObject({ reason: 'opt_out', source: 'email_unsubscribe' });
  });

  it('returns an evidence-based consent profile without exposing destinations', async () => {
    const lead = await Lead.create({ leadNumber: 'L-99002', name: 'Profile Lead', email: 'profile@example.com', createdBy: actor });
    await Consent.create({ leadId: lead._id, channel: 'email', status: 'granted', source: 'signed_form', evidence: 'Verified web form', capturedAt: new Date(), changedBy: actor });
    await Suppression.create({ channel: 'email', destinationHash: destinationHash('email', lead.email), leadId: lead._id, reason: 'complaint', source: 'provider_webhook' });

    const profile = await service.getConsentProfile(lead._id);

    expect(profile.channels).toHaveLength(3);
    expect(profile.channels.find((item) => item.channel === 'email')).toMatchObject({
      status: 'granted', effectiveStatus: 'suppressed', hasDestination: true,
      suppression: { active: true, reason: 'complaint', source: 'provider_webhook' },
    });
    expect(profile.channels.find((item) => item.channel === 'sms')).toMatchObject({
      status: 'unknown', effectiveStatus: 'unknown', hasDestination: false, suppression: null,
    });
    expect(JSON.stringify(profile)).not.toContain('profile@example.com');
  });

  it('blocks ordinary grants over suppressions and requires an audited administrator reinstatement', async () => {
    const lead = await Lead.create({ leadNumber: 'L-99003', name: 'Re-opt-in Lead', email: 'renewed@example.com', createdBy: actor });
    await Suppression.create({ channel: 'email', destinationHash: destinationHash('email', lead.email), leadId: lead._id, reason: 'opt_out', source: 'email_unsubscribe' });

    await expect(service.updateConsent(lead._id, {
      channel: 'email', status: 'granted', evidence: 'New consent evidence', source: 'manual',
    }, actor)).rejects.toThrow(/administrator must verify renewed opt-in/i);

    const capturedAt = new Date();
    await expect(service.reinstateConsent(lead._id, {
      channel: 'email', evidence: 'Signed renewed opt-in form', source: 'verified_reopt_in', capturedAt, confirmation: true,
    }, actor, { ipAddress: '127.0.0.1' })).resolves.toMatchObject({ status: 'granted', source: 'verified_reopt_in' });
    expect(await Suppression.countDocuments({ channel: 'email', destinationHash: destinationHash('email', lead.email) })).toBe(0);
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'messaging.consent.reinstated', userId: actor,
      details: expect.objectContaining({ leadId: lead._id, channel: 'email', priorSuppressionReason: 'opt_out' }),
    }));
  });

  it('creates a destination suppression when consent is manually revoked', async () => {
    const lead = await Lead.create({ leadNumber: 'L-99004', name: 'Revoked Lead', mobile: '+41791234567', createdBy: actor });

    await service.updateConsent(lead._id, {
      channel: 'sms', status: 'revoked', evidence: 'Recipient requested no SMS', source: 'manual',
    }, actor);

    await expect(Suppression.findOne({ leadId: lead._id, channel: 'sms' }).lean()).resolves.toMatchObject({
      reason: 'admin', source: 'manual_consent_change', createdBy: actor,
    });
  });

  it('requires evidence for consent grants and explicit confirmation for reinstatement', () => {
    expect(messagingSchemas.consent.body.validate({ channel: 'email', status: 'granted' }).error).toBeTruthy();
    expect(messagingSchemas.consent.body.validate({ channel: 'email', status: 'granted', evidence: 'Signed form' }).error).toBeFalsy();
    expect(messagingSchemas.reinstateConsent.body.validate({
      channel: 'email', evidence: 'Signed renewed consent', capturedAt: new Date().toISOString(), confirmation: false,
    }).error).toBeTruthy();
    expect(messagingSchemas.verifyCampaignConsent.body.validate({
      recipientIds: [new mongoose.Types.ObjectId().toString()], evidence: 'Shared signed event form',
      capturedAt: new Date().toISOString(), confirmation: false,
    }).error).toBeTruthy();
    expect(messagingSchemas.verifyCampaignConsent.body.validate({
      recipientIds: [new mongoose.Types.ObjectId().toString()], evidence: 'Shared signed event form',
      source: 'signed_form', capturedAt: new Date().toISOString(), confirmation: true,
    }).error).toBeFalsy();
  });

  it('reports date-scoped evidence, actor-scoped compliance, and currency-safe costs', async () => {
    const otherActor = new mongoose.Types.ObjectId();
    const ownedLead = await Lead.create({ leadNumber: 'L-99101', name: 'Owned analytics lead', email: 'owned@example.com', createdBy: actor });
    const otherLead = await Lead.create({ leadNumber: 'L-99102', name: 'Other analytics lead', email: 'other@example.com', createdBy: otherActor });
    const current = await campaign({ channel: 'email', status: 'completed', selection: { mode: 'explicit', leadIds: [ownedLead._id], selectedAt: new Date() } });
    const message = await recipient(current._id, {
      leadId: ownedLead._id, channel: 'email', destination: ownedLead.email,
      status: 'read', provider: 'existing_email', providerMessageId: 'email-analytics-1',
      actualCost: { amount: 1.2, currency: 'USD' }, estimatedCost: { amount: 1.4, currency: 'CHF' },
    });
    const old = await campaign({ name: 'Old campaign', status: 'completed' });
    const oldMessage = await recipient(old._id, { leadId: ownedLead._id, status: 'delivered', provider: 'twilio', providerMessageId: 'SM-old' });
    const oldDate = new Date('2025-01-01T12:00:00.000Z');
    await Campaign.collection.updateOne({ _id: old._id }, { $set: { createdAt: oldDate, updatedAt: oldDate } });
    await MessageRecipient.collection.updateOne({ _id: oldMessage._id }, { $set: { createdAt: oldDate, updatedAt: oldDate } });
    await DeliveryEvent.create({
      eventKey: 'email:analytics:bounce', provider: 'existing_email', providerMessageId: message.providerMessageId,
      recipientId: message._id, leadId: ownedLead._id, campaignId: current._id, createdBy: actor,
      channel: 'email', direction: 'outbound', eventType: 'BOUNCED', normalizedStatus: 'failed', occurredAt: new Date(),
    });
    await Consent.create({ leadId: ownedLead._id, channel: 'email', status: 'granted', expiresAt: new Date(Date.now() + 86_400_000), changedBy: actor });
    await Consent.create({ leadId: otherLead._id, channel: 'email', status: 'granted', expiresAt: new Date(Date.now() + 86_400_000), changedBy: otherActor });
    await Suppression.create({ channel: 'email', destinationHash: 'owned-report-hash', leadId: ownedLead._id, reason: 'bounce', createdBy: actor });
    await Suppression.create({ channel: 'email', destinationHash: 'other-report-hash', leadId: otherLead._id, reason: 'bounce', createdBy: otherActor });

    const report = await service.analytics(actor, { from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z' });

    expect(report).toMatchObject({ campaigns: 1, totalRecipients: 1, submitted: 1, delivered: 1, read: 1, emailBounced: 1 });
    expect(report.compliance).toMatchObject({ expiringConsents: 1, suppressedDestinations: 1 });
    expect(report.byChannel[0]).toMatchObject({ _id: 'email', submitted: 1, delivered: 1, read: 1, bounced: 1 });
    expect(report.byProvider[0].costs).toEqual(expect.arrayContaining([
      { currency: 'USD', actual: 1.2, estimated: 0 },
      { currency: 'CHF', actual: 0, estimated: 1.4 },
    ]));
    const csvEvidence = await service.exportAnalytics(actor, { from: '2026-01-01T00:00:00.000Z' });
    expect(csvEvidence.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'provider_cost', dimension: 'existing_email', metric: 'actual', currency: 'USD' }),
    ]));
  });
});

describe('SMS destinations and STOP (2026-10-21 audit)', () => {
  it('sends a Pakistani lead with a local number to +92, not +41', async () => {
    const lead = await Lead.create({
      leadNumber: 'L-99501', name: 'Lahore Shop', mobile: '0300 1234567', address: { country: 'PK' }, createdBy: actor,
    });
    await Consent.create({
      leadId: lead._id, channel: 'sms', status: 'granted', source: 'form', evidence: 'Opt-in', capturedAt: new Date(), changedBy: actor,
    });
    const created = await service.createCampaign({
      name: 'PK destination', channel: 'sms', purpose: 'support',
      content: { bodyText: 'Hello' }, selection: { mode: 'explicit', leadIds: [lead._id] },
    }, actor);
    const row = await MessageRecipient.findOne({ campaignId: created._id }).lean();
    expect(row.destination).toBe('+923001234567');
  });

  it('a TextBee "Stop." reply with a 0092… sender suppresses the +92 lead', async () => {
    const lead = await Lead.create({
      leadNumber: 'L-99502', name: 'Karachi Shop', mobile: '+923001234567', normalizedPhone: '+923001234567',
      address: { country: 'PK' }, createdBy: actor,
    });
    const result = await service.suppressInbound({
      channel: 'sms', from: '0092 300 1234567', provider: 'textbee', messageId: 'sms-pk-stop', text: 'Stop.',
      payload: { webhookEvent: 'MESSAGE_RECEIVED', message: 'Stop.' },
    });
    expect(result).toMatchObject({ received: true, optOut: true });
    await expect(Suppression.findOne({ channel: 'sms', destinationHash: destinationHash('sms', '+923001234567') }).lean())
      .resolves.toMatchObject({ leadId: lead._id, reason: 'opt_out' });
  });
});
