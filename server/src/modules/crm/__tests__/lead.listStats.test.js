import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  jest, describe, it, beforeAll, afterAll, beforeEach, expect,
} from '@jest/globals';

// Leads list / follow-up inbox read paths against a real (in-memory) MongoDB:
// the header KPI endpoint, the generation-keyed aggregate cache and its
// invalidation on writes, the follow-up inbox pipeline (sort before the lead
// join) and summary (grouped per lead), the filter-options validation, the SLA
// sweep's orphan handling and migration 053. Uses the REAL CacheManager (L1).
jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../../shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn(async () => ({})), getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../../config/redis.js', () => {
  const unavailable = () => { throw new Error('Redis disabled in unit tests'); };
  const api = {
    createRedisClient: unavailable, getRedisClient: unavailable, disconnectRedis: async () => {}, isRedisConnected: () => false,
  };
  return { ...api, default: api };
});
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

const DAY = 24 * 60 * 60 * 1000;
let mongod;
let Lead; let LeadFollowUp; let User;
let leadService; let leadRepository; let followUpService; let leadSlaService;
let leadCache; let validate; let leadValidation; let leadRoutes; let migration;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  Lead = (await import('../lead.model.js')).default;
  LeadFollowUp = (await import('../leadFollowUp.model.js')).default;
  User = (await import('../../auth/user.model.js')).default;
  leadRepository = (await import('../lead.repository.js')).default;
  leadService = (await import('../lead.service.js')).default;
  followUpService = (await import('../leadFollowUp.service.js')).default;
  leadSlaService = (await import('../leadSla.service.js')).default;
  leadCache = await import('../leadCache.js');
  ({ validate } = await import('../../../shared/validation/validate.js'));
  leadValidation = await import('../lead.validation.js');
  leadRoutes = (await import('../lead.routes.js')).default;
  migration = await import('../../../migrations/053_lead_list_indexes.js');
  await Promise.all([Lead.init(), LeadFollowUp.init()]);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

let seq = 0;
let owner;
beforeEach(async () => {
  await Promise.all([Lead.deleteMany({}), LeadFollowUp.deleteMany({}), User.deleteMany({})]);
  seq += 1;
  owner = await User.create({
    email: `stats${seq}@example.ch`, passwordHash: 'x', firstName: 'Ada', lastName: 'Owner', role: new mongoose.Types.ObjectId(),
  });
});

function leadDoc(overrides = {}) {
  seq += 1;
  return {
    leadNumber: `L-9${String(seq).padStart(5, '0')}`, name: `Stats Lead ${seq}`, createdBy: owner._id, phone: '+41 44 000 00 00', ...overrides,
  };
}
const fuDoc = (lead, overrides = {}) => {
  const due = overrides.nextDueAt ?? new Date();
  return {
    leadId: lead._id, ownerId: owner._id, createdBy: owner._id, dueAt: due, nextDueAt: due, status: 'open', source: { type: 'manual' }, ...overrides,
  };
};

