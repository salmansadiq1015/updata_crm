/**
 * Live voice assistant (server/src/modules/ai/voiceAgent):
 *  - session minting sends the right config to OpenAI and never leaks the API key
 *  - the tool route only reaches whitelisted executors, under the person's permissions
 *  - crm_request drives the real agent run lifecycle (completed / follow-up /
 *    awaiting confirmation → confirm) through the AgentRun collection
 *  - lead, follow-up, meeting, calendar, notification, employee and briefing tools
 *    against the REAL services on an in-memory MongoDB
 */
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { serve } from '../helpers/serve.js';

const addJob = jest.fn(async () => ({}));
const audit = jest.fn();
const clientSecretsCreate = jest.fn(async () => ({ value: 'ek_test_secret', expires_at: 1893456000 }));
const agentRun = jest.fn();
const agentConfirm = jest.fn();

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob, getQueueStats: async () => ({}) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: audit } }));
jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
  default: {
    get: async () => null, set: async () => {}, del: async () => {}, invalidatePattern: async () => {},
    getOrSet: async (_key, fn) => fn(),
  },
}));
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => true,
  assertAiConfigured: () => {},
  createChatModel: async () => { throw new Error('no LLM in tests'); },
  createOpenAiClient: async () => ({ realtime: { clientSecrets: { create: clientSecretsCreate } } }),
}));
jest.unstable_mockModule('../../src/modules/ai/agent/agent.service.js', () => ({
  AI_AGENT_VERSION: 'test',
  default: { run: agentRun, confirmRun: agentConfirm },
}));
// Auth: identity and permissions come from headers. All exports kept (other modules import them).
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  PERMISSION_IMPLICATIONS: {},
  satisfiesPermission: (perms, required) => perms.includes(required),
  authenticate: (req, _res, next) => {
    req.user = {
      _id: new mongoose.Types.ObjectId(req.get('x-user')),
      firstName: 'Salman', lastName: 'Admin', email: 'salman@example.test',
      role: { name: req.get('x-role') || 'Member' },
      _perms: (req.get('x-perms') || '').split(',').filter(Boolean),
    };
    next();
  },
  requirePermission: (permission) => (req, res, next) => (
    req.user.role.name === 'Admin' || req.user._perms.includes(permission) ? next() : res.status(403).json({ forbidden: permission })
  ),
  authGuard: () => (_req, _res, next) => next(),
  authorize: () => (_req, _res, next) => next(),
  loadUserPermissions: async (user) => user._perms || [],
}));

let db; let app; let config; let AgentRun; let Lead; let User; let Role; let InAppNotification; let LeadFollowUp;
let me; let colleague;

function as(user, perms, role = 'Member') {
  return { 'x-user': String(user._id), 'x-perms': perms.join(','), 'x-role': role };
}
const ALL = ['ai:sessions', 'lead:read', 'lead:write', 'meetings:read', 'meetings:write', 'scheduling:read', 'notifications:feed', 'users:read', 'tasks:read'];

async function tool(name, args = {}, perms = ALL, threadId = 'thread-1') {
  const res = await request(serve(app)).post('/ai/voice-agent/tool').set(as(me, perms)).send({ name, arguments: args, threadId, timeZone: 'Europe/Zurich' });
  return res;
}

