import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  businessDateKey,
  fillTimeline,
  getAnalyticsSnapshot,
  normalizeAnalyticsFilters,
} from '../../src/modules/dashboard/dashboard.service.js';
import { getDashboardIntelligence } from '../../src/modules/dashboard/dashboard-intelligence.service.js';
import { cachedDashboardRead } from '../../src/modules/dashboard/dashboard.cache.js';
import { analyticsQuerySchema } from '../../src/modules/dashboard/dashboard.validation.js';
import cacheManager from '../../src/shared/cache/CacheManager.js';

// 2026-11-12 11:00 in Zurich (CET, UTC+1). The 30-day period is 14 Oct – 12 Nov
// business time; 14 Oct is still CEST (UTC+2).
const NOW = new Date('2026-11-12T10:00:00.000Z');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

describe('dashboard periods are computed in business time (Europe/Zurich)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => { process.env.TZ = originalTz; });

  test.each(['UTC', 'Asia/Karachi', 'America/Los_Angeles', 'Europe/Zurich'])('identical boundaries and buckets when the host runs in %s', (tz) => {
    process.env.TZ = tz;
    const filters = normalizeAnalyticsFilters({ range: '30d', granularity: 'day' }, NOW);
    expect(filters.startDate.toISOString()).toBe('2026-10-13T22:00:00.000Z'); // 14 Oct 00:00 CEST
    expect(filters.endDate.toISOString()).toBe('2026-11-12T22:59:59.999Z'); // 12 Nov 23:59:59.999 CET
    expect(filters.previousEndDate.getTime()).toBe(filters.startDate.getTime() - 1);
    expect(filters.previousStartDate.toISOString()).toBe('2026-09-13T22:00:00.000Z'); // 30 days earlier
    const timeline = fillTimeline([], filters, ['n']);
    expect(timeline).toHaveLength(30);
    expect(timeline[0]).toMatchObject({ key: '2026-10-14', label: '14 Oct' });
    expect(timeline.at(-1)).toMatchObject({ key: '2026-11-12', label: '12 Nov' });
    expect(businessDateKey(new Date('2026-11-12T23:30:00.000Z'))).toBe('2026-11-13'); // already tomorrow in Zurich
  });

  test('12-month periods are equally long and back to back', () => {
    const filters = normalizeAnalyticsFilters({ range: '12m' }, NOW);
    expect(filters.granularity).toBe('month');
    expect(filters.startDate.toISOString()).toBe('2025-11-12T23:00:00.000Z'); // 13 Nov 2025
    expect(filters.previousStartDate.toISOString()).toBe('2024-11-12T23:00:00.000Z'); // 13 Nov 2024
    const timeline = fillTimeline([], filters, ['n']);
    expect(timeline.map((point) => point.key)).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
      '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    ]);
  });

  test('month buckets never skip a month when the period starts late in a month', () => {
    // 7 days ending 2 Mar start on 24 Feb: both February and March must be buckets
    // (stepping "24 Feb + 1 month" used to land after the end and drop March).
    const filters = normalizeAnalyticsFilters({ range: '7d', granularity: 'month' }, new Date('2026-03-02T10:00:00.000Z'));
    expect(fillTimeline([], filters, ['n']).map((point) => point.key)).toEqual(['2026-02', '2026-03']);
    const quarter = normalizeAnalyticsFilters({ range: '90d', granularity: 'month' }, new Date('2026-05-30T10:00:00.000Z'));
    expect(fillTimeline([], quarter, ['n']).map((point) => point.key)).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  test('ISO week buckets match MongoDB %G-W%V keys across a year boundary', () => {
    const filters = normalizeAnalyticsFilters({ range: '30d', granularity: 'week' }, new Date('2027-01-10T10:00:00.000Z'));
    const keys = fillTimeline([], filters, ['n']).map((point) => point.key);
    expect(keys).toContain('2026-W53');
    expect(keys.at(-1)).toBe('2027-W01');
  });
});

describe('dashboard analytics against a real MongoDB', () => {
  let mongod; let connection; let models;
  const at = (iso) => new Date(iso);
  const names = ['Customer', 'Project', 'Quotation', 'Order', 'Invoice', 'Task', 'Assignment', 'ApInvoice', 'BankTransaction', 'JournalEntry', 'AuditLog', 'User'];

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongod.getUri()).asPromise();
    models = Object.fromEntries(names.map((name) => [name, connection.model(name, new mongoose.Schema({}, { strict: false }))]));

    await models.Invoice.collection.insertMany([
      // 12 Nov 23:30 Zurich — today, the last bucket (was dropped on UTC/PKT hosts).
      { isDeleted: false, status: 'SENT', grandTotal: 100, amountDue: 100, invoiceDate: at('2026-11-12T22:30:00Z'), dueDate: at('2026-11-12T20:00:00Z') },
      // 14 Oct 00:30 Zurich — first day of the period.
      { isDeleted: false, status: 'PAID', grandTotal: 50, amountDue: 0, invoiceDate: at('2026-10-13T22:30:00Z'), paidAt: at('2026-10-20T10:00:00Z') },
      // 13 Oct 23:30 Zurich — previous period, paid during the current one.
      { isDeleted: false, status: 'PAID', grandTotalRounded: 40, grandTotal: 39.98, amountDue: 0, invoiceDate: at('2026-10-13T21:30:00Z'), paidAt: at('2026-10-15T10:00:00Z') },
      // Due later today: outstanding, not overdue.
      { isDeleted: false, status: 'SENT', grandTotal: 30, amountDue: 30, invoiceDate: at('2026-09-01T10:00:00Z'), dueDate: at('2026-11-12T20:00:00Z') },
      { isDeleted: false, status: 'CANCELLED', grandTotal: 999, amountDue: 0, invoiceDate: at('2026-11-01T10:00:00Z') },
      { isDeleted: true, status: 'SENT', grandTotal: 999, amountDue: 999, invoiceDate: at('2026-11-01T10:00:00Z') },
    ]);
    await models.Task.collection.insertMany([
      { isDeleted: false, status: 'OPEN', priority: 'HIGH', dueDate: at('2026-11-12T09:00:00Z'), createdAt: at('2026-11-01T10:00:00Z') }, // overdue + due today
      { isDeleted: false, status: 'OPEN', priority: 'LOW', dueDate: at('2026-11-12T20:00:00Z'), createdAt: at('2026-09-01T10:00:00Z') }, // due later today
      { isDeleted: false, status: 'COMPLETED', priority: 'LOW', completedAt: at('2026-11-02T10:00:00Z'), createdAt: at('2026-09-01T10:00:00Z') }, // open at previous end
      { isDeleted: false, status: 'COMPLETED', priority: 'LOW', completedAt: at('2026-10-01T10:00:00Z'), createdAt: at('2026-09-01T10:00:00Z') },
      { isDeleted: true, status: 'OPEN', priority: 'HIGH', dueDate: at('2026-11-01T10:00:00Z'), createdAt: at('2026-11-01T10:00:00Z') },
    ]);
    await models.Quotation.collection.insertMany([
      // Accepted in the period.
      { isDeleted: false, status: 'ACCEPTED', grandTotal: 10, acceptedAt: at('2026-11-01T10:00:00Z'), createdAt: at('2026-10-20T10:00:00Z'), updatedAt: at('2026-11-01T10:00:00Z') },
      // Accepted months ago, merely edited today: not an acceptance in this period.
      { isDeleted: false, status: 'CONVERTED', grandTotal: 10, acceptedAt: at('2026-05-01T10:00:00Z'), createdAt: at('2026-04-20T10:00:00Z'), updatedAt: at('2026-11-12T09:00:00Z') },
      { isDeleted: false, status: 'DECLINED', grandTotal: 10, declinedAt: at('2026-11-03T10:00:00Z'), createdAt: at('2026-10-20T10:00:00Z'), updatedAt: at('2026-11-03T10:00:00Z') },
      { isDeleted: false, status: 'SENT', grandTotal: 25, createdAt: at('2026-11-05T10:00:00Z'), updatedAt: at('2026-11-05T10:00:00Z') },
    ]);
    const customers = [];
    for (let i = 0; i < 8; i += 1) customers.push({ isDeleted: false, status: 'active', type: 'business', city: 'Bern', createdAt: at('2026-01-01T10:00:00Z') });
    customers.push({ isDeleted: false, status: 'active', type: 'private', city: 'Zürich', createdAt: at('2026-11-10T10:00:00Z') });
    customers.push({ isDeleted: false, status: 'inactive', type: 'private', city: '', createdAt: at('2026-11-11T10:00:00Z') });
    customers.push({ isDeleted: true, status: 'active', type: 'private', city: 'Bern', createdAt: at('2026-11-11T10:00:00Z') });
    await models.Customer.collection.insertMany(customers);
    await models.Assignment.collection.insertMany([
      { isDeleted: false, status: 'PLANNED', assignmentType: 'SERVICE_CALL', startDatetime: at('2026-11-12T15:00:00Z'), endDatetime: at('2026-11-12T17:00:00Z') }, // today, later
      { isDeleted: false, status: 'CONFIRMED', assignmentType: 'SERVICE_CALL', startDatetime: at('2026-10-13T08:00:00Z'), endDatetime: at('2026-10-13T09:00:00Z') }, // last day of previous period
      { isDeleted: false, status: 'CONFIRMED', assignmentType: 'SERVICE_CALL', startDatetime: at('2026-11-15T08:00:00Z'), endDatetime: at('2026-11-15T09:00:00Z') }, // upcoming
    ]);
    await models.ApInvoice.collection.insertMany([
      { isDeleted: false, status: 'APPROVED', outstandingAmount: 70, totalAmount: 70, invoiceDate: at('2026-09-01T10:00:00Z'), dueDate: at('2026-11-12T20:00:00Z') },
      { isDeleted: false, status: 'PAID', outstandingAmount: 0, totalAmount: 20, invoiceDate: at('2026-09-01T10:00:00Z'), dueDate: at('2026-10-01T10:00:00Z'), updatedAt: at('2026-11-01T10:00:00Z') },
    ]);
    await models.AuditLog.collection.insertMany([
      { timestamp: at('2026-11-12T22:30:00Z'), result: 'failure', eventType: 'LOGIN', module: 'auth', email: 'a@x.ch' },
      { timestamp: at('2026-11-01T10:00:00Z'), result: 'success', eventType: 'LOGIN', module: 'auth', email: 'a@x.ch' },
      { timestamp: at('2026-10-01T10:00:00Z'), result: 'failure', eventType: 'LOGIN', module: 'auth', email: 'a@x.ch' },
    ]);
    await models.JournalEntry.collection.insertMany([
      { entryDate: at('2026-11-01T10:00:00Z'), amount: 120, referenceType: 'INVOICE' },
      { entryDate: at('2026-10-01T10:00:00Z'), amount: 60, referenceType: 'INVOICE' },
    ]);
    await models.BankTransaction.collection.insertMany([
      { reconciliationStatus: 'UNMATCHED', transactionDate: at('2026-11-01T10:00:00Z'), amount: 15 },
      { reconciliationStatus: 'AUTO_MATCHED', transactionDate: at('2026-11-02T10:00:00Z'), amount: -5 },
    ]);
  });
  afterAll(async () => { await connection?.close(); await mongod?.stop(); });

  const snapshot = (raw = { range: '30d', granularity: 'day' }) => getAnalyticsSnapshot(raw, { now: NOW, models });

  test('period totals use business-day boundaries and equal the sum of their trend', async () => {
    const data = await snapshot();
    expect(data.warnings).toEqual([]);
    const { invoices } = data.sales;
    expect(invoices.revenue).toBe(150); // 100 (today 23:30) + 50 (first day 00:30)
    expect(invoices.invoiceCount).toBe(2);
    expect(invoices.previousRevenue).toBe(40); // grandTotalRounded wins
    expect(invoices.revenueDelta).toBe(275);
    expect(invoices.trend.reduce((sum, point) => sum + point.revenue, 0)).toBe(invoices.revenue);
    expect(invoices.trend.at(-1)).toMatchObject({ key: '2026-11-12', revenue: 100 });
    expect(invoices.trend[0]).toMatchObject({ key: '2026-10-14', revenue: 50 });
    expect(data.system.audit.trend.reduce((sum, point) => sum + point.failures, 0)).toBe(data.system.audit.failures);
    expect(data.system.audit).toMatchObject({ successes: 1, failures: 1, failureDelta: 0 });
  });

  test('overdue means due before now; due later today is not overdue', async () => {
    const data = await snapshot();
    expect(data.tasks).toMatchObject({ total: 4, open: 2, overdue: 1, dueToday: 2, completedCurrent: 1 });
    expect(data.sales.invoices).toMatchObject({ outstanding: 130, outstandingCount: 2, overdue: 0, overdueCount: 0 });
    expect(data.accounting).toMatchObject({ openPayables: 70, overduePayables: 0, overduePayablesCount: 0, unmatchedBankTransactions: 1 });
    expect(data.scheduling).toMatchObject({ today: 1, todayPrevious: 1, upcoming: 1, unconfirmed: 1 });
  });

  test('quote decisions are dated by their status stamps, not by later edits', async () => {
    const { quotations } = (await snapshot()).sales;
    expect(quotations).toMatchObject({ total: 4, open: 1, openValue: 25, acceptedCurrent: 1, acceptedPrevious: 0, conversionRate: 50 });
  });

  test('overview KPIs compare each value with the same metric at the end of the previous period', async () => {
    const { kpis } = (await snapshot()).overview;
    const byId = Object.fromEntries(kpis.map((item) => [item.id, item]));
    expect(byId.revenue).toMatchObject({ value: 150, previousValue: 40, delta: 275 });
    // 10 live customers, 2 added this period -> 8 at the end of the previous period.
    expect(byId.customers).toMatchObject({ value: 10, previousValue: 8, delta: 25 });
    // 2 open tasks now; at the previous end: the LOW open task + the one completed on 2 Nov.
    expect(byId.openTasks).toMatchObject({ value: 2, previousValue: 2, delta: 0 });
    expect(byId.scheduleToday).toMatchObject({ value: 1, previousValue: 1, delta: 0 });
    // AR 130 + AP 70 now; previously: open AR issued by then (30) + AR paid since (40)
    // + open AP issued by then (70) + AP paid since (20).
    expect(byId.outstanding).toMatchObject({ value: 200, previousValue: 160, delta: 25 });
    for (const item of kpis) {
      if (item.previousValue > 0) {
        expect(item.delta).toBe(Math.round(((item.value - item.previousValue) / item.previousValue) * 1000) / 10);
      }
    }
  });

  test('breakdowns and the response shape are preserved', async () => {
    const data = await snapshot();
    expect(Object.keys(data)).toEqual(['filters', 'updatedAt', 'warnings', 'overview', 'crm', 'projects', 'sales', 'tasks', 'scheduling', 'accounting', 'system']);
    expect(data.crm.byType).toEqual([
      { id: 'business', label: 'Business', count: 8, value: 8 },
      { id: 'private', label: 'Private', count: 2, value: 2 },
    ]);
    expect(data.crm.topCities.map((row) => row.id)).toEqual(['Bern', 'Zürich']);
    expect(data.accounting.journalByReferenceType).toEqual([{ id: 'INVOICE', label: 'Invoice', count: 1, value: 120 }]);
    expect(data.accounting).toMatchObject({ journalAmount: 120, journalCount: 1, journalDelta: 100 });
    expect(data.overview.financialTrend).toHaveLength(30);
    expect(data.overview.operationsTrend).toHaveLength(30);
  });

  test('covering indexes serve the audit and journal windows without fetching documents', async () => {
    await models.AuditLog.collection.createIndex({ timestamp: 1, result: 1, eventType: 1, module: 1 });
    await models.JournalEntry.collection.createIndex({ entryDate: 1, referenceType: 1, amount: 1 });
    const filters = normalizeAnalyticsFilters({ range: '30d', granularity: 'day' }, NOW);
    const audit = await models.AuditLog.aggregate([
      { $match: { timestamp: { $gte: filters.startDate, $lte: filters.endDate } } },
      { $group: { _id: { b: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'Europe/Zurich' } }, r: '$result', e: '$eventType', m: '$module' }, count: { $sum: 1 } } },
    ]).explain('executionStats');
    expect(JSON.stringify(audit)).toMatch(/"totalDocsExamined":0/);
  });
});

