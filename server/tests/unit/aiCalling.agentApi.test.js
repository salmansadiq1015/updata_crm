import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

process.env.AI_CALLING_REQUIRE_CONSENT = 'false';

/**
 * HTTP-level test of the agent tool API — exactly how the LiveKit voice-agent
 * worker reaches the CRM during a live call: a per-call bearer token, JSON body,
 * the real routes + validation + controller + service. Proves the constrained
 * tool surface is correctly wired and authenticated end to end.
 */

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn(), getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn(async () => ({})) } }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class MockLiveKitSipProvider {
    constructor() { this.configured = false; this.enabled = false; }
    eligibleFor() { return false; }
    async health() { return { configured: false, eligible: false, reason: 'not_configured' }; }
  },
  default: { configured: false, health: async () => ({ configured: false }), createOutboundCall: async () => ({ outcome: 'rejected' }), dispatchAgent: async () => ({ outcome: 'rejected' }), issueJoinToken: () => null, endCall: async () => ({ ended: false }) },
}));

let mongod;
let app;
let service;
let CallCampaign;
let CampaignRecipient;
let CallRecord;
let Lead;
let issueAgentToken;

const actor = new mongoose.Types.ObjectId();

async function setupCall() {
  const lead = await Lead.create({
    leadNumber: `L-${Math.floor(Math.random() * 1e6)}`, name: 'Acme GmbH', source: 'manual',
    mobile: '+41791234567', address: { country: 'CH', city: 'Zürich' }, createdBy: actor,
  });
  const campaign = await service.createCampaign({
    name: 'HTTP agent test',
    questionnaire: { questions: [{ fieldKey: 'active', label: 'Active', text: 'Operating?', type: 'boolean', required: true, order: 1 }] },
    statusRules: [{ id: 'q', when: { all: [{ field: 'active', equals: true }] }, action: 'mark_qualified' }],
    agentConfig: { agentName: 'Tess', organizationName: 'Acme' },
    schedule: {}, selection: { mode: 'explicit', leadIds: [String(lead._id)] },
  }, actor);
  const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
  const internalCallId = `call_${recipient._id}_1`;
  await CallRecord.create({
    campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
    internalCallId, attemptNumber: 1, state: 'ringing', roomName: `crm-call-${internalCallId}`, createdBy: actor,
  });
  return { internalCallId, lead };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const { agentToolRoutes } = await import('../../src/modules/aiCalling/aiCalling.routes.js');
  service = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  ({ issueAgentToken } = await import('../../src/modules/aiCalling/callAuth.js'));
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  CampaignRecipient = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;

  app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/agent', agentToolRoutes);
  app.use(errorHandler);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
});

describe('agent tool API over HTTP', () => {
  it('rejects a request with no / bad token (401)', async () => {
    const { internalCallId } = await setupCall();
    await request(app).get(`/agent/${internalCallId}/context`).expect(401);
    await request(app).get(`/agent/${internalCallId}/context`).set('Authorization', 'Bearer nonsense').expect(401);
  });

  it('runs the full tool flow with a valid per-call token', async () => {
    const { internalCallId, lead } = await setupCall();
    const token = issueAgentToken(internalCallId);
    const auth = { Authorization: `Bearer ${token}` };

    const ctx = await request(app).get(`/agent/${internalCallId}/context`).set(auth).expect(200);
    expect(ctx.body.data.nextAction.type).toBe('disclose');
    expect(ctx.body.data.leadContext.businessName).toBe('Acme GmbH');

    const disclosed = await request(app).post(`/agent/${internalCallId}/disclose`).set(auth).send({}).expect(200);
    expect(disclosed.body.data.nextAction).toMatchObject({ type: 'ask', question: { fieldKey: 'active' } });

    const answered = await request(app).post(`/agent/${internalCallId}/record-answer`).set(auth)
      .send({ fieldKey: 'active', rawAnswer: 'yes we are open' }).expect(200);
    expect(answered.body.data.validation).toBe('valid');
    expect(answered.body.data.nextAction.type).toBe('finish');

    const ended = await request(app).post(`/agent/${internalCallId}/end`).set(auth).send({ durationSeconds: 30 }).expect(200);
    expect(ended.body.data).toMatchObject({ processed: true, qualification: 'qualified' });

    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).toBe('qualified');
  });

  it('validates the body (missing fieldKey → 400)', async () => {
    const { internalCallId } = await setupCall();
    const token = issueAgentToken(internalCallId);
    await request(app).post(`/agent/${internalCallId}/record-answer`).set('Authorization', `Bearer ${token}`)
      .send({ rawAnswer: 'hi' }).expect(400);
  });

  it('a token for one call cannot drive another call', async () => {
    const a = await setupCall();
    const b = await setupCall();
    const tokenForA = issueAgentToken(a.internalCallId);
    // Token is bound to call A; using it on B's path authenticates as A, so B is untouched.
    const res = await request(app).get(`/agent/${b.internalCallId}/context`).set('Authorization', `Bearer ${tokenForA}`).expect(200);
    // The controller reads req.agentCall.callId (A), not the URL param (B).
    expect(res.body.data.callId).toBe(a.internalCallId);
  });
});