beforeAll(async () => {
  db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri());
  config = (await import('../../src/config/index.js')).default;
  config.ai.apiKey = 'sk-test';
  config.ai.baseUrl = '';
  ({ default: AgentRun } = await import('../../src/modules/ai/agent/agentRun.model.js'));
  ({ default: Lead } = await import('../../src/modules/crm/lead.model.js'));
  ({ default: User } = await import('../../src/modules/auth/user.model.js'));
  ({ default: Role } = await import('../../src/modules/auth/role.model.js'));
  ({ default: InAppNotification } = await import('../../src/modules/notifications/inAppNotification.model.js'));
  ({ default: LeadFollowUp } = await import('../../src/modules/crm/leadFollowUp.model.js'));
  // Populated by meetings/tasks; the full server registers them at boot.
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/tasks/task.model.js');
  const { default: routes } = await import('../../src/modules/ai/voiceAgent/voiceAgent.routes.js');
  const { responseEnvelope } = await import('../../src/shared/middleware/responseEnvelope.js').then((m) => ({ responseEnvelope: m.default || m.responseEnvelope }));
  const { errorHandler } = await import('../../src/shared/middleware/errorHandler.js').then((m) => ({ errorHandler: m.default || m.errorHandler }));

  app = express();
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/ai/voice-agent', routes);
  app.use(errorHandler);

  const role = await Role.create({ name: `Member-${Date.now()}`, permissions: [] });
  me = await User.create({ email: 'salman@example.test', passwordHash: 'x', firstName: 'Salman', lastName: 'Admin', role: role._id, phone: '+41790000000', status: 'active' });
  colleague = await User.create({ email: 'thomas.keller@example.test', passwordHash: 'x', firstName: 'Thomas', lastName: 'Keller', role: role._id, phone: '+41791112233', status: 'active' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await db?.stop();
});

beforeEach(() => {
  jest.clearAllMocks();
  config.ai.apiKey = 'sk-test';
  config.ai.baseUrl = '';
});

describe('session', () => {
  it('mints an ephemeral secret with instructions, tools and the chosen voice — never the API key', async () => {
    const res = await request(serve(app)).post('/ai/voice-agent/session').set(as(me, ALL)).send({ voice: 'cedar', locale: 'de', currentPage: '/tasks' });
    expect(res.status).toBe(201);
    expect(res.body.data.clientSecret).toBe('ek_test_secret');
    expect(res.body.data.voice).toBe('cedar');
    expect(res.body.data.threadId).toEqual(expect.any(String));
    expect(res.body.data.pages.tasks).toBe('/tasks');
    expect(JSON.stringify(res.body)).not.toContain('sk-test');

    const { session, expires_after: expiresAfter } = clientSecretsCreate.mock.calls[0][0];
    expect(expiresAfter.seconds).toBeLessThanOrEqual(600);
    expect(session.type).toBe('realtime');
    expect(session.audio.output.voice).toBe('cedar');
    expect(session.audio.input.turn_detection).toMatchObject({ type: 'semantic_vad', interrupt_response: true });
    expect(session.audio.input.transcription.model).toBeTruthy();
    expect(session.instructions).toContain('Salman Admin');
    expect(session.instructions).toContain('/tasks');
    expect(session.instructions).toMatch(/German/);
    const names = session.tools.map((t) => t.name);
    for (const n of ['crm_request', 'confirm_pending_action', 'get_my_day', 'search_leads', 'create_lead', 'list_follow_ups', 'create_meeting', 'list_calendar', 'list_notifications', 'find_employee', 'list_inbox', 'open_page', 'end_conversation']) {
      expect(names).toContain(n);
    }
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'ai.voice_agent.session.started' }));
  });

  it('keeps the thread the conversation was opened from', async () => {
    const res = await request(serve(app)).post('/ai/voice-agent/session').set(as(me, ALL)).send({ threadId: 'existing-thread' });
    expect(res.body.data.threadId).toBe('existing-thread');
  });

  it('rejects unknown voices and people without ai:sessions', async () => {
    expect((await request(serve(app)).post('/ai/voice-agent/session').set(as(me, ALL)).send({ voice: 'robot' })).status).toBe(400);
    expect((await request(serve(app)).post('/ai/voice-agent/session').set(as(me, ['lead:read'])).send({})).status).toBe(403);
  });

  it('answers 503 when Realtime is not available (no key / non-OpenAI gateway)', async () => {
    config.ai.baseUrl = 'https://swiss-gateway.example/v1';
    const res = await request(serve(app)).post('/ai/voice-agent/session').set(as(me, ALL)).send({});
    expect(res.status).toBe(503);
    expect(res.body.error?.code || res.body.code).toBe('VOICE_AGENT_UNAVAILABLE');
    const status = await request(serve(app)).get('/ai/voice-agent/status').set(as(me, ALL));
    expect(status.body.data.available).toBe(false);
  });

  it('reports an upstream failure as 502, not a crash', async () => {
    clientSecretsCreate.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    const res = await request(serve(app)).post('/ai/voice-agent/session').set(as(me, ALL)).send({});
    expect(res.status).toBe(502);
  });
});