describe('dashboard intelligence', () => {
  let mongod; let connection; let models;
  const owner = new mongoose.Types.ObjectId();
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongod.getUri()).asPromise();
    models = Object.fromEntries(['AgentRun', 'CallRecord', 'CallingAgent', 'CallCampaign', 'InboundCall', 'Lead', 'LeadFollowUp']
      .map((name) => [name, connection.model(name, new mongoose.Schema({}, { strict: false }))]));
    await models.CallRecord.collection.insertMany([
      { createdBy: owner, createdAt: new Date('2026-11-12T22:30:00Z'), state: 'completed', answeredAt: new Date('2026-11-12T22:31:00Z') }, // today 23:30 Zurich
      { createdBy: owner, createdAt: new Date('2026-11-06T22:30:00Z'), state: 'no_answer' }, // 6 Nov 23:30 Zurich: first day of the 7d period
      { createdBy: owner, createdAt: new Date('2026-11-05T22:30:00Z'), state: 'failed' }, // 5 Nov 23:30 Zurich: outside 7d
    ]);
  });
  afterAll(async () => { await connection?.close(); await mongod?.stop(); });

  test('trend buckets cover every counted record and breakdowns add up', async () => {
    const result = await getDashboardIntelligence({ range: '7d', granularity: 'day' }, { id: owner, access: { calling: true } }, { now: NOW, models });
    const { calling } = result;
    expect(calling.available).toBe(true);
    expect(calling.metrics).toMatchObject({ total: 2, completed: 1, answered: 1 });
    expect(calling.trend).toHaveLength(7);
    expect(calling.trend.reduce((sum, point) => sum + point.total, 0)).toBe(calling.metrics.total);
    expect(calling.trend.at(-1)).toMatchObject({ key: '2026-11-12', total: 1 });
    expect(calling.breakdown.reduce((sum, row) => sum + row.count, 0)).toBe(calling.metrics.total);
  });
});

