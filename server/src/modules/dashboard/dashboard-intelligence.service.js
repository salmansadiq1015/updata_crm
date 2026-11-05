import mongoose from 'mongoose';
import { normalizeAnalyticsFilters, fillTimeline, dateBucketExpression } from './dashboard.service.js';
import { ACTIVE_STATUSES } from '../inboundCalling/engine/stateMachine.js';

const sumIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
const inStates = (field, states) => ({ $in: [`$${field}`, states] });
const count = (rows) => Number(rows?.[0]?.count) || 0;
const range = (filters) => ({ createdAt: { $gte: filters.startDate, $lte: filters.endDate } });

async function facet(model, match, facets) {
  const rows = await model.aggregate([{ $match: match }, { $facet: facets }]);
  return rows[0] || {};
}

function breakdown(rows = []) {
  return rows.map(row => ({ id: String(row._id ?? 'unknown'), value: row.count, count: row.count }));
}

async function activity(model, match, filters, stateField, conditions) {
  const metrics = Object.fromEntries(Object.entries(conditions).map(([key, condition]) => [key, sumIf(condition)]));
  const result = await facet(model, { ...match, ...range(filters) }, {
    totals: [{ $group: { _id: null, total: { $sum: 1 }, ...metrics } }],
    trend: [{ $group: { _id: dateBucketExpression('createdAt', filters.granularity), total: { $sum: 1 }, ...metrics } }, { $sort: { _id: 1 } }],
    breakdown: [{ $group: { _id: `$${stateField}`, count: { $sum: 1 } } }, { $sort: { count: -1 } }],
  });
  const { _id: _ignored, ...totals } = result.totals?.[0] || {};
  return {
    metrics: { total: 0, ...Object.fromEntries(Object.keys(conditions).map(key => [key, 0])), ...totals },
    trend: fillTimeline(result.trend, filters, ['total', ...Object.keys(conditions)]),
    breakdown: breakdown(result.breakdown),
  };
}

/** Read-only, permission-gated summaries. Personal/owner scopes match each source workspace.
 * Call test records are excluded. Period metrics use createdAt; inventory/live counts are separate.
 */
export async function getDashboardIntelligence(rawFilters, viewer, dependencies = {}) {
  const filters = normalizeAnalyticsFilters(rawFilters, dependencies.now || new Date());
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
      const [calls, agents, campaigns] = await Promise.all([
        activity(model('CallRecord'), production, filters, 'state', {
          completed: { $eq: ['$state', 'completed'] }, answered: { $ne: [{ $ifNull: ['$answeredAt', null] }, null] },
          qualified: { $eq: ['$qualification', 'qualified'] }, failed: { $eq: ['$state', 'failed'] },
        }),
        facet(model('CallingAgent'), own, { total: [{ $count: 'count' }], active: [{ $match: { availability: 'active' } }, { $count: 'count' }] }),
        facet(model('CallCampaign'), production, { active: [{ $match: { status: { $in: ['queued', 'scheduled', 'running', 'paused'] } } }, { $count: 'count' }] }),
      ]);
      return { ...calls, inventory: { agents: count(agents.total), activeAgents: count(agents.active), activeCampaigns: count(campaigns.active) } };
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
        model('InboundCall').aggregate([{ $match: { ...match, status: { $in: [...ACTIVE_STATUSES] } } }, { $count: 'count' }]),
      ]);
      return { ...calls, scope: viewer.inboundAll ? 'team' : 'personal', inventory: { live: count(live) } };
    }),
    section('leads', async () => {
      const match = { ...own, isDeleted: { $ne: true } };
      const [leads, inventory, followUps] = await Promise.all([
        activity(model('Lead'), match, filters, 'status', {
          qualified: { $eq: ['$status', 'qualified'] }, converted: { $eq: ['$status', 'converted'] },
        }),
        facet(model('Lead'), match, { total: [{ $count: 'count' }], pipeline: [{ $group: { _id: '$status', count: { $sum: 1 } } }] }),
        model('LeadFollowUp').aggregate([{ $match: { ownerId: owner, status: { $in: ['open', 'snoozed'] }, nextDueAt: { $lt: dependencies.now || new Date() } } }, { $count: 'count' }]),
      ]);
      return { ...leads, inventory: { total: count(inventory.total), overdueFollowUps: count(followUps) }, pipeline: breakdown(inventory.pipeline) };
    }),
  ]);
  return result;
}