describe('tool routing', () => {
  it('refuses tools that are not on the server list (incl. client tools)', async () => {
    expect((await tool('drop_database')).status).toBe(400);
    expect((await tool('open_page', { page: 'tasks' })).status).toBe(400);
    expect((await tool('constructor')).status).toBe(400);
  });

  it('validates the body', async () => {
    const res = await request(serve(app)).post('/ai/voice-agent/tool').set(as(me, ALL)).send({ name: 'search_leads' });
    expect(res.status).toBe(400);
  });
});

describe('crm_request → agent pipeline', () => {
  async function seedRun(status, output, extra = {}) {
    return AgentRun.create({
      userId: me._id, threadId: 'thread-1', workflowType: 'FIELD_SERVICE_AGENT', status, input: 'x',
      idempotencyKey: new mongoose.Types.ObjectId().toString(), correlationId: new mongoose.Types.ObjectId().toString(),
      output, ...extra,
    });
  }

  it('dispatches into the voice thread and returns the settled result', async () => {
    const run = await seedRun('PENDING', null);
    agentRun.mockImplementationOnce(async () => {
      setTimeout(() => AgentRun.updateOne({ _id: run._id }, {
        status: 'COMPLETED',
        output: { action: 'CREATE_TASK', status: 'completed', message: 'Aufgabe erstellt: Boiler prüfen', recordType: 'task', recordId: 'abc', record: { title: 'Boiler prüfen' }, resolvedContext: { secret: 'internal' } },
      }).exec(), 400);
      return { agentRunId: String(run._id), status: 'pending', threadId: 'thread-1' };
    });
    const res = await tool('crm_request', { request: 'Create a task to check the boiler tomorrow, high priority' });
    expect(res.status).toBe(200);
    const [input, userId, perms, meta] = agentRun.mock.calls[0];
    expect(input).toContain('boiler');
    expect(userId).toBe(String(me._id));
    expect(perms).toEqual(ALL);
    expect(meta.threadId).toBe('thread-1');
    expect(meta.ignoreFollowUp).toBe(true);
    expect(res.body.data.result).toMatchObject({ status: 'completed', action: 'CREATE_TASK', message: 'Aufgabe erstellt: Boiler prüfen' });
    expect(res.body.data.result).not.toHaveProperty('resolvedContext');
    expect(JSON.stringify(res.body.data.result)).not.toContain('"secret"');
    expect(res.body.data.display).toMatchObject({ kind: 'agent_run', status: 'COMPLETED', threadId: 'thread-1' });
    expect(res.body.data.display.output.recordType).toBe('task');
  });

  it('passes follow-up answers to the open question', async () => {
    const run = await seedRun('COMPLETED', { status: 'needs_follow_up', message: 'Welchen Kunden?', candidates: { customers: [{ index: 1, label: 'Müller AG' }] } });
    agentRun.mockResolvedValueOnce({ agentRunId: String(run._id) });
    const res = await tool('crm_request', { request: 'Müller AG', continues_previous: true });
    expect(agentRun.mock.calls[0][3].ignoreFollowUp).toBe(false);
    expect(res.body.data.result).toMatchObject({ status: 'needs_follow_up', message: 'Welchen Kunden?' });
    expect(res.body.data.result.candidates.customers[0].label).toBe('Müller AG');
  });

  it('returns awaiting_confirmation with a run_id, and confirm_pending_action resumes it', async () => {
    const run = await seedRun('AWAITING_CONFIRMATION', {
      status: 'awaiting_confirmation', message: 'Soll ich fortfahren?',
      confirmation: { label: 'die Aufgabe löschen', effect: 'Löscht Daten', proposal: { title: 'Boiler prüfen' } },
    });
    agentRun.mockResolvedValueOnce({ agentRunId: String(run._id) });
    const first = await tool('crm_request', { request: 'Delete the boiler task' });
    expect(first.body.data.result).toMatchObject({ status: 'awaiting_confirmation', run_id: String(run._id), action: 'die Aufgabe löschen' });

    agentConfirm.mockImplementationOnce(async () => {
      await AgentRun.updateOne({ _id: run._id }, { status: 'RUNNING' });
      setTimeout(() => AgentRun.updateOne({ _id: run._id }, { status: 'COMPLETED', output: { status: 'completed', message: 'Gelöscht.' } }).exec(), 300);
      return {};
    });
    const second = await tool('confirm_pending_action', { run_id: String(run._id), approve: true });
    expect(agentConfirm).toHaveBeenCalledWith(String(run._id), String(me._id), true, {});
    expect(second.body.data.result).toMatchObject({ status: 'completed', message: 'Gelöscht.' });
  });

  it('cancels on a no without waiting', async () => {
    agentConfirm.mockResolvedValueOnce({});
    const res = await tool('confirm_pending_action', { run_id: new mongoose.Types.ObjectId().toString(), approve: false });
    expect(res.body.data.result.status).toBe('cancelled');
  });

  it('turns agent errors (rate limit, not found) into a spoken failure, not a 500', async () => {
    const { AppError } = await import('../../src/shared/errors/AppError.js');
    agentRun.mockRejectedValueOnce(new AppError('Agent rate limit exceeded (200/h)', 429, 'AI_AGENT_RATE_LIMITED'));
    const res = await tool('crm_request', { request: 'anything' });
    expect(res.status).toBe(200);
    expect(res.body.data.result).toMatchObject({ status: 'failed', code: 'AI_AGENT_RATE_LIMITED' });
  });

  it('reports failed runs with their reason', async () => {
    const run = await seedRun('FAILED', null, { error: { code: 'RBAC_DENIED', message: 'Missing permission' } });
    agentRun.mockResolvedValueOnce({ agentRunId: String(run._id) });
    const res = await tool('crm_request', { request: 'delete all customers' });
    expect(res.body.data.result).toMatchObject({ status: 'failed', code: 'RBAC_DENIED' });
  });
});