describe('GET /crm/leads/stats (leadService.getStats)', () => {
  it('counts the visible (live) leads per KPI with every status key present', async () => {
    const now = Date.now();
    const [hot, , unassignedNoPhone] = await Lead.insertMany([
      leadDoc({ status: 'new', assignedTo: owner._id, score: { value: 90, band: 'hot', version: 1, computedAt: new Date() } }),
      leadDoc({ status: 'contacted', assignedTo: owner._id, slaStatus: 'overdue' }),
      leadDoc({ status: 'new', phone: null, mobile: '' }),
      leadDoc({ status: 'qualified', assignedTo: owner._id, phone: null, mobile: '+41 79 000 00 00' }),
    ]);
    // Old lead (not new this week) and a soft-deleted one (invisible everywhere).
    await Lead.collection.updateOne({ _id: unassignedNoPhone._id }, { $set: { createdAt: new Date(now - 30 * DAY) } });
    const [deleted] = await Lead.insertMany([leadDoc({ status: 'new', phone: null, score: { value: 99, band: 'hot', version: 1, computedAt: new Date() } })]);
    await Lead.updateOne({ _id: deleted._id }, { $set: { isDeleted: true } });

    // Follow-ups: due earlier today + overdue count; tomorrow, done, and a
    // deleted lead's do not.
    const endOfToday = new Date(); endOfToday.setHours(24, 0, 0, 0);
    await LeadFollowUp.insertMany([
      fuDoc(hot, { nextDueAt: new Date(now - 2 * DAY) }),
      fuDoc(hot, { nextDueAt: new Date(endOfToday.getTime() - 1000) }),
      fuDoc(hot, { nextDueAt: new Date(endOfToday.getTime() + DAY) }),
      fuDoc(hot, { nextDueAt: new Date(now - DAY), status: 'done' }),
      fuDoc(deleted, { nextDueAt: new Date(now - DAY) }),
    ]);

    const stats = await leadService.getStats();
    expect(stats).toMatchObject({
      total: 4,
      newThisWeek: 3,
      hot: 1,
      unassigned: 1,
      withoutPhone: 1,
      slaOverdue: 1,
      followUpsDueToday: 2,
      byStatus: {
        new: 2, contacted: 1, qualified: 1, unqualified: 0, converted: 0,
      },
    });
  });

  it('serves from cache until a lead or follow-up write bumps the generation', async () => {
    const [lead] = await Lead.insertMany([leadDoc()]);
    const first = await leadService.getStats();
    expect(first.total).toBe(1);

    // A raw driver write bypasses Mongoose → cached value is served (≤ 60 s TTL).
    await Lead.collection.insertOne({ ...leadDoc(), isDeleted: false, status: 'new', createdAt: new Date() });
    expect((await leadService.getStats()).total).toBe(1);

    // Any Mongoose write path invalidates.
    await Lead.updateOne({ _id: lead._id }, { $set: { status: 'contacted' } });
    const afterUpdate = await leadService.getStats();
    expect(afterUpdate.total).toBe(2);
    expect(afterUpdate.byStatus.contacted).toBe(1);

    await LeadFollowUp.create(fuDoc(lead, { nextDueAt: new Date(Date.now() - DAY) }));
    expect((await leadService.getStats()).followUpsDueToday).toBe(1);
  });

  it('is routed before /:id with lead:read', () => {
    const paths = leadRoutes.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);
    expect(paths).toContain('get /stats');
    expect(paths.indexOf('get /stats')).toBeLessThan(paths.indexOf('get /:id'));
  });
});

describe('cached list total / geography facets', () => {
  it('list total and filter options follow writes (generation invalidation)', async () => {
    await Lead.create(leadDoc({ address: { city: 'Lahore', country: 'PK' } }));
    const page = await leadService.list({ limit: 1 });
    expect(page.pagination.total).toBe(1);
    const options = await leadService.getFilterOptions({});
    expect(options.cities.map((c) => c.value)).toEqual(['Lahore']);

    await Lead.create(leadDoc({ address: { city: 'Zürich', country: 'CH' } }));
    expect((await leadService.list({ limit: 1 })).pagination.total).toBe(2);
    const after = await leadService.getFilterOptions({});
    expect(after.cities.map((c) => c.value).sort()).toEqual(['Lahore', 'Zürich']);
    const zurich = after.cities.find((c) => c.value === 'Zürich');
    const filtered = await leadService.list({ limit: 25, cityId: zurich.id });
    expect(filtered.data).toHaveLength(1);
    expect(filtered.pagination.total).toBe(1);
  });

  it('total is the same on every cursor page', async () => {
    await Lead.insertMany(Array.from({ length: 5 }, () => leadDoc()));
    const p1 = await leadService.list({ limit: 2 });
    const p2 = await leadService.list({ limit: 2, cursor: p1.pagination.nextCursor });
    const p3 = await leadService.list({ limit: 2, cursor: p2.pagination.nextCursor });
    expect([p1, p2, p3].map((p) => p.pagination.total)).toEqual([5, 5, 5]);
    const ids = [...p1.data, ...p2.data, ...p3.data].map((l) => String(l._id));
    expect(new Set(ids).size).toBe(5);
    expect(p3.pagination.hasNext).toBe(false);
  });

  it('scopeHash distinguishes different regex searches', () => {
    expect(leadCache.scopeHash({ a: /cafe/i })).not.toBe(leadCache.scopeHash({ a: /bar/i }));
    expect(leadCache.scopeHash({ a: { $regex: 'x' } })).toBe(leadCache.scopeHash({ a: { $regex: 'x' } }));
  });
});