describe('dashboard cache and validation', () => {
  afterEach(() => { jest.restoreAllMocks(); cacheManager.l1.flush(); });

  test('concurrent cold reads share one computation and later reads hit the cache', async () => {
    let calls = 0;
    const compute = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); return { value: calls }; };
    const results = await Promise.all(Array.from({ length: 5 }, () => cachedDashboardRead('test:dashboard:single-flight', compute, { l1Ttl: 30, l2Ttl: 30 })));
    expect(calls).toBe(1);
    expect(results.every((result) => result.value === 1)).toBe(true);
    await cachedDashboardRead('test:dashboard:single-flight', compute, { l1Ttl: 30, l2Ttl: 30 });
    expect(calls).toBe(1);
  });

  test('a broken cache never fails the request', async () => {
    jest.spyOn(cacheManager, 'get').mockRejectedValue(new Error('redis down'));
    jest.spyOn(cacheManager, 'set').mockRejectedValue(new Error('redis down'));
    await expect(cachedDashboardRead('test:dashboard:degraded', async () => ({ ok: true }), { l1Ttl: 5, l2Ttl: 5 })).resolves.toEqual({ ok: true });
  });

  test('query validation accepts the client presets and rejects unknown values', () => {
    expect(analyticsQuerySchema.validate({ range: '90d', granularity: 'week', extra: 'x' }, { stripUnknown: true }).value).toEqual({ range: '90d', granularity: 'week' });
    expect(analyticsQuerySchema.validate({}).value).toEqual({ range: '30d' });
    expect(analyticsQuerySchema.validate({ range: '5y' }).error).toBeDefined();
    expect(analyticsQuerySchema.validate({ granularity: 'hour' }).error).toBeDefined();
  });
});