describe('leads and follow-ups (real services)', () => {
  it('creates, finds and updates a lead; enforces lead:write', async () => {
    const denied = await tool('create_lead', { name: 'Denied GmbH' }, ['ai:sessions', 'lead:read']);
    expect(denied.body.data.result.code).toBe('PERMISSION_DENIED');
    expect(await Lead.countDocuments({ name: 'Denied GmbH' })).toBe(0);

    const created = await tool('create_lead', { name: 'Alpenblick Heizungen AG', city: 'Zürich', phone: '+41 44 123 45 67', notes: 'Met at trade fair' });
    expect(created.status).toBe(200);
    expect(created.body.data.result.status).toBe('completed');
    const stored = await Lead.findOne({ name: 'Alpenblick Heizungen AG' }).lean();
    expect(stored).toBeTruthy();
    expect(String(stored.createdBy)).toBe(String(me._id));
    expect(stored.address.city).toBe('Zürich');
    expect(created.body.data.display).toMatchObject({ kind: 'record', recordType: 'lead' });

    const found = await tool('search_leads', { query: 'Alpenblick' });
    expect(found.body.data.result.leads.map((l) => l.name)).toContain('Alpenblick Heizungen AG');

    const updated = await tool('update_lead_status', { lead_name: 'Alpenblick', status: 'qualified' });
    expect(updated.body.data.result.status).toBe('completed');
    expect((await Lead.findById(stored._id).lean()).status).toBe('qualified');

    const bad = await tool('update_lead_status', { lead_name: 'Alpenblick', status: 'deleted' });
    expect(bad.body.data.result.status).toBe('failed');
  });

  it('asks which lead when several match', async () => {
    await tool('create_lead', { name: 'Sonnenhof Bau A' });
    await tool('create_lead', { name: 'Sonnenhof Bau B' });
    const res = await tool('update_lead_status', { lead_name: 'Sonnenhof', status: 'contacted' });
    expect(res.body.data.result.status).toBe('needs_follow_up');
    expect(res.body.data.result.candidates.length).toBe(2);
  });

  it('schedules, lists and completes a follow-up', async () => {
    await tool('create_lead', { name: 'Bergquelle Sanitär' });
    const due = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    const created = await tool('create_follow_up', { lead_name: 'Bergquelle', due_at: due, channel: 'phone', note: 'Send quote', priority: 'HIGH' });
    expect(created.body.data.result.status).toBe('completed');
    const fuId = created.body.data.result.followUp.id;
    const stored = await LeadFollowUp.findById(fuId).lean();
    expect(String(stored.ownerId)).toBe(String(me._id));
    expect(stored.channel).toBe('phone');

    const listed = await tool('list_follow_ups', { bucket: 'open' });
    expect(listed.body.data.result.followUps.map((f) => f.id)).toContain(fuId);

    const done = await tool('complete_follow_up', { follow_up_id: fuId, note: 'Called' });
    expect(done.body.data.result.status).toBe('completed');
    expect((await LeadFollowUp.findById(fuId).lean()).status).toBe('done');

    const missingDate = await tool('create_follow_up', { lead_name: 'Bergquelle' });
    expect(missingDate.body.data.result.status).toBe('needs_follow_up');
  });
});

