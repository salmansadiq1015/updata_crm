import mongoose from 'mongoose';
import { normalizeAnalyticsFilters, fillTimeline, dateBucketExpression, runAggregate, runCount, leadStatusCounts } from './dashboard.service.js';
import { ACTIVE_STATUSES } from '../inboundCalling/engine/stateMachine.js';

const sumIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
const inStates = (field, states) => ({ $in: [`$${field}`, states] });
const range = (filters) => ({ createdAt: { $gte: filters.startDate, $lte: filters.endDate } });

function breakdown(rows = []) {
  return rows.map(row => ({ id: String(row._id ?? 'unknown'), value: row.count, count: row.count }));
}

/** Group rows by `keyOf`, summing `count`; sorted by count desc with a stable id tie-break. */
function countBy(rows, keyOf) {
  const byKey = new Map();
  for (const row of rows) {
    const id = keyOf(row) ?? null;
    const key = id === null ? '\u0000null' : String(id);
    const entry = byKey.get(key) || { _id: id, count: 0 };
    entry.count += Number(row.count) || 0;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => (b.count - a.count) || String(a._id ?? '').localeCompare(String(b._id ?? '')));
}

/**
 * Period activity from ONE indexed pass over the createdAt window: rows are grouped
 * by (timeline bucket, state) and rolled up into totals, the trend and the state
 * breakdown — no $facet, no second read.
 */
async function activity(model, match, filters, stateField, conditions) {
  const metricKeys = Object.keys(conditions);
  const metrics = Object.fromEntries(metricKeys.map((key) => [key, sumIf(conditions[key])]));
  const rows = (await runAggregate(model, [
    { $match: { ...match, ...range(filters) } },
    {
      $group: {
        _id: { bucket: dateBucketExpression('createdAt', filters.granularity), state: `$${stateField}` },
        total: { $sum: 1 },
        ...metrics,
      },
    },
  ])) || [];

  const keys = ['total', ...metricKeys];
  const totals = Object.fromEntries(keys.map((key) => [key, 0]));
  const trendByBucket = new Map();
  for (const row of rows) {
    const bucket = row._id?.bucket;
    const point = trendByBucket.get(bucket) || Object.fromEntries([['_id', bucket], ...keys.map((key) => [key, 0])]);
    for (const key of keys) {
      const value = Number(row[key]) || 0;
      totals[key] += value;
      point[key] += value;
    }
    trendByBucket.set(bucket, point);
  }

  return {
    metrics: totals,
    trend: fillTimeline([...trendByBucket.values()], filters, keys),
    breakdown: breakdown(countBy(rows.map((row) => ({ _id: row._id?.state, count: row.total })), (row) => row._id)),
  };
}

/** Read-only, permission-gated summaries. Personal/owner scopes match each source workspace.
 * Call test records are excluded. Period metrics use createdAt; inventory/live counts are separate.
 */
export async function getDashboardIntelligence(rawFilters, viewer, dependencies = {}) {
  const now = dependencies.now || rawFilters?.now || new Date();
  const filters = normalizeAnalyticsFilters(rawFilters, now);
  const models = dependencies.models;
  const model = name => models ? models[name] : mongoose.model(name);
  const owner = new mongoose.Types.ObjectId(String(viewer.id));
  const own = { createdBy: owner };
  const production = { ...own, isTest: { $ne: true } };
  const warnings = [];
  const result = { filters: { range: filters.range, granularity: filters.granularity }, updatedAt: new Date().toISOString(), warnings };
  async function section(key, load) {
    if (!viewer.access?.[key]) { result[key] = { available: false }; return; }
    try { result[key] = { available: true, scope: 'personal', ...await load() }; }
    catch { result[key] = { available: false, error: true }; warnings.push({ source: key }); }
  }
  await Promise.all([
    section('assistant', () => activity(model('AgentRun'), { userId: owner }, filters, 'status', {
      completed: { $eq: ['$status', 'COMPLETED'] }, failed: { $eq: ['$status', 'FAILED'] },
      awaiting: { $eq: ['$status', 'AWAITING_CONFIRMATION'] }, active: inStates('status', ['PENDING', 'RUNNING']),
    })),
    section('calling', async () => {
      const [calls, agents, activeAgents, activeCampaigns] = await Promise.all([
        activity(model('CallRecord'), production, filters, 'state', {
          completed: { $eq: ['$state', 'completed'] }, answered: { $ne: [{ $ifNull: ['$answeredAt', null] }, null] },
          qualified: { $eq: ['$qualification', 'qualified'] }, failed: { $eq: ['$state', 'failed'] },
        }),
        runCount(model('CallingAgent'), own),
        runCount(model('CallingAgent'), { ...own, availability: 'active' }),
        runCount(model('CallCampaign'), { ...production, status: { $in: ['queued', 'scheduled', 'running', 'paused'] } }),
      ]);
      return { ...calls, inventory: { agents, activeAgents, activeCampaigns } };
    }),
    section('incoming', async () => {
      const scope = viewer.inboundAll ? {} : { $or: [{ createdBy: owner }, { assignedTo: owner }] };
      const match = { ...scope, isTest: { $ne: true } };
      const [calls, live] = await Promise.all([
        activity(model('InboundCall'), match, filters, 'status', {
          answered: { $ne: [{ $ifNull: ['$answeredAt', null] }, null] }, missed: { $eq: ['$status', 'MISSED'] },
          aiHandled: { $eq: ['$outcome', 'handled_by_ai'] }, transferred: { $eq: ['$outcome', 'transferred'] },
          qualified: { $eq: ['$qualification.result', 'QUALIFIED'] },
        }),
        runCount(model('InboundCall'), { ...match, status: { $in: [...ACTIVE_STATUSES] } }),
      ]);
      return { ...calls, scope: viewer.inboundAll ? 'team' : 'personal', inventory: { live } };
    }),
    section('leads', async () => {
      const match = { ...own, isDeleted: { $ne: true } };
      const [leads, pipelineRows, overdueFollowUps] = await Promise.all([
        activity(model('Lead'), match, filters, 'status', {
          qualified: { $eq: ['$status', 'qualified'] }, converted: { $eq: ['$status', 'converted'] },
        }),
        leadStatusCounts(model('Lead'), match, { cache: !models }),
        runCount(model('LeadFollowUp'), { ownerId: owner, status: { $in: ['open', 'snoozed'] }, nextDueAt: { $lt: now } }),
      ]);
      const pipeline = countBy(pipelineRows || [], (row) => row._id);
      const total = pipeline.reduce((sum, row) => sum + row.count, 0);
      return { ...leads, inventory: { total, overdueFollowUps }, pipeline: breakdown(pipeline) };
    }),
  ]);
  return result;
}
