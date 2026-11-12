import mongoose from 'mongoose';
import { cachedLeadAggregate } from '../crm/leadCache.js';

const TIMEZONE = 'Europe/Zurich';
const DAY_MS = 24 * 60 * 60 * 1000;

export const DASHBOARD_RANGE_PRESETS = Object.freeze({
  '7d': { days: 7, defaultGranularity: 'day' },
  '30d': { days: 30, defaultGranularity: 'day' },
  '90d': { days: 90, defaultGranularity: 'week' },
  '12m': { months: 12, defaultGranularity: 'month' },
});

const SUPPORTED_GRANULARITIES = new Set(['day', 'week', 'month']);
const OPEN_QUOTATION_STATUSES = ['DRAFT', 'SENT', 'VIEWED'];
const ACTIVE_PROJECT_STATUSES = [
  'DRAFT',
  'PLANNING',
  'SCHEDULED',
  'WAITING_FOR_MATERIAL',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_QUOTATION_APPROVAL',
  'ON_HOLD',
];
const ACTIVE_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD'];
const OPEN_INVOICE_STATUSES = ['DRAFT', 'FINALIZED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'];
const OPEN_AP_STATUSES = ['RECORDED', 'APPROVED', 'PARTIALLY_PAID', 'DISPUTED'];
const ACTIVE_ASSIGNMENT_STATUSES = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'PAUSED'];

/* ------------------------------------------------------------------------- *
 * Business-calendar date math
 *
 * Day/week/month boundaries are computed in the business time zone
 * (Europe/Zurich) — the same zone MongoDB uses for `$dateToString` bucket
 * keys — independent of the server process TZ. Mixing the two (local-TZ
 * boundaries vs Zurich bucket keys) silently dropped late-evening records from
 * the trend and shifted period totals on any host not running in Zurich time.
 * A "civil date" is a plain { year, month (1-12), day } in that zone.
 * ------------------------------------------------------------------------- */

const zoneFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
});
const dayLabelFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const monthLabelFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function zonedParts(instant) {
  const parts = {};
  for (const part of zoneFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

/** Offset (ms) of the business zone from UTC at `epochMs`. */
function zoneOffsetAt(epochMs) {
  const wholeSeconds = Math.floor(epochMs / 1000) * 1000;
  const p = zonedParts(new Date(wholeSeconds));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - wholeSeconds;
}

export function civilDate(value) {
  const p = zonedParts(new Date(value));
  return { year: p.year, month: p.month, day: p.day };
}

/** Business date (YYYY-MM-DD, Europe/Zurich) — cache keys roll over at local midnight. */
export function businessDateKey(now = new Date()) {
  const { year, month, day } = civilDate(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function civilFromUtcMs(epochMs) {
  const date = new Date(epochMs);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function civilUtcMs(civil) {
  return Date.UTC(civil.year, civil.month - 1, civil.day);
}

function addCivilDays(civil, days) {
  return civilFromUtcMs(Date.UTC(civil.year, civil.month - 1, civil.day + days));
}

/** Calendar-month arithmetic, clamping to the target month's last day (31 Mar - 1m = 28/29 Feb). */
function addCivilMonths(civil, months) {
  const first = civilFromUtcMs(Date.UTC(civil.year, civil.month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.year, first.month, 0)).getUTCDate();
  return { ...first, day: Math.min(civil.day, lastDay) };
}

/** UTC instant of 00:00 business time on `civil` (midnight always exists in Europe/Zurich). */
function zonedMidnight(civil) {
  const wallClock = civilUtcMs(civil);
  let instant = wallClock - zoneOffsetAt(wallClock);
  instant = wallClock - zoneOffsetAt(instant);
  return new Date(instant);
}

function startOfDay(value) {
  return zonedMidnight(civilDate(value));
}

function endOfDay(value) {
  return new Date(zonedMidnight(addCivilDays(civilDate(value), 1)).getTime() - 1);
}

function weekStart(civil) {
  const weekday = new Date(civilUtcMs(civil)).getUTCDay();
  return addCivilDays(civil, -(weekday === 0 ? 6 : weekday - 1));
}

function getIsoWeekKey(civil) {
  const date = new Date(civilUtcMs(civil));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getBucketKey(civil, granularity) {
  const month = String(civil.month).padStart(2, '0');
  if (granularity === 'month') return `${civil.year}-${month}`;
  if (granularity === 'week') return getIsoWeekKey(civil);
  return `${civil.year}-${month}-${String(civil.day).padStart(2, '0')}`;
}

function getBucketLabel(key, granularity) {
  if (granularity === 'month') {
    const [year, month] = key.split('-').map(Number);
    return monthLabelFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
  }
  if (granularity === 'week') return key.replace('-W', ' W');
  const [year, month, day] = key.split('-').map(Number);
  return dayLabelFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Period filters. The current period is the last N calendar days / months
 * ending today (business time); the previous period is the equally long span
 * immediately before it, so period-over-period deltas compare like with like.
 * `now` is carried along (not sent to clients) for "as of now" cut-offs.
 */
export function normalizeAnalyticsFilters(raw = {}, now = new Date()) {
  if (raw?.startDate instanceof Date && raw?.endDate instanceof Date) {
    return raw;
  }

  const range = DASHBOARD_RANGE_PRESETS[raw?.range] ? raw.range : '30d';
  const preset = DASHBOARD_RANGE_PRESETS[range];
  const today = civilDate(now);
  const startCivil = preset.months
    ? addCivilDays(addCivilMonths(today, -preset.months), 1)
    : addCivilDays(today, -(preset.days - 1));
  const previousStartCivil = preset.months
    ? addCivilMonths(startCivil, -preset.months)
    : addCivilDays(startCivil, -preset.days);
  const startDate = zonedMidnight(startCivil);
  const granularity = SUPPORTED_GRANULARITIES.has(raw?.granularity)
    ? raw.granularity
    : preset.defaultGranularity;

  return {
    range,
    granularity,
    startDate,
    endDate: endOfDay(now),
    previousStartDate: zonedMidnight(previousStartCivil),
    previousEndDate: new Date(startDate.getTime() - 1),
    now: new Date(now),
  };
}

export function calculateDelta(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (previousValue === 0) return currentValue > 0 ? 100 : 0;
  return Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
}

const bucketCache = new Map();

/** Timeline buckets (memoized per period; callers copy before mutating). */
function createBuckets(filters) {
  const cacheKey = `${filters.granularity}:${filters.startDate.getTime()}:${filters.endDate.getTime()}`;
  const cached = bucketCache.get(cacheKey);
  if (cached) return cached;

  const granularity = filters.granularity;
  const last = civilUtcMs(civilDate(filters.endDate));
  let cursor = civilDate(filters.startDate);
  if (granularity === 'week') cursor = weekStart(cursor);
  if (granularity === 'month') cursor = { ...cursor, day: 1 };

  const buckets = [];
  while (civilUtcMs(cursor) <= last) {
    const key = getBucketKey(cursor, granularity);
    buckets.push(Object.freeze({ key, label: getBucketLabel(key, granularity) }));
    cursor = granularity === 'month'
      ? addCivilMonths(cursor, 1)
      : addCivilDays(cursor, granularity === 'week' ? 7 : 1);
  }

  if (bucketCache.size > 64) bucketCache.clear();
  bucketCache.set(cacheKey, buckets);
  return buckets;
}

export function fillTimeline(rows = [], filters, metrics = ['count']) {
  const byKey = new Map(rows.map((row) => [String(row?._id || row?.key || ''), row || {}]));

  return createBuckets(filters).map((bucket) => {
    const row = byKey.get(bucket.key) || {};
    const point = { ...bucket };
    metrics.forEach((metric) => {
      point[metric] = roundMetric(row[metric]);
    });
    return point;
  });
}

function mergeTimelines(filters, groups) {
  const seed = createBuckets(filters).map((bucket) => ({ ...bucket }));
  const byKey = new Map(seed.map((point) => [point.key, point]));

  groups.forEach(({ rows = [], metrics = [] }) => {
    rows.forEach((row) => {
      const key = String(row?._id || row?.key || '');
      const point = byKey.get(key);
      if (!point) return;
      metrics.forEach((metric) => {
        point[metric] = roundMetric(row[metric]);
      });
    });
  });

  return seed.map((point) => {
    groups.forEach(({ metrics = [] }) => {
      metrics.forEach((metric) => {
        if (point[metric] == null) point[metric] = 0;
      });
    });
    return point;
  });
}

function toClientFilters(filters) {
  return {
    range: filters.range,
    granularity: filters.granularity,
    startDate: filters.startDate.toISOString(),
    endDate: filters.endDate.toISOString(),
  };
}

function rangeMatch(field, filters, previous = false) {
  return {
    [field]: {
      $gte: previous ? filters.previousStartDate : filters.startDate,
      $lte: previous ? filters.previousEndDate : filters.endDate,
    },
  };
}

export function dateBucketExpression(field, granularity) {
  const format = granularity === 'month'
    ? '%Y-%m'
    : granularity === 'week'
    ? '%G-W%V'
    : '%Y-%m-%d';

  return {
    $dateToString: {
      format,
      date: `$${field}`,
      timezone: TIMEZONE,
    },
  };
}

function sumExpression(fields) {
  const fieldList = Array.isArray(fields) ? fields : [fields];
  return fieldList.reduceRight((fallback, field) => ({ $ifNull: [`$${field}`, fallback] }), 0);
}

function roundMetric(value) {
  const number = Number(value) || 0;
  return Math.round(number * 100) / 100;
}

function normalizeBreakdown(rows = [], valueKey = 'count') {
  return rows.map((row) => ({
    id: String(row?._id || 'unknown'),
    label: humanize(row?._id || 'unknown'),
    count: Number(row?.count) || 0,
    value: roundMetric(row?.[valueKey] ?? row?.value ?? row?.count),
  }));
}

function humanize(value) {
  return String(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/* ------------------------------------------------------------------------- *
 * Query plumbing
 *
 * Every source is read with index-friendly queries: a bounded date window
 * (`windowAggregate`) for period metrics/trends, one `$group` pass for status
 * inventories, and `countDocuments` for plain counts. No `$facet` over a whole
 * collection (a leading `$facet` cannot use an index and drags every document
 * through every branch), no `$lookup`, no per-row queries.
 *
 * All dashboard DB work goes through one small concurrency gate so a cold
 * snapshot never occupies the whole Mongo pool (maxPoolSize 10) and starves
 * regular API requests.
 * ------------------------------------------------------------------------- */

const DB_CONCURRENCY = 4;
let activeQueries = 0;
const queryQueue = [];

function acquireQuerySlot() {
  if (activeQueries < DB_CONCURRENCY) {
    activeQueries += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => queryQueue.push(resolve));
}

function releaseQuerySlot() {
  const next = queryQueue.shift();
  if (next) next();
  else activeQueries -= 1;
}

async function gated(fn) {
  await acquireQuerySlot();
  try {
    return await fn();
  } finally {
    releaseQuerySlot();
  }
}

export async function runAggregate(model, pipeline) {
  return gated(async () => {
    const aggregate = model.aggregate(pipeline);
    if (aggregate && typeof aggregate.allowDiskUse === 'function') {
      return aggregate.allowDiskUse(true);
    }
    return aggregate;
  });
}

export async function runCount(model, filter) {
  return gated(async () => Number(await model.countDocuments(filter)) || 0);
}

const asExpression = (field) => (typeof field === 'string' ? `$${field}` : field);

/** `field` (name or expression) is a BSON date inside [from, to] — the expression twin of a `$match` range. */
function dateBetween(field, from, to) {
  const value = asExpression(field);
  return { $and: [{ $eq: [{ $type: value }, 'date'] }, { $gte: [value, from] }, { $lte: [value, to] }] };
}

/** `field` is a BSON date strictly before `bound` (null / missing never count). */
function dateBefore(field, bound) {
  const value = asExpression(field);
  return { $and: [{ $eq: [{ $type: value }, 'date'] }, { $lt: [value, bound] }] };
}

/** `field` is a BSON date strictly after `bound`. */
function dateAfter(field, bound) {
  const value = asExpression(field);
  return { $and: [{ $eq: [{ $type: value }, 'date'] }, { $gt: [value, bound] }] };
}

/**
 * "As of now" cut-off for overdue / upcoming metrics. Overdue means due before
 * this instant — the rule the Tasks and AR modules use — not "before the end of
 * today", which counted everything due later today as already overdue.
 */
function asOf(filters) {
  return filters.now instanceof Date ? filters.now : new Date();
}

function sumIf(condition, value = 1) {
  return { $sum: { $cond: [condition, value, 0] } };
}

function inValues(field, values) {
  return { $in: [`$${field}`, values] };
}

function toNumber(value) {
  return Number(value) || 0;
}

/** Sum `keys` across grouped rows (optionally filtered). */
function sumRows(rows, keys, predicate = () => true) {
  const totals = Object.fromEntries(keys.map((key) => [key, 0]));
  rows.forEach((row) => {
    if (!predicate(row)) return;
    keys.forEach((key) => {
      totals[key] += toNumber(row[key]);
    });
  });
  return totals;
}

/**
 * Roll grouped rows up by `keyOf(row)` into breakdown rows `{ _id, count, value }`,
 * sorted by `sortKey` desc with a deterministic id tie-break.
 */
function rollup(rows, keyOf, { count = 'count', value = null, predicate = () => true, sortKey = 'count', limit = null } = {}) {
  const byKey = new Map();
  rows.forEach((row) => {
    if (!predicate(row)) return;
    const id = keyOf(row) ?? null;
    const mapKey = id === null ? '\u0000null' : String(id);
    const entry = byKey.get(mapKey) || { _id: id, count: 0, value: 0 };
    entry.count += toNumber(row[count]);
    if (value) entry.value += toNumber(row[value]);
    byKey.set(mapKey, entry);
  });
  const sorted = [...byKey.values()].sort((a, b) => (
    (b[sortKey] - a[sortKey]) || String(a._id ?? '').localeCompare(String(b._id ?? ''))
  ));
  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * One indexed pass over the period window. Documents in the current period are
 * grouped per timeline bucket; documents in the previous period collapse into a
 * single `_id: null` row. `field` must be indexed (optionally behind the
 * equality prefix in `match`).
 */
async function windowAggregate(model, match, field, filters, accumulators, { previous = true } = {}) {
  const rows = await runAggregate(model, [
    {
      $match: {
        ...match,
        [field]: { $gte: previous ? filters.previousStartDate : filters.startDate, $lte: filters.endDate },
      },
    },
    {
      $group: {
        _id: {
          $cond: [{ $gte: [`$${field}`, filters.startDate] }, dateBucketExpression(field, filters.granularity), null],
        },
        ...accumulators,
      },
    },
  ]);
  const keys = Object.keys(accumulators);
  const trend = (rows || []).filter((row) => row?._id !== null && row?._id !== undefined);
  const previousRow = (rows || []).find((row) => row?._id === null || row?._id === undefined) || {};
  return {
    trend,
    current: sumRows(trend, keys),
    previous: sumRows([previousRow], keys),
  };
}

function getDashboardModels() {
  return {
    Customer: mongoose.model('Customer'),
    Project: mongoose.model('Project'),
    Quotation: mongoose.model('Quotation'),
    Order: mongoose.model('Order'),
    Invoice: mongoose.model('Invoice'),
    Task: mongoose.model('Task'),
    Assignment: mongoose.model('Assignment'),
    ApInvoice: mongoose.model('ApInvoice'),
    BankTransaction: mongoose.model('BankTransaction'),
    JournalEntry: mongoose.model('JournalEntry'),
    AuditLog: mongoose.model('AuditLog'),
    User: mongoose.model('User'),
  };
}

async function withWarning(warnings, source, fallback, fn) {
  try {
    return await fn();
  } catch (error) {
    warnings.push({
      source,
      message: error?.message || 'Analytics source unavailable',
    });
    return fallback;
  }
}

async function getLegacyStats(models) {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  const [customers, projects, openQuotes, todayTasks] = await Promise.all([
    runCount(models.Customer, { isDeleted: false }),
    runCount(models.Project, { isDeleted: false }),
    runCount(models.Quotation, { isDeleted: false, status: { $in: OPEN_QUOTATION_STATUSES } }),
    runCount(models.Task, {
      isDeleted: false,
      status: { $in: ['OPEN', 'IN_PROGRESS'] },
      dueDate: { $gte: todayStart, $lte: todayEnd },
    }),
  ]);

  return { customers, projects, openQuotes, todayTasks };
}

/**
 * Lead counts per status for `match`. Leads are the one source with an exact
 * write-generation cache (leadCache.js: every Lead write through Mongoose bumps
 * it), so the O(leads) group is reused across viewers and endpoints until a lead
 * actually changes. `cache: false` (injected test models) computes directly.
 */
export async function leadStatusCounts(Lead, match, { cache = true } = {}) {
  const compute = async () => (await runAggregate(Lead, [
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])) || [];
  return cache ? cachedLeadAggregate('dashboard-status-counts', match, compute) : compute();
}

/**
 * Compact mobile CRM snapshot. Lead totals are company-wide (the same scope as
 * GET /crm/leads); AI campaign/call totals are scoped to the authenticated
 * creator, exactly like the AI Calling read APIs.
 */
export async function getMobileCrmStats(actor, dependencies = {}) {
  const models = dependencies.models || {
    Lead: mongoose.model('Lead'),
    CallCampaign: mongoose.model('CallCampaign'),
    CallRecord: mongoose.model('CallRecord'),
  };
  const now = dependencies.now || new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const actorId = new mongoose.Types.ObjectId(actor);

  const [leadRows, activeCampaigns, callsCompletedToday] = await Promise.all([
    leadStatusCounts(models.Lead, { isDeleted: false }, { cache: !dependencies.models }),
    runCount(models.CallCampaign, {
      createdBy: actorId,
      isTest: false,
      status: { $in: ['scheduled', 'running', 'paused'] },
    }),
    runCount(models.CallRecord, {
      createdBy: actorId,
      isTest: false,
      endedAt: { $gte: todayStart, $lte: todayEnd },
      state: { $in: ['completed', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled'] },
    }),
  ]);

  const leads = { total: 0, new: 0, contacted: 0, qualified: 0, unqualified: 0, converted: 0 };
  for (const row of leadRows || []) {
    const count = Number(row?.count) || 0;
    if (Object.hasOwn(leads, row?._id)) leads[row._id] = count;
    leads.total += count;
  }

  return {
    leads,
    qualificationRate: leads.total ? Number((leads.qualified / leads.total).toFixed(3)) : null,
    conversionRate: leads.total ? Number((leads.converted / leads.total).toFixed(3)) : null,
    activeCampaigns: Number(activeCampaigns) || 0,
    callsCompletedToday: Number(callsCompletedToday) || 0,
    updatedAt: now.toISOString(),
  };
}

async function getCustomerAnalytics(Customer, filters) {
  const match = { isDeleted: false };
  const [total, active, inventory, window] = await Promise.all([
    runCount(Customer, match),
    runCount(Customer, { ...match, status: 'active' }),
    runAggregate(Customer, [
      { $match: match },
      { $group: { _id: { type: '$type', city: '$city' }, count: { $sum: 1 } } },
    ]),
    windowAggregate(Customer, match, 'createdAt', filters, { customers: { $sum: 1 } }),
  ]);

  const rows = inventory || [];
  const newCurrent = window.current.customers;
  const newPrevious = window.previous.customers;

  return {
    total,
    active,
    newCurrent,
    newPrevious,
    delta: calculateDelta(newCurrent, newPrevious),
    byType: normalizeBreakdown(rollup(rows, (row) => row._id?.type ?? 'unknown')),
    topCities: normalizeBreakdown(rollup(rows, (row) => row._id?.city, {
      predicate: (row) => row._id?.city != null && row._id.city !== '',
      limit: 6,
    })),
    trend: fillTimeline(window.trend, filters, ['customers']),
  };
}

async function getProjectAnalytics(Project, filters) {
  const match = { isDeleted: false };
  const budget = sumExpression('estimatedBudget');
  const isActive = inValues('status', ACTIVE_PROJECT_STATUSES);
  const [inventory, window] = await Promise.all([
    runAggregate(Project, [
      { $match: match },
      {
        $group: {
          _id: { status: '$status', type: '$projectType' },
          count: { $sum: 1 },
          budget: { $sum: budget },
          overdue: sumIf({ $and: [isActive, dateBefore('plannedEndDate', asOf(filters))] }),
          completed: sumIf({
            $and: [inValues('status', ['COMPLETED', 'INVOICED']), dateBetween('updatedAt', filters.startDate, filters.endDate)],
          }),
          // Active at the end of the previous period: existed then and is still
          // active, or has been closed since (updatedAt is the closing proxy,
          // the same one `completed` uses).
          activePrevious: sumIf({
            $and: [
              dateBefore('createdAt', filters.startDate),
              {
                $or: [
                  isActive,
                  { $and: [inValues('status', ['COMPLETED', 'INVOICED', 'ARCHIVED']), dateAfter('updatedAt', filters.previousEndDate)] },
                ],
              },
            ],
          }),
        },
      },
    ]),
    windowAggregate(Project, match, 'createdAt', filters, { projects: { $sum: 1 }, budget: { $sum: budget } }),
  ]);

  const rows = inventory || [];
  const active = (row) => ACTIVE_PROJECT_STATUSES.includes(row._id?.status);
  const totals = sumRows(rows, ['count', 'overdue', 'completed', 'activePrevious']);
  const activeTotals = sumRows(rows, ['count', 'budget'], active);
  const newCurrent = window.current.projects;
  const newPrevious = window.previous.projects;

  return {
    total: totals.count,
    active: activeTotals.count,
    activePrevious: totals.activePrevious,
    newCurrent,
    newPrevious,
    delta: calculateDelta(newCurrent, newPrevious),
    completed: totals.completed,
    budget: roundMetric(activeTotals.budget),
    overdue: totals.overdue,
    onHold: sumRows(rows, ['count'], (row) => row._id?.status === 'ON_HOLD').count,
    byStatus: normalizeBreakdown(rollup(rows, (row) => row._id?.status)),
    byType: normalizeBreakdown(rollup(rows, (row) => row._id?.type, { value: 'budget' }), 'value'),
    trend: fillTimeline(window.trend, filters, ['projects', 'budget']),
  };
}

const MONEY = sumExpression(['grandTotalRounded', 'grandTotal']);

async function getSalesAnalytics(models, filters) {
  const quoteMatch = { isDeleted: false };
  const orderMatch = { isDeleted: false };
  const invoiceMatch = { isDeleted: false };
  const accepted = inValues('status', ['ACCEPTED', 'CONVERTED']);
  // Decision dates come from the status stamps; updatedAt (any later edit) is only
  // the fallback for legacy quotes without a stamp.
  const acceptedOn = { $ifNull: ['$acceptedAt', '$updatedAt'] };
  const declinedOn = { $ifNull: ['$declinedAt', '$updatedAt'] };
  const amountDue = sumExpression('amountDue');
  const issuedBeforePeriod = dateBefore('invoiceDate', filters.startDate);

  const [quoteRows, quoteWindow, orderRows, orderWindow, invoiceRows, invoiceWindow] = await Promise.all([
    runAggregate(models.Quotation, [
      { $match: quoteMatch },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          value: { $sum: MONEY },
          acceptedCurrent: sumIf({ $and: [accepted, dateBetween(acceptedOn, filters.startDate, filters.endDate)] }),
          acceptedPrevious: sumIf({ $and: [accepted, dateBetween(acceptedOn, filters.previousStartDate, filters.previousEndDate)] }),
          declinedCurrent: sumIf({ $and: [{ $eq: ['$status', 'DECLINED'] }, dateBetween(declinedOn, filters.startDate, filters.endDate)] }),
        },
      },
    ]),
    windowAggregate(models.Quotation, quoteMatch, 'createdAt', filters, {
      quotes: { $sum: 1 },
      quoteValue: { $sum: MONEY },
    }, { previous: false }),
    runAggregate(models.Order, [
      { $match: orderMatch },
      { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: MONEY } } },
    ]),
    windowAggregate(models.Order, orderMatch, 'createdAt', filters, {
      orders: { $sum: 1 },
      orderValue: { $sum: MONEY },
      billableValue: { $sum: { $cond: [{ $ne: ['$status', 'CANCELLED'] }, MONEY, 0] } },
    }),
    runAggregate(models.Invoice, [
      { $match: invoiceMatch },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          value: { $sum: MONEY },
          due: { $sum: amountDue },
          overdueCount: sumIf(dateBefore('dueDate', asOf(filters))),
          overdueValue: sumIf(dateBefore('dueDate', asOf(filters)), amountDue),
          // Receivables open at the end of the previous period: issued by then and
          // still open (current amount due), or paid only after it (full amount).
          dueIssuedBeforePeriod: sumIf(issuedBeforePeriod, amountDue),
          paidAfterPreviousPeriod: sumIf({ $and: [issuedBeforePeriod, dateAfter('paidAt', filters.previousEndDate)] }, MONEY),
        },
      },
    ]),
    windowAggregate(models.Invoice, { ...invoiceMatch, status: { $nin: ['CANCELLED', 'WRITTEN_OFF'] } }, 'invoiceDate', filters, {
      invoices: { $sum: 1 },
      revenue: { $sum: MONEY },
    }),
  ]);

  const quotes = quoteRows || [];
  const quoteTotals = sumRows(quotes, ['count', 'acceptedCurrent', 'acceptedPrevious', 'declinedCurrent']);
  const openQuotes = sumRows(quotes, ['count', 'value'], (row) => OPEN_QUOTATION_STATUSES.includes(row._id));
  const { acceptedCurrent, acceptedPrevious, declinedCurrent } = quoteTotals;
  const quoteDecisionTotal = acceptedCurrent + declinedCurrent;

  const orders = orderRows || [];
  const ordersCurrent = orderWindow.current.orders;
  const ordersPrevious = orderWindow.previous.orders;

  const invoices = invoiceRows || [];
  const openInvoice = (row) => OPEN_INVOICE_STATUSES.includes(row._id);
  const outstanding = sumRows(invoices, ['count', 'due', 'overdueCount', 'overdueValue', 'dueIssuedBeforePeriod'], openInvoice);
  const paidSincePreviousPeriod = sumRows(invoices, ['paidAfterPreviousPeriod'], (row) => row._id === 'PAID');
  const revenue = roundMetric(invoiceWindow.current.revenue);
  const previousRevenue = roundMetric(invoiceWindow.previous.revenue);

  return {
    quotations: {
      total: quoteTotals.count,
      open: openQuotes.count,
      openValue: roundMetric(openQuotes.value),
      acceptedCurrent,
      acceptedPrevious,
      acceptedDelta: calculateDelta(acceptedCurrent, acceptedPrevious),
      conversionRate: quoteDecisionTotal > 0 ? Math.round((acceptedCurrent / quoteDecisionTotal) * 1000) / 10 : 0,
      byStatus: normalizeBreakdown(rollup(quotes, (row) => row._id, { value: 'value' }), 'value'),
      trend: fillTimeline(quoteWindow.trend, filters, ['quotes', 'quoteValue']),
    },
    orders: {
      total: sumRows(orders, ['count']).count,
      current: ordersCurrent,
      previous: ordersPrevious,
      delta: calculateDelta(ordersCurrent, ordersPrevious),
      valueCurrent: roundMetric(orderWindow.current.billableValue),
      byStatus: normalizeBreakdown(rollup(orders, (row) => row._id, { value: 'value' }), 'value'),
      trend: fillTimeline(orderWindow.trend, filters, ['orders', 'orderValue']),
    },
    invoices: {
      total: sumRows(invoices, ['count']).count,
      revenue,
      previousRevenue,
      revenueDelta: calculateDelta(revenue, previousRevenue),
      invoiceCount: invoiceWindow.current.invoices,
      outstanding: roundMetric(outstanding.due),
      outstandingPrevious: roundMetric(outstanding.dueIssuedBeforePeriod + paidSincePreviousPeriod.paidAfterPreviousPeriod),
      outstandingCount: outstanding.count,
      overdue: roundMetric(outstanding.overdueValue),
      overdueCount: outstanding.overdueCount,
      byStatus: normalizeBreakdown(rollup(invoices, (row) => row._id, { value: 'value' }), 'value'),
      trend: fillTimeline(invoiceWindow.trend, filters, ['invoices', 'revenue']),
    },
  };
}

async function getTaskAnalytics(Task, filters) {
  const isActive = inValues('status', ACTIVE_TASK_STATUSES);
  const isCompleted = { $eq: ['$status', 'COMPLETED'] };
  const todayStart = startOfDay(filters.endDate);
  const closedAfterPreviousPeriod = {
    $or: [
      { $and: [isCompleted, dateAfter({ $ifNull: ['$completedAt', '$updatedAt'] }, filters.previousEndDate)] },
      { $and: [{ $eq: ['$status', 'CANCELLED'] }, dateAfter('updatedAt', filters.previousEndDate)] },
    ],
  };
  // Task has no index that serves `isDeleted` + these fields, so read the live
  // set exactly once and derive every metric from a single $group.
  const rows = (await runAggregate(Task, [
    { $match: { isDeleted: false } },
    {
      $group: {
        _id: {
          status: '$status',
          priority: '$priority',
          created: {
            $cond: [dateBetween('createdAt', filters.startDate, filters.endDate), dateBucketExpression('createdAt', filters.granularity), null],
          },
          completed: {
            $cond: [
              { $and: [isCompleted, dateBetween('completedAt', filters.startDate, filters.endDate)] },
              dateBucketExpression('completedAt', filters.granularity),
              null,
            ],
          },
        },
        count: { $sum: 1 },
        // Same rules as the Tasks module: overdue = due before now; due today =
        // due on today's business date (a task due earlier today is both).
        overdue: sumIf({ $and: [isActive, dateBefore('dueDate', asOf(filters))] }),
        dueToday: sumIf({ $and: [isActive, dateBetween('dueDate', todayStart, filters.endDate)] }),
        completedPrevious: sumIf({ $and: [isCompleted, dateBetween('completedAt', filters.previousStartDate, filters.previousEndDate)] }),
        // Open at the end of the previous period: existed then and is still open,
        // or was completed / cancelled only afterwards.
        openPrevious: sumIf({
          $and: [dateBefore('createdAt', filters.startDate), { $or: [isActive, closedAfterPreviousPeriod] }],
        }),
      },
    },
  ])) || [];

  const active = (row) => ACTIVE_TASK_STATUSES.includes(row._id?.status);
  const totals = sumRows(rows, ['count', 'overdue', 'dueToday', 'completedPrevious', 'openPrevious']);
  const completedCurrent = sumRows(rows, ['count'], (row) => row._id?.completed != null).count;
  const completedPrevious = totals.completedPrevious;
  const createdTrend = rollup(rows, (row) => row._id?.created, { predicate: (row) => row._id?.created != null })
    .map((row) => ({ _id: row._id, created: row.count }));
  const completedTrend = rollup(rows, (row) => row._id?.completed, { predicate: (row) => row._id?.completed != null })
    .map((row) => ({ _id: row._id, completed: row.count }));

  return {
    total: totals.count,
    open: sumRows(rows, ['count'], active).count,
    openPrevious: totals.openPrevious,
    overdue: totals.overdue,
    dueToday: totals.dueToday,
    completedCurrent,
    completedPrevious,
    completedDelta: calculateDelta(completedCurrent, completedPrevious),
    byStatus: normalizeBreakdown(rollup(rows, (row) => row._id?.status)),
    byPriority: normalizeBreakdown(rollup(rows, (row) => row._id?.priority, { predicate: active })),
    trend: mergeTimelines(filters, [
      { rows: createdTrend, metrics: ['created'] },
      { rows: completedTrend, metrics: ['completed'] },
    ]),
  };
}

const ASSIGNMENT_HOURS = { $divide: [{ $subtract: ['$endDatetime', '$startDatetime'] }, 3600000] };

async function getSchedulingAnalytics(Assignment, filters) {
  const match = { isDeleted: false };
  const todayStart = startOfDay(filters.endDate);
  const todayEnd = endOfDay(filters.endDate);
  const nextWeekEnd = endOfDay(new Date(filters.endDate.getTime() + 7 * DAY_MS));
  const notCancelled = { $ne: ['$status', 'CANCELLED'] };

  const [total, unconfirmed, todayPrevious, inventory, windowRows] = await Promise.all([
    runCount(Assignment, match),
    // Still-unconfirmed appointments that have not started yet (from now, not from tomorrow).
    runCount(Assignment, { ...match, status: 'PLANNED', startDatetime: { $gte: asOf(filters) } }),
    // "Today" one period earlier: the last day of the previous period.
    runCount(Assignment, { ...match, startDatetime: { $gte: startOfDay(filters.previousEndDate), $lte: filters.previousEndDate } }),
    runAggregate(Assignment, [
      { $match: match },
      { $group: { _id: { status: '$status', type: '$assignmentType' }, count: { $sum: 1 } } },
    ]),
    // One indexed read of [period start, today + 7d]: the period trend/hours,
    // today's appointments and the upcoming week.
    runAggregate(Assignment, [
      { $match: { ...match, startDatetime: { $gte: filters.startDate, $lte: nextWeekEnd } } },
      {
        $group: {
          _id: {
            $cond: [{ $lte: ['$startDatetime', filters.endDate] }, dateBucketExpression('startDatetime', filters.granularity), null],
          },
          assignments: { $sum: 1 },
          hours: { $sum: ASSIGNMENT_HOURS },
          billableHours: sumIf(notCancelled, ASSIGNMENT_HOURS),
          today: sumIf(dateBetween('startDatetime', todayStart, todayEnd)),
          upcoming: sumIf({
            $and: [inValues('status', ACTIVE_ASSIGNMENT_STATUSES), dateAfter('startDatetime', todayEnd), dateBetween('startDatetime', todayEnd, nextWeekEnd)],
          }),
        },
      },
    ]),
  ]);

  const rows = inventory || [];
  const window = windowRows || [];
  const inPeriod = (row) => row?._id !== null && row?._id !== undefined;
  const windowTotals = sumRows(window, ['today', 'upcoming']);

  return {
    total,
    today: windowTotals.today,
    todayPrevious,
    upcoming: windowTotals.upcoming,
    unconfirmed,
    hours: roundMetric(sumRows(window, ['billableHours'], inPeriod).billableHours),
    byStatus: normalizeBreakdown(rollup(rows, (row) => row._id?.status)),
    byType: normalizeBreakdown(rollup(rows, (row) => row._id?.type)),
    trend: fillTimeline(window.filter(inPeriod), filters, ['assignments', 'hours']),
  };
}

async function getAccountingAnalytics(models, filters) {
  const outstandingAmount = sumExpression('outstandingAmount');
  const amount = sumExpression('amount');
  const issuedBeforePeriod = dateBefore('invoiceDate', filters.startDate);
  const [apRows, bankRows, bankWindow, journalRows] = await Promise.all([
    runAggregate(models.ApInvoice, [
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          value: { $sum: outstandingAmount },
          overdueCount: sumIf(dateBefore('dueDate', asOf(filters))),
          overdueValue: sumIf(dateBefore('dueDate', asOf(filters)), outstandingAmount),
          // Payables open at the end of the previous period (AP has no paidAt;
          // updatedAt is the settlement proxy for PAID bills).
          outstandingIssuedBeforePeriod: sumIf(issuedBeforePeriod, outstandingAmount),
          paidAfterPreviousPeriod: sumIf(
            { $and: [issuedBeforePeriod, dateAfter('updatedAt', filters.previousEndDate)] },
            sumExpression('totalAmount'),
          ),
        },
      },
    ]),
    runAggregate(models.BankTransaction, [
      { $group: { _id: '$reconciliationStatus', count: { $sum: 1 } } },
    ]),
    windowAggregate(models.BankTransaction, {}, 'transactionDate', filters, {
      bankTransactions: { $sum: 1 },
      cashMovement: { $sum: amount },
    }, { previous: false }),
    runAggregate(models.JournalEntry, [
      { $match: { entryDate: { $gte: filters.previousStartDate, $lte: filters.endDate } } },
      {
        $group: {
          _id: { current: { $gte: ['$entryDate', filters.startDate] }, type: '$referenceType' },
          value: { $sum: amount },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const ap = apRows || [];
  const openAp = sumRows(ap, ['count', 'value', 'overdueCount', 'overdueValue', 'outstandingIssuedBeforePeriod'], (row) => OPEN_AP_STATUSES.includes(row._id));
  const paidAp = sumRows(ap, ['paidAfterPreviousPeriod'], (row) => row._id === 'PAID');
  const bank = bankRows || [];
  const journal = journalRows || [];
  const isCurrent = (row) => row._id?.current === true;
  const journalCurrent = sumRows(journal, ['value', 'count'], isCurrent);
  const journalPrevious = sumRows(journal, ['value'], (row) => !isCurrent(row));
  const journalAmount = roundMetric(journalCurrent.value);
  const previousJournalAmount = roundMetric(journalPrevious.value);

  return {
    openPayables: roundMetric(openAp.value),
    openPayablesPrevious: roundMetric(openAp.outstandingIssuedBeforePeriod + paidAp.paidAfterPreviousPeriod),
    openPayablesCount: openAp.count,
    overduePayables: roundMetric(openAp.overdueValue),
    overduePayablesCount: openAp.overdueCount,
    unmatchedBankTransactions: sumRows(bank, ['count'], (row) => row._id === 'UNMATCHED').count,
    journalAmount,
    journalCount: journalCurrent.count,
    journalDelta: calculateDelta(journalAmount, previousJournalAmount),
    payablesByStatus: normalizeBreakdown(rollup(ap, (row) => row._id, { value: 'value' }), 'value'),
    bankByStatus: normalizeBreakdown(rollup(bank, (row) => row._id)),
    journalByReferenceType: normalizeBreakdown(
      rollup(journal, (row) => row._id?.type, { value: 'value', predicate: isCurrent, sortKey: 'value', limit: 8 }),
      'value',
    ),
    cashTrend: fillTimeline(bankWindow.trend, filters, ['bankTransactions', 'cashMovement']),
  };
}

async function getSystemAnalytics(models, filters) {
  const [userRows, auditRows, failurePrevious, recentActivity] = await Promise.all([
    runAggregate(models.User, [
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // One indexed pass over the period: success/failure totals, the event and
    // module breakdowns and the trend are all roll-ups of these groups.
    runAggregate(models.AuditLog, [
      { $match: rangeMatch('timestamp', filters) },
      {
        $group: {
          _id: {
            bucket: dateBucketExpression('timestamp', filters.granularity),
            result: '$result',
            eventType: '$eventType',
            module: '$module',
          },
          count: { $sum: 1 },
        },
      },
    ]),
    runCount(models.AuditLog, { result: 'failure', ...rangeMatch('timestamp', filters, true) }),
    typeof models.AuditLog.find === 'function'
      ? gated(() => models.AuditLog
        .find({})
        .sort({ timestamp: -1 })
        .limit(6)
        .select('timestamp eventType email result module')
        .lean())
      : [],
  ]);

  const users = userRows || [];
  const audit = auditRows || [];
  const byResult = (result) => (row) => row._id?.result === result;
  const failures = sumRows(audit, ['count'], byResult('failure')).count;
  const trendByBucket = new Map();
  audit.forEach((row) => {
    const bucket = row._id?.bucket;
    const point = trendByBucket.get(bucket) || { _id: bucket, successes: 0, failures: 0 };
    if (row._id?.result === 'success') point.successes += toNumber(row.count);
    if (row._id?.result === 'failure') point.failures += toNumber(row.count);
    trendByBucket.set(bucket, point);
  });
  const trend = [...trendByBucket.values()];

  return {
    users: {
      total: sumRows(users, ['count']).count,
      active: sumRows(users, ['count'], (row) => row._id === 'active').count,
      byStatus: normalizeBreakdown(rollup(users, (row) => row._id)),
    },
    audit: {
      successes: sumRows(audit, ['count'], byResult('success')).count,
      failures,
      failureDelta: calculateDelta(failures, failurePrevious),
      byEvent: normalizeBreakdown(rollup(audit, (row) => row._id?.eventType, { limit: 8 })),
      byModule: normalizeBreakdown(rollup(audit, (row) => row._id?.module)),
      trend: fillTimeline(trend, filters, ['successes', 'failures']),
      recent: (recentActivity || []).map((entry) => ({
        id: String(entry._id || `${entry.eventType}-${entry.timestamp}`),
        timestamp: entry.timestamp,
        eventType: entry.eventType,
        email: entry.email,
        result: entry.result,
        module: entry.module,
      })),
    },
  };
}

/**
 * Overview KPI: `value` is the metric now, `previousValue` the same metric at the
 * end of the previous period, and `delta` the % change between them — so the
 * "vs previous period" badge always compares like with like.
 */
function kpi(id, value, previousValue, format = 'number') {
  const current = roundMetric(value);
  const previous = roundMetric(previousValue);
  return { id, value: current, previousValue: previous, delta: calculateDelta(current, previous), format };
}

function buildOverview({ customers, projects, sales, tasks, scheduling, accounting, system }) {
  return {
    kpis: [
      kpi('revenue', sales.invoices.revenue, sales.invoices.previousRevenue, 'currency'),
      // Customer base then = today's base minus the customers added this period.
      kpi('customers', customers.total, Math.max(0, customers.total - customers.newCurrent)),
      kpi('projects', projects.active, projects.activePrevious ?? 0),
      kpi('openTasks', tasks.open, tasks.openPrevious ?? 0),
      kpi('scheduleToday', scheduling.today, scheduling.todayPrevious ?? 0),
      kpi(
        'outstanding',
        sales.invoices.outstanding + accounting.openPayables,
        (sales.invoices.outstandingPrevious ?? 0) + (accounting.openPayablesPrevious ?? 0),
        'currency',
      ),
    ],
    featureMix: [
      { id: 'crm', label: 'CRM', value: customers.active, count: customers.active },
      { id: 'projects', label: 'Projects', value: projects.active, count: projects.active },
      { id: 'sales', label: 'Sales', value: sales.quotations.open + sales.orders.current, count: sales.quotations.open + sales.orders.current },
      { id: 'tasks', label: 'Tasks', value: tasks.open, count: tasks.open },
      { id: 'scheduling', label: 'Scheduling', value: scheduling.upcoming + scheduling.today, count: scheduling.upcoming + scheduling.today },
      { id: 'accounting', label: 'Accounting', value: accounting.openPayablesCount + sales.invoices.outstandingCount, count: accounting.openPayablesCount + sales.invoices.outstandingCount },
    ],
    workQueue: [
      { id: 'overdueTasks', value: tasks.overdue, severity: tasks.overdue > 0 ? 'danger' : 'success' },
      { id: 'overdueInvoices', value: sales.invoices.overdueCount, severity: sales.invoices.overdueCount > 0 ? 'warning' : 'success' },
      { id: 'projectRisk', value: projects.overdue, severity: projects.overdue > 0 ? 'warning' : 'success' },
      { id: 'unconfirmedAppointments', value: scheduling.unconfirmed, severity: scheduling.unconfirmed > 0 ? 'warning' : 'success' },
      { id: 'auditFailures', value: system.audit.failures, severity: system.audit.failures > 0 ? 'danger' : 'success' },
    ],
  };
}

function buildOperationsTrend(filters, tasks, scheduling) {
  return mergeTimelines(filters, [
    { rows: tasks.trend, metrics: ['created', 'completed'] },
    { rows: scheduling.trend, metrics: ['assignments', 'hours'] },
  ]);
}

function buildFinancialTrend(filters, sales, accounting) {
  return mergeTimelines(filters, [
    { rows: sales.invoices.trend, metrics: ['revenue', 'invoices'] },
    { rows: sales.quotations.trend, metrics: ['quotes', 'quoteValue'] },
    { rows: sales.orders.trend, metrics: ['orders', 'orderValue'] },
    { rows: accounting.cashTrend, metrics: ['cashMovement', 'bankTransactions'] },
  ]);
}

export async function getAnalyticsSnapshot(rawFilters = {}, dependencies = {}) {
  const filters = normalizeAnalyticsFilters(rawFilters, dependencies.now || new Date());
  const models = dependencies.models || getDashboardModels();
  const warnings = [];

  const [customers, projects, sales, tasks, scheduling, accounting, system] = await Promise.all([
    withWarning(warnings, 'customers', {
      total: 0, active: 0, newCurrent: 0, newPrevious: 0, delta: 0, byType: [], topCities: [], trend: fillTimeline([], filters, ['customers']),
    }, () => getCustomerAnalytics(models.Customer, filters)),
    withWarning(warnings, 'projects', {
      total: 0, active: 0, activePrevious: 0, newCurrent: 0, newPrevious: 0, delta: 0, completed: 0, budget: 0, overdue: 0, onHold: 0, byStatus: [], byType: [], trend: fillTimeline([], filters, ['projects', 'budget']),
    }, () => getProjectAnalytics(models.Project, filters)),
    withWarning(warnings, 'sales', {
      quotations: { total: 0, open: 0, openValue: 0, acceptedCurrent: 0, acceptedPrevious: 0, acceptedDelta: 0, conversionRate: 0, byStatus: [], trend: fillTimeline([], filters, ['quotes', 'quoteValue']) },
      orders: { total: 0, current: 0, previous: 0, delta: 0, valueCurrent: 0, byStatus: [], trend: fillTimeline([], filters, ['orders', 'orderValue']) },
      invoices: { total: 0, revenue: 0, previousRevenue: 0, revenueDelta: 0, invoiceCount: 0, outstanding: 0, outstandingPrevious: 0, outstandingCount: 0, overdue: 0, overdueCount: 0, byStatus: [], trend: fillTimeline([], filters, ['invoices', 'revenue']) },
    }, () => getSalesAnalytics(models, filters)),
    withWarning(warnings, 'tasks', {
      total: 0, open: 0, openPrevious: 0, overdue: 0, dueToday: 0, completedCurrent: 0, completedPrevious: 0, completedDelta: 0, byStatus: [], byPriority: [], trend: fillTimeline([], filters, ['created', 'completed']),
    }, () => getTaskAnalytics(models.Task, filters)),
    withWarning(warnings, 'scheduling', {
      total: 0, today: 0, todayPrevious: 0, upcoming: 0, unconfirmed: 0, hours: 0, byStatus: [], byType: [], trend: fillTimeline([], filters, ['assignments', 'hours']),
    }, () => getSchedulingAnalytics(models.Assignment, filters)),
    withWarning(warnings, 'accounting', {
      openPayables: 0, openPayablesPrevious: 0, openPayablesCount: 0, overduePayables: 0, overduePayablesCount: 0, unmatchedBankTransactions: 0, journalAmount: 0, journalCount: 0, journalDelta: 0, payablesByStatus: [], bankByStatus: [], journalByReferenceType: [], cashTrend: fillTimeline([], filters, ['bankTransactions', 'cashMovement']),
    }, () => getAccountingAnalytics(models, filters)),
    withWarning(warnings, 'system', {
      users: { total: 0, active: 0, byStatus: [] },
      audit: { successes: 0, failures: 0, failureDelta: 0, byEvent: [], byModule: [], trend: fillTimeline([], filters, ['successes', 'failures']), recent: [] },
    }, () => getSystemAnalytics(models, filters)),
  ]);

  const overview = buildOverview({ customers, projects, sales, tasks, scheduling, accounting, system });
  overview.financialTrend = buildFinancialTrend(filters, sales, accounting);
  overview.operationsTrend = buildOperationsTrend(filters, tasks, scheduling);

  return {
    filters: toClientFilters(filters),
    updatedAt: new Date().toISOString(),
    warnings,
    overview,
    crm: customers,
    projects,
    sales,
    tasks,
    scheduling,
    accounting,
    system,
  };
}

export default {
  normalizeAnalyticsFilters,
  getLegacyStats: (dependencies = {}) => getLegacyStats(dependencies.models || getDashboardModels()),
  getMobileCrmStats,
  getAnalyticsSnapshot,
};