describe('calendar, notifications, people, briefing (real services)', () => {
  it('creates a meeting with a colleague and lists it in the calendar', async () => {
    // Local Zurich wall time without offset — what the model is told to send.
    const day = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
    const res = await tool('create_meeting', { title: 'Site walk Alpenblick', start_at: `${day}T14:30`, duration_minutes: 45, participant_names: ['Thomas Keller'], location: 'Zürich' });
    expect(res.body.data.result.status).toBe('completed');
    expect(res.body.data.result.meeting.participants).toContain('Thomas Keller');
    const { default: Meeting } = await import('../../src/modules/meetings/meeting.model.js');
    const stored = await Meeting.findOne({ title: 'Site walk Alpenblick' }).lean();
    expect(stored).toBeTruthy();
    expect((stored.endAt - stored.startAt) / 60000).toBe(45);
    // 14:30 in Zurich, stored as the right instant, read back as local time.
    expect(stored.startAt.toLocaleTimeString('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' })).toBe('14:30');
    expect(res.body.data.result.meeting.start).toBe(`${day} 14:30`);

    const cal = await tool('list_calendar', { date_from: day }, ['ai:sessions', 'meetings:read']);
    expect(cal.body.data.result.meetings.map((m) => m.title)).toContain('Site walk Alpenblick');
    expect(cal.body.data.result.meetings.find((m) => m.title === 'Site walk Alpenblick').start).toBe(`${day} 14:30`);

    const noPerm = await tool('create_meeting', { title: 'Nope', start_at: `${day}T10:00` }, ['ai:sessions']);
    expect(noPerm.body.data.result.code).toBe('PERMISSION_DENIED');
  });

  it('reads unread notifications for the person only and marks them read', async () => {
    await InAppNotification.create([
      { userId: me._id, title: 'Quote accepted', body: 'Müller AG accepted Q-12', category: 'SALES' },
      { userId: colleague._id, title: 'Not mine', body: 'other user', category: 'SYSTEM' },
    ]);
    const res = await tool('list_notifications');
    const titles = res.body.data.result.notifications.map((n) => n.title);
    expect(titles).toContain('Quote accepted');
    expect(titles).not.toContain('Not mine');
    const marked = await tool('mark_notifications_read');
    expect(marked.body.data.result.marked).toBeGreaterThanOrEqual(1);
    expect(await InAppNotification.countDocuments({ userId: me._id, isRead: false })).toBe(0);
    expect(await InAppNotification.countDocuments({ userId: colleague._id, isRead: false })).toBe(1);
  });

  it('finds a colleague; contact details only with users:read', async () => {
    const full = await tool('find_employee', { name: 'Thomas' });
    expect(full.body.data.result.people[0]).toMatchObject({ name: 'Thomas Keller', phone: '+41791112233' });
    const limited = await tool('find_employee', { name: 'Thomas' }, ['ai:sessions']);
    expect(limited.body.data.result.people[0].name).toBe('Thomas Keller');
    expect(limited.body.data.result.people[0].phone).toBeUndefined();
  });

  it('builds a daily briefing from the sections the person may see', async () => {
    const res = await tool('get_my_day', {}, ['ai:sessions', 'meetings:read', 'lead:read', 'notifications:feed', 'tasks:read']);
    const r = res.body.data.result;
    expect(r.status).toBe('completed');
    expect(r.followUps).toEqual(expect.objectContaining({ overdue: expect.any(Number), today: expect.any(Number) }));
    expect(Array.isArray(r.meetings)).toBe(true);
    expect(r.tasks).toEqual(expect.objectContaining({ overdueCount: expect.any(Number) }));
    expect(r).not.toHaveProperty('unreadEmails'); // no email:read
    expect(res.body.data.display.kind).toBe('briefing');
  });
});