describe('filter-options validation', () => {
  it('keeps scoreBand and slaStatus so facet counts match the list', () => {
    const req = { query: { scoreBand: 'hot', slaStatus: 'overdue', status: 'new', limit: '25' } };
    let error;
    validate(leadValidation.leadFilterOptions)(req, {}, (err) => { error = err; });
    expect(error).toBeUndefined();
    expect(req._validatedQuery).toEqual({ scoreBand: 'hot', slaStatus: 'overdue', status: 'new' });
  });

  it('facet counts honour scoreBand', async () => {
    await Lead.insertMany([
      leadDoc({ type: 'business', score: { value: 90, band: 'hot', version: 1, computedAt: new Date() } }),
      leadDoc({ type: 'business' }),
    ]);
    const options = await leadService.getFilterOptions({ scoreBand: 'hot' });
    expect(options.types).toEqual([{ value: 'business', count: 1 }]);
  });
});

describe('follow-up inbox', () => {
  const viewer = () => ({ id: String(owner._id), isSupervisor: true, department: null });

  it('pages in due order across deleted-lead rows without gaps or duplicates', async () => {
    const leads = await Lead.insertMany(Array.from({ length: 6 }, () => leadDoc()));
    await Lead.updateOne({ _id: leads[1]._id }, { $set: { isDeleted: true } });
    await Lead.updateOne({ _id: leads[3]._id }, { $set: { isDeleted: true } });
    const base = Date.now() - 10 * DAY;
    await LeadFollowUp.insertMany(leads.map((lead, i) => fuDoc(lead, { nextDueAt: new Date(base + i * DAY) })));

    const seen = [];
    let cursor = null;
    do {
      // eslint-disable-next-line no-await-in-loop
      const page = await followUpService.list({ scope: 'all', bucket: 'overdue', limit: 2, cursor }, viewer());
      seen.push(...page.data.map((row) => row.lead.name));
      cursor = page.pagination.nextCursor;
    } while (cursor);
    expect(seen).toEqual([0, 2, 4, 5].map((i) => leads[i].name));
  });

  it('keeps scanning past a full batch of hidden rows and applies lead-side filters', async () => {
    const [gone, live, other] = await Lead.insertMany([
      leadDoc(), leadDoc({ name: 'Zeta Bakery', latestCall: { qualificationStatus: 'QUALIFIED' } }), leadDoc({ name: 'Other Shop' }),
    ]);
    await Lead.updateOne({ _id: gone._id }, { $set: { isDeleted: true } });
    const base = Date.now() - 100 * DAY;
    // 120 follow-ups of a deleted lead come first in due order (> one 50-row batch).
    await LeadFollowUp.insertMany(Array.from({ length: 120 }, (_, i) => fuDoc(gone, { nextDueAt: new Date(base + i * 60000) })));
    await LeadFollowUp.insertMany([
      fuDoc(live, { nextDueAt: new Date(Date.now() - DAY), note: 'ask about ovens' }),
      fuDoc(other, { nextDueAt: new Date(Date.now() - DAY + 1000), note: 'call about zeta order' }),
    ]);
    const all = await followUpService.list({ scope: 'all', bucket: 'overdue', limit: 5 }, viewer());
    expect(all.data.map((r) => r.lead.name)).toEqual(['Zeta Bakery', 'Other Shop']);
    expect(all.pagination.hasNext).toBe(false);
    // q matches the lead name OR the follow-up note (literal, case-insensitive).
    const byQ = await followUpService.list({ scope: 'all', bucket: 'overdue', q: 'ZETA' }, viewer());
    expect(byQ.data.map((r) => r.lead.name)).toEqual(['Zeta Bakery', 'Other Shop']);
    const byNote = await followUpService.list({ scope: 'all', bucket: 'overdue', q: 'ovens' }, viewer());
    expect(byNote.data.map((r) => r.lead.name)).toEqual(['Zeta Bakery']);
    const byQual = await followUpService.list({ scope: 'all', bucket: 'overdue', qualification: 'QUALIFIED' }, viewer());
    expect(byQual.data.map((r) => r.lead.name)).toEqual(['Zeta Bakery']);
    expect(all.data[0].owner.name).toBe('Ada Owner');
  });

  it('summary counts per bucket only for live leads', async () => {
    const [a, b, gone] = await Lead.insertMany([leadDoc(), leadDoc(), leadDoc()]);
    await Lead.updateOne({ _id: gone._id }, { $set: { isDeleted: true } });
    const now = Date.now();
    await LeadFollowUp.insertMany([
      fuDoc(a, { nextDueAt: new Date(now - DAY) }),
      fuDoc(a, { nextDueAt: new Date(now + 5 * DAY) }),
      fuDoc(b, { nextDueAt: new Date(now - DAY), status: 'done', closedAt: new Date() }),
      fuDoc(b, { nextDueAt: new Date(now - DAY), status: 'snoozed', automation: { mode: 'ai', state: 'calling' } }),
      fuDoc(gone, { nextDueAt: new Date(now - DAY) }),
    ]);
    const summary = await followUpService.summary({ scope: 'all', tz: 'UTC' }, viewer());
    expect(summary).toMatchObject({
      overdue: 2, upcoming: 1, done: 1, pending: 3, completed: 1, aiManaged: 1, aiInProgress: 1, totalLeads: 2, qualifiedLeads: 0,
    });
  });
});

