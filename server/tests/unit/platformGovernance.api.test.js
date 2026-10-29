import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * HTTP-level tests for platform governance: team-scoped lead access, PII
 * masking, audited break-glass access / reveal / export, the access log and
 * team administration. Real lead + governance routers, real authenticate /
 * requirePermission against DB roles and the real governance middleware mounted
 * exactly as app.js does. Infrastructure is stubbed: the audit queue writes
 * straight to AuditLog, the cache is an in-memory map, no Redis.
 */
let AuditLogModel = null;
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: {
    addJob: jest.fn(async (_queue, _name, data) => {
      if (AuditLogModel && data?.eventType) {
        await AuditLogModel.create({ ...data, timestamp: new Date(data.timestamp || Date.now()) });
      }
      return {};
    }),
    getQueueStats: jest.fn(async () => ({})),
  },
}));
jest.unstable_mockModule('../../src/config/redis.js', () => {
  const unavailable = () => { throw new Error('Redis disabled in unit tests'); };
  const api = {
    createRedisClient: unavailable, getRedisClient: unavailable, disconnectRedis: async () => {}, isRedisConnected: () => false,
  };
  return { ...api, default: api };
});
jest.unstable_mockModule('../../src/modules/auth/session.service.js', () => ({
  default: { isSessionActive: jest.fn(async () => true), touchSession: jest.fn() },
}));
const memoryCache = new Map();
jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: async (_key, fn) => fn(),
    get: async (key) => (memoryCache.has(key) ? memoryCache.get(key) : null),
    set: async (key, value) => { memoryCache.set(key, value); },
    del: async (key) => { memoryCache.delete(key); },
    invalidate: async () => {},
    invalidatePattern: async () => {},
    l1: { flush: () => {} },
  },
}));

let mongod; let server;
let Lead; let User; let Role; let Permission; let AuditLog; let ContactLog;
let generateAccessToken; let teamService;
let perms = {};
let leadCounter = 0;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const tokenFor = (user) => generateAccessToken({ sub: String(user._id) });
const LEADS = '/api/v1/crm/leads';
const GOV = '/api/v1/governance';
const flush = () => new Promise((resolve) => { setTimeout(resolve, 30); });