describe('time handling', () => {
  let tz;
  beforeAll(async () => { tz = await import('../../src/modules/ai/voiceAgent/voiceAgent.tools.js'); });

  it('reads naive date-times in the person\'s zone, honours explicit offsets', () => {
    expect(tz.parseZoned('2026-07-01T14:30', 'Europe/Zurich').toISOString()).toBe('2026-07-01T12:30:00.000Z'); // CEST
    expect(tz.parseZoned('2026-12-01T14:30', 'Europe/Zurich').toISOString()).toBe('2026-12-01T13:30:00.000Z'); // CET
    expect(tz.parseZoned('2026-12-01T14:30', 'Asia/Karachi').toISOString()).toBe('2026-12-01T09:30:00.000Z');
    expect(tz.parseZoned('2026-12-01T14:30:00Z', 'Europe/Zurich').toISOString()).toBe('2026-12-01T14:30:00.000Z');
    expect(tz.parseZoned('2026-12-01T14:30+05:00', 'Europe/Zurich').toISOString()).toBe('2026-12-01T09:30:00.000Z');
    expect(tz.parseZoned('2026-12-01', 'Europe/Zurich').toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(tz.parseZoned('tomorrow', 'Europe/Zurich')).toBeNull();
  });

  it('crosses DST correctly (Zurich, last Sunday of March)', () => {
    expect(tz.parseZoned('2026-03-29T01:30', 'Europe/Zurich').toISOString()).toBe('2026-03-29T00:30:00.000Z');
    expect(tz.parseZoned('2026-03-29T04:00', 'Europe/Zurich').toISOString()).toBe('2026-03-29T02:00:00.000Z');
  });

  it('builds local day ranges and formats local times', () => {
    const now = new Date('2026-11-06T22:30:00Z'); // 23:30 in Zurich, 03:30 next day in Karachi
    const zr = tz.dayRange(null, null, 'Europe/Zurich', now);
    expect(zr.start.toISOString()).toBe('2026-11-05T23:00:00.000Z');
    expect(zr.end.toISOString()).toBe('2026-11-06T23:00:00.000Z');
    const kr = tz.dayRange(null, null, 'Asia/Karachi', now);
    expect(kr.start.toISOString()).toBe('2026-11-06T19:00:00.000Z');
    const span = tz.dayRange('2026-11-09', '2026-11-10', 'Europe/Zurich');
    expect(span.end.toISOString()).toBe('2026-11-10T23:00:00.000Z'); // through the 10th
    expect(tz.localTime('2026-07-01T12:30:00Z', 'Europe/Zurich')).toBe('2026-07-01 14:30');
  });
});

describe('instructions', () => {
  it('carries the person, the date in their zone, the language rule and the safety rules', async () => {
    const { buildVoiceAgentInstructions } = await import('../../src/modules/ai/voiceAgent/voiceAgent.instructions.js');
    const text = buildVoiceAgentInstructions({ userName: 'Salman Admin', role: 'Admin', locale: 'fr', now: new Date('2026-11-06T22:30:00Z'), timeZone: 'Asia/Karachi', pages: ['tasks'] });
    expect(text).toContain('Salman Admin (Admin)');
    expect(text).toContain('2026-11-07'); // Karachi is already tomorrow
    expect(text).toContain('Asia/Karachi');
    expect(text).toMatch(/French/);
    expect(text).toMatch(/confirm_pending_action/);
    expect(text).toMatch(/Never invent data/);
    expect(text).toContain('open_page accepts: tasks');
  });
});

describe('reply language', () => {
  let bridge;
  beforeAll(async () => { bridge = await import('../../src/modules/ai/voiceAgent/voiceAgent.agentBridge.js'); });

  it('translates the spoken fields, keeps everything else', async () => {
    const invoke = jest.fn(async (messages) => {
      expect(messages[0].content).toContain('"en"');
      const items = JSON.parse(messages[1].content);
      return { content: JSON.stringify(items.map((t) => `EN:${t}`)) };
    });
    const out = await bridge.localizeSummary(
      { status: 'needs_follow_up', message: 'Welchen Kunden?', followUpQuestions: ['Bitte Kunde angeben.'], candidates: { customers: [{ label: 'Müller AG' }] } },
      'en',
      { invoke },
    );
    expect(out.message).toBe('EN:Welchen Kunden?');
    expect(out.followUpQuestions).toEqual(['EN:Bitte Kunde angeben.']);
    expect(out.candidates.customers[0].label).toBe('Müller AG');
  });

  it('skips German and falls back to the original on failure or timeout', async () => {
    const invoke = jest.fn();
    expect(await bridge.translateTexts(['Hallo'], 'de', { invoke })).toEqual(['Hallo']);
    expect(invoke).not.toHaveBeenCalled();
    expect(await bridge.translateTexts(['Hallo'], 'en', { invoke: async () => { throw new Error('down'); } })).toEqual(['Hallo']);
    expect(await bridge.translateTexts(['Hallo'], 'en', { invoke: async () => ({ content: '["a","b"]' }) })).toEqual(['Hallo']); // wrong length
  });

  it('crm_request passes reply_language through to the result', async () => {
    const run = await AgentRun.create({
      userId: me._id, threadId: 'thread-1', workflowType: 'FIELD_SERVICE_AGENT', status: 'COMPLETED', input: 'x',
      idempotencyKey: new mongoose.Types.ObjectId().toString(), correlationId: new mongoose.Types.ObjectId().toString(),
      output: { status: 'completed', message: 'Erledigt.' },
    });
    agentRun.mockResolvedValueOnce({ agentRunId: String(run._id) });
    // German conversation: no translation call is made, text stays as is.
    const res = await tool('crm_request', { request: 'Zeige Aufgaben', reply_language: 'de' });
    expect(res.body.data.result.message).toBe('Erledigt.');
    expect(res.body.data.result.language_note).toBeTruthy();
  });
});