describe('SLA sweep orphans', () => {
  it('retires follow-ups of deleted leads so they cannot starve the batch', async () => {
    const [lead] = await Lead.insertMany([leadDoc()]);
    const due = new Date(Date.now() - DAY);
    const fu = await LeadFollowUp.create(fuDoc(lead, { nextDueAt: due }));
    await leadSlaService._retireOrphans([{ _id: fu._id, leadId: lead._id, nextDueAt: due }], new Map(), 'overdueNotifiedFor');
    const stored = await LeadFollowUp.findById(fu._id).lean();
    expect(stored.overdueNotifiedFor).toEqual(due);
    expect(stored.actions).toHaveLength(0);
  });
});

describe('migration 053', () => {
  it('builds the list indexes idempotently and replaces follow_up_sweep', async () => {
    await LeadFollowUp.collection.createIndex({ status: 1, nextDueAt: 1 }, { name: 'follow_up_sweep' });
    await migration.up();
    await migration.up();
    const leadIndexes = (await Lead.collection.indexes()).map((i) => i.name);
    expect(leadIndexes).toEqual(expect.arrayContaining(['lead_list_recent', 'lead_list_business_type', 'lead_list_name']));
    const fuIndexes = (await LeadFollowUp.collection.indexes()).map((i) => i.name);
    expect(fuIndexes).toEqual(expect.arrayContaining(['follow_up_status_due', 'follow_up_closed']));
    expect(fuIndexes).not.toContain('follow_up_sweep');
    await migration.down();
    expect((await LeadFollowUp.collection.indexes()).map((i) => i.name)).toContain('follow_up_sweep');
    await migration.up();
  });
});