async function makeUser(permissionKeys = [], roleName = null) {
  const role = await Role.create({
    name: roleName || `GovRole_${randomUUID()}`,
    permissions: permissionKeys.map((key) => perms[key]._id),
  });
  return User.create({
    email: `gov-${randomUUID()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Gov',
    lastName: 'User',
    role: role._id,
    status: 'active',
  });
}

async function makeLead(overrides = {}) {
  leadCounter += 1;
  return Lead.create({
    leadNumber: `L-${70000 + leadCounter}`,
    name: `Governed ${leadCounter}`,
    source: 'manual',
    phone: '+41 44 123 45 67',
    mobile: '+41 79 765 43 21',
    email: 'jane.doe@example.ch',
    address: { country: 'CH', city: 'Zürich' },
    ...overrides,
  });
}

function setEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const leadRoutes = (await import('../../src/modules/crm/lead.routes.js')).default;
  const governanceRoutes = (await import('../../src/modules/governance/governance.routes.js')).default;
  const { default: leadGovernance, GOVERNED_PATHS } = await import('../../src/modules/governance/governance.middleware.js');
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  AuditLog = (await import('../../src/modules/auth/auditLog.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  ContactLog = (await import('../../src/modules/crm/contactLog.model.js')).default;
  teamService = (await import('../../src/modules/governance/team.service.js')).default;
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  for (const m of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task']) {
    await import(`../../src/modules/${m}.model.js`);
  }
  AuditLogModel = AuditLog;

  // A stand-in AI-calling router: proves the governance middleware refuses PII
  // CSV exports for viewers without lead:pii:view, without loading the module.
  const fakeAiCalling = express.Router();
  const { authenticate } = await import('../../src/shared/middleware/authenticate.js');
  fakeAiCalling.get('/campaigns/:id/export', authenticate, (req, res) => res.type('text/csv').send('phone\n+41791234567\n'));

  const app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use(GOVERNED_PATHS, leadGovernance());
  app.use('/api/v1/crm/leads', leadRoutes);
  app.use('/api/v1/ai-calling', fakeAiCalling);
  app.use('/api/v1/governance', governanceRoutes);
  app.use(errorHandler);
  server = app.listen(0);
}, 120000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  setEnv({ LEAD_ACCESS_MODE: undefined, PII_MASKING_ENABLED: undefined, LEAD_ACCESS_REASON_REQUIRED: undefined });
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) {
    await mongoose.connection.collections[key].deleteMany({});
  }
  memoryCache.clear();
  setEnv({ LEAD_ACCESS_MODE: 'company', PII_MASKING_ENABLED: 'false', LEAD_ACCESS_REASON_REQUIRED: 'true' });
  const defs = [
    ['lead', 'read'], ['lead', 'write'], ['lead', 'delete'], ['lead', 'whatsapp'],
    ['lead', 'read:all'], ['lead', 'pii:view'], ['team', 'read'], ['team', 'manage'], ['audit', 'read'],
  ];
  const created = await Permission.insertMany(defs.map(([module, action]) => ({ module, action, description: `${module}:${action}` })));
  perms = Object.fromEntries(created.map((p) => [`${p.module}:${p.action}`, p]));
});

afterEach(() => { jest.restoreAllMocks(); });

const AGENT = ['lead:read', 'lead:write', 'lead:delete'];

describe('company mode (default) keeps today\'s behaviour', () => {
  it('every lead:read user sees and opens every lead, unmasked, with no reason prompt', async () => {
    const owner = await makeUser(AGENT);
    const other = await makeUser(AGENT);
    const lead = await makeLead({ createdBy: owner._id });

    const list = await request(server).get(LEADS).set(auth(tokenFor(other))).expect(200);
    expect(list.body.data.map((l) => l._id)).toContain(String(lead._id));
    expect(list.body.data[0].phone).toBe('+41 44 123 45 67');
    expect(list.body.data[0].piiMasked).toBeUndefined();

    const detail = await request(server).get(`${LEADS}/${lead._id}`).set(auth(tokenFor(other))).expect(200);
    expect(detail.body.data.email).toBe('jane.doe@example.ch');
  });

  it('still audit-logs lead exports', async () => {
    const user = await makeUser(AGENT);
    await makeLead({ createdBy: user._id });
    await request(server).get(`${LEADS}/export?format=csv`).set(auth(tokenFor(user))).expect(200);
    await flush();
    const entry = await AuditLog.findOne({ eventType: 'governance.data.exported' }).lean();
    expect(entry).toBeTruthy();
    expect(entry.details.piiMasked).toBe(false);
  });
});

describe('team mode — scoped lead access', () => {
  let owner; let stranger; let supervisor; let member; let reader;
  let ownLead; let memberLead; let foreignLead;

  beforeEach(async () => {
    setEnv({ LEAD_ACCESS_MODE: 'team' });
    owner = await makeUser(AGENT);
    stranger = await makeUser(AGENT);
    supervisor = await makeUser(AGENT);
    member = await makeUser(AGENT);
    reader = await makeUser([...AGENT, 'lead:read:all']);
    await teamService.create({
      name: `Team ${randomUUID()}`,
      members: [{ userId: String(supervisor._id), role: 'supervisor' }, { userId: String(member._id), role: 'member' }],
    }, owner._id);
    ownLead = await makeLead({ createdBy: owner._id });
    memberLead = await makeLead({ createdBy: owner._id, assignedTo: member._id });
    foreignLead = await makeLead({ createdBy: stranger._id });
  });

  it('lists only created / assigned / supervised leads', async () => {
    const ids = async (user) => (await request(server).get(LEADS).set(auth(tokenFor(user))).expect(200))
      .body.data.map((l) => l._id).sort();
    expect(await ids(stranger)).toEqual([String(foreignLead._id)]);
    expect(await ids(member)).toEqual([String(memberLead._id)]);
    expect(await ids(supervisor)).toEqual([String(memberLead._id)]);
    expect((await ids(owner)).sort()).toEqual([String(ownLead._id), String(memberLead._id)].sort());
    expect(await ids(reader)).toHaveLength(3);
  });

  it('applies the same scope to the map, filter options and export', async () => {
    const map = await request(server).get(`${LEADS}/map`).set(auth(tokenFor(stranger))).expect(200);
    expect(map.body.data.total).toBe(1);
    const csv = await request(server).get(`${LEADS}/export?format=csv`).set(auth(tokenFor(stranger))).expect(200);
    expect(csv.text).toContain(foreignLead.leadNumber);
    expect(csv.text).not.toContain(ownLead.leadNumber);
  });

  it('scopes the follow-up agenda (scope=all) to visible leads', async () => {
    const at = new Date(Date.now() + 86400000);
    await ContactLog.create({ leadId: ownLead._id, channel: 'phone', subject: 'call back', note: 'call back', editableUntil: at, followUpAt: at, createdBy: owner._id, employeeId: owner._id });
    await ContactLog.create({ leadId: foreignLead._id, channel: 'phone', subject: 'call back', note: 'call back', editableUntil: at, followUpAt: at, createdBy: stranger._id, employeeId: stranger._id });
    const res = await request(server).get(`${LEADS}/follow-ups?scope=all`).set(auth(tokenFor(stranger))).expect(200);
    expect(res.body.data.map((f) => f.leadId)).toEqual([String(foreignLead._id)]);
  });

  it('404s by-id reads and mutations of an out-of-scope lead (existence is not leaked)', async () => {
    const token = tokenFor(stranger);
    await request(server).get(`${LEADS}/${ownLead._id}`).set(auth(token)).expect(404);
    await request(server).patch(`${LEADS}/${ownLead._id}`).set(auth(token)).send({ name: 'Hijack' }).expect(404);
    await request(server).delete(`${LEADS}/${ownLead._id}`).set(auth(token)).expect(404);
    await request(server).get(`${LEADS}/${ownLead._id}/contact-log`).set(auth(token)).expect(404);
    expect((await Lead.findById(ownLead._id).lean()).name).toBe(ownLead.name);
  });

  it('refuses bulk mutations that include an out-of-scope lead', async () => {
    const res = await request(server).post(`${LEADS}/bulk-delete`).set(auth(tokenFor(stranger)))
      .send({ leadIds: [String(foreignLead._id), String(ownLead._id)] }).expect(403);
    expect(res.body.error.code).toBe('LEAD_ACCESS_DENIED');
    expect(await Lead.countDocuments({ isDeleted: true })).toBe(0);
  });

  it('requires a stated reason (break-glass) for a supervised lead, then audits the access', async () => {
    const token = tokenFor(supervisor);
    const blocked = await request(server).get(`${LEADS}/${memberLead._id}`).set(auth(token)).expect(428);
    expect(blocked.body.error.code).toBe('ACCESS_REASON_REQUIRED');

    await request(server).post(`${GOV}/access-grants`).set(auth(token))
      .send({ leadId: String(memberLead._id), reason: 'no' }).expect(400); // reason too short
    const grant = await request(server).post(`${GOV}/access-grants`).set(auth(token))
      .send({ leadId: String(memberLead._id), reason: 'Coaching review of member call' }).expect(201);
    expect(grant.body.data.required).toBe(true);

    await request(server).get(`${LEADS}/${memberLead._id}`).set(auth(token)).expect(200);
    await request(server).get(`${LEADS}/${memberLead._id}`).set(auth(token)).expect(200);
    await flush();
    const granted = await AuditLog.find({ eventType: 'governance.access.granted' }).lean();
    expect(granted).toHaveLength(1);
    expect(granted[0].details).toMatchObject({ leadId: String(memberLead._id), reason: 'Coaching review of member call' });
    const accessed = await AuditLog.find({ eventType: 'governance.access.cross_ownership' }).lean();
    expect(accessed).toHaveLength(1); // once per action per grant window
    expect(accessed[0].details).toMatchObject({ action: 'lead.view', reason: 'Coaching review of member call' });
  });

  it('cannot open a grant for a lead outside the scope', async () => {
    await request(server).post(`${GOV}/access-grants`).set(auth(tokenFor(stranger)))
      .send({ leadId: String(ownLead._id), reason: 'Just curious about it' }).expect(404);
  });

  it('own leads need no reason; lead:read:all users still state one for others\' leads', async () => {
    await request(server).get(`${LEADS}/${ownLead._id}`).set(auth(tokenFor(owner))).expect(200);
    await request(server).get(`${LEADS}/${foreignLead._id}`).set(auth(tokenFor(reader))).expect(428);
  });

  it('LEAD_ACCESS_REASON_REQUIRED=false admits supervisors without a prompt but still audits', async () => {
    setEnv({ LEAD_ACCESS_REASON_REQUIRED: 'false' });
    await request(server).get(`${LEADS}/${memberLead._id}`).set(auth(tokenFor(supervisor))).expect(200);
    await flush();
    const accessed = await AuditLog.findOne({ eventType: 'governance.access.cross_ownership' }).lean();
    expect(accessed.details).toMatchObject({ leadId: String(memberLead._id), reason: null });
  });

  it('exposes supervisors and members for assignment / escalation', async () => {
    expect(await teamService.getSupervisorsFor(member._id)).toEqual([String(supervisor._id)]);
    const team = (await teamService.list())[0];
    expect((await teamService.getMembers(team.id)).map((m) => m.role).sort()).toEqual(['member', 'supervisor']);
  });

  it('shared unassigned pools are visible to team members only', async () => {
    const pooled = await makeLead({ createdBy: stranger._id, source: 'import' });
    const team = (await teamService.list())[0];
    await teamService.update(team.id, { leadScope: { shareUnassigned: true, sources: ['import'] } }, owner._id);
    const ids = (await request(server).get(LEADS).set(auth(tokenFor(member))).expect(200)).body.data.map((l) => l._id);
    expect(ids).toContain(String(pooled._id));
    const outsiderIds = (await request(server).get(LEADS).set(auth(tokenFor(owner))).expect(200)).body.data.map((l) => l._id);
    expect(outsiderIds).not.toContain(String(pooled._id));
  });
});

describe('PII masking', () => {
  let viewer; let privileged; let lead;

  beforeEach(async () => {
    setEnv({ PII_MASKING_ENABLED: 'true' });
    viewer = await makeUser(AGENT);
    privileged = await makeUser([...AGENT, 'lead:pii:view']);
    lead = await makeLead({ createdBy: viewer._id });
  });

  it('masks phone / mobile / e-mail in list, detail and map for viewers without lead:pii:view', async () => {
    const token = tokenFor(viewer);
    const list = await request(server).get(LEADS).set(auth(token)).expect(200);
    expect(list.body.data[0]).toMatchObject({ phone: '+41 *** ***4567', mobile: '+41 *** ***4321', email: 'j***@example.ch', piiMasked: true });
    expect(JSON.stringify(list.body)).not.toContain('765 43 21');
    const detail = await request(server).get(`${LEADS}/${lead._id}`).set(auth(token)).expect(200);
    expect(detail.body.data.phone).toBe('+41 *** ***4567');
    expect(detail.body.data.name).toBe(lead.name);
    const map = await request(server).get(`${LEADS}/map`).set(auth(token)).expect(200);
    expect(map.body.data.leads[0].email).toBe('j***@example.ch');
  });

  it('returns raw values to holders of lead:pii:view', async () => {
    const res = await request(server).get(`${LEADS}/${lead._id}`).set(auth(tokenFor(privileged))).expect(200);
    expect(res.body.data.phone).toBe('+41 44 123 45 67');
    expect(res.body.data.piiMasked).toBeUndefined();
  });

  it('masks lead export rows without the permission and audits the export either way', async () => {
    const masked = await request(server).get(`${LEADS}/export?format=csv`).set(auth(tokenFor(viewer))).expect(200);
    expect(masked.text).toContain('+41 *** ***4567');
    expect(masked.text).not.toContain('123 45 67');
    const raw = await request(server).get(`${LEADS}/export?format=csv`).set(auth(tokenFor(privileged))).expect(200);
    expect(raw.text).toContain('+41 44 123 45 67');
    await flush();
    const audits = await AuditLog.find({ eventType: 'governance.data.exported' }).sort({ timestamp: 1 }).lean();
    expect(audits.map((a) => a.details.piiMasked)).toEqual([true, false]);
  });

  it('refuses PII CSV exports it cannot mask (AI calling) without the permission', async () => {
    const res = await request(server).get('/api/v1/ai-calling/campaigns/abc/export').set(auth(tokenFor(viewer))).expect(403);
    expect(res.body.error.code).toBe('PII_PERMISSION_REQUIRED');
    // Case-variant paths are routed by Express too and must not bypass the rule.
    await request(server).get('/API/V1/AI-CALLING/campaigns/abc/EXPORT').set(auth(tokenFor(viewer))).expect(403);
    await request(server).get('/api/v1/ai-calling/campaigns/abc/export').set(auth(tokenFor(privileged))).expect(200);
    await flush();
    expect(await AuditLog.countDocuments({ eventType: 'governance.export.denied' })).toBe(2);
  });

  it('reveal-for-action returns the raw value for the purpose and audits it', async () => {
    const res = await request(server).post(`${GOV}/leads/${lead._id}/reveal`).set(auth(tokenFor(viewer)))
      .send({ purpose: 'call', fields: ['mobile'] }).expect(200);
    expect(res.body.data.values).toEqual({ mobile: '+41 79 765 43 21' });
    expect(res.headers['cache-control']).toBe('no-store');
    await flush();
    const entry = await AuditLog.findOne({ eventType: 'governance.pii.revealed', result: 'success' }).lean();
    expect(entry.details).toMatchObject({ leadId: String(lead._id), purpose: 'call', fields: ['mobile'] });
  });

  it('reveal for viewing requires lead:pii:view; the refusal is audited', async () => {
    await request(server).post(`${GOV}/leads/${lead._id}/reveal`).set(auth(tokenFor(viewer)))
      .send({ purpose: 'view' }).expect(403);
    await flush();
    expect(await AuditLog.countDocuments({ eventType: 'governance.pii.revealed', result: 'failure' })).toBe(1);
    const ok = await request(server).post(`${GOV}/leads/${lead._id}/reveal`).set(auth(tokenFor(privileged)))
      .send({ purpose: 'view' }).expect(200);
    expect(ok.body.data.values.email).toBe('jane.doe@example.ch');
  });

  it('WhatsApp action still receives the server-resolved number', async () => {
    const whatsapp = await makeUser([...AGENT, 'lead:whatsapp']);
    const ownLead = await makeLead({ createdBy: whatsapp._id });
    const res = await request(server).post(`${LEADS}/${ownLead._id}/whatsapp`).set(auth(tokenFor(whatsapp))).send({}).expect(200);
    expect(res.body.data.waNumber).toBe('41441234567');
  });
});

describe('access log + team administration permissions', () => {
  it('lists governance events filtered by lead; requires audit:read', async () => {
    setEnv({ LEAD_ACCESS_MODE: 'team' });
    const auditor = await makeUser(['lead:read', 'audit:read', 'lead:read:all']);
    const plain = await makeUser(['lead:read']);
    const lead = await makeLead({ createdBy: plain._id });
    await request(server).post(`${GOV}/access-grants`).set(auth(tokenFor(auditor)))
      .send({ leadId: String(lead._id), reason: 'Compliance spot check' }).expect(201);
    await flush();

    await request(server).get(`${GOV}/access-log`).set(auth(tokenFor(plain))).expect(403);
    const res = await request(server).get(`${GOV}/access-log?leadId=${lead._id}&action=grant`).set(auth(tokenFor(auditor))).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ leadId: String(lead._id), reason: 'Compliance spot check', userName: 'Gov User' });
    const perLead = await request(server).get(`${GOV}/leads/${lead._id}/access-log`).set(auth(tokenFor(auditor))).expect(200);
    expect(perLead.body.data[0].leadName).toContain(lead.name);
  });

  it('team CRUD requires team:manage; a team manager may edit only membership', async () => {
    const admin = await makeUser(['team:manage']);
    const manager = await makeUser([]);
    const someone = await makeUser([]);
    await request(server).post(`${GOV}/teams`).set(auth(tokenFor(someone))).send({ name: 'Sales' }).expect(403);
    const created = await request(server).post(`${GOV}/teams`).set(auth(tokenFor(admin)))
      .send({ name: 'Sales', members: [{ userId: String(manager._id), role: 'manager' }] }).expect(201);
    const id = created.body.data.id;
    await request(server).post(`${GOV}/teams`).set(auth(tokenFor(admin))).send({ name: 'sales' }).expect(409);
    await request(server).patch(`${GOV}/teams/${id}`).set(auth(tokenFor(manager)))
      .send({ members: [{ userId: String(manager._id), role: 'manager' }, { userId: String(someone._id), role: 'member' }] }).expect(200);
    await request(server).patch(`${GOV}/teams/${id}`).set(auth(tokenFor(manager))).send({ name: 'Renamed' }).expect(403);
    await request(server).patch(`${GOV}/teams/${id}`).set(auth(tokenFor(someone)))
      .send({ members: [] }).expect(403);
    await request(server).post(`${GOV}/teams`).set(auth(tokenFor(admin)))
      .send({ name: 'Ghosts', members: [{ userId: String(new mongoose.Types.ObjectId()) }] }).expect(400);
  });

  it('settings report the effective modes for the caller', async () => {
    setEnv({ PII_MASKING_ENABLED: 'true' });
    const viewer = await makeUser(['lead:read']);
    const res = await request(server).get(`${GOV}/settings`).set(auth(tokenFor(viewer))).expect(200);
    expect(res.body.data).toMatchObject({ leadAccessMode: 'company', piiMaskingEnabled: true, piiMaskedForMe: true, canViewPii: false });
  });
});
