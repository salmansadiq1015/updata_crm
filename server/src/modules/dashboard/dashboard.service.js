import mongoose from 'mongoose';

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

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function subtractDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() - days);
  return date;
}

function subtractMonths(value, months) {
  const date = new Date(value);
  date.setMonth(date.getMonth() - months);
  return date;
}

function addBucket(value, granularity) {
  const date = new Date(value);
  if (granularity === 'month') {
    date.setMonth(date.getMonth() + 1);
    return startOfDay(date);
  }
  date.setDate(date.getDate() + (granularity === 'week' ? 7 : 1));
  return startOfDay(date);
}

function getWeekStart(value) {
  const date = startOfDay(value);
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - offset);
  return date;
}

function getIsoWeekKey(value) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getBucketKey(value, granularity) {
  const date = granularity === 'week' ? getWeekStart(value) : startOfDay(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (granularity === 'month') return `${year}-${month}`;
  if (granularity === 'week') return getIsoWeekKey(date);
  return `${year}-${month}-${day}`;
}

function getBucketLabel(key, granularity) {
  if (granularity === 'month') {
    const [year, month] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' }).format(
      new Date(year, month - 1, 1),
    );
  }
  if (granularity === 'week') return key.replace('-W', ' W');
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(
    new Date(year, month - 1, day),
  );
}

export function normalizeAnalyticsFilters(raw = {}, now = new Date()) {
  if (raw?.startDate instanceof Date && raw?.endDate instanceof Date) {
    return raw;
  }

  const range = DASHBOARD_RANGE_PRESETS[raw?.range] ? raw.range : '30d';
  const preset = DASHBOARD_RANGE_PRESETS[range];
  const endDate = endOfDay(now);
  const startDate = preset.months
    ? startOfDay(subtractMonths(endDate, preset.months))
    : startOfDay(subtractDays(endDate, preset.days - 1));
  const previousEndDate = new Date(startDate.getTime() - 1);
  const previousStartDate = preset.months
    ? startOfDay(subtractMonths(startDate, preset.months))
    : startOfDay(subtractDays(startDate, preset.days));
  const granularity = SUPPORTED_GRANULARITIES.has(raw?.granularity)
    ? raw.granularity
    : preset.defaultGranularity;

  return {
    range,
    granularity,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
  };
}

export function calculateDelta(current, previous) {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (previousValue === 0) return currentValue > 0 ? 100 : 0;
  return Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
}

function createBuckets(filters) {
  const buckets = [];
  const first = filters.granularity === 'week'
    ? getWeekStart(filters.startDate)
    : startOfDay(filters.startDate);

  for (let cursor = first; cursor <= filters.endDate; cursor = addBucket(cursor, filters.granularity)) {
    const key = getBucketKey(cursor, filters.granularity);
    buckets.push({ key, label: getBucketLabel(key, filters.granularity) });
  }

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

function dateBucketExpression(field, granularity) {
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

function groupByDate(field, granularity, accumulators) {
  return {
    $group: {
      _id: dateBucketExpression(field, granularity),
      ...accumulators,
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

function countFrom(rows) {
  return Number(rows?.[0]?.count) || 0;
}

function sumFrom(rows, key = 'value') {
  return roundMetric(rows?.[0]?.[key]);
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

async function runAggregate(model, pipeline) {
  const aggregate = model.aggregate(pipeline);
  if (aggregate && typeof aggregate.allowDiskUse === 'function') {
    return aggregate.allowDiskUse(true);
  }
  return aggregate;
}

async function runFacet(model, facets) {
  const result = await runAggregate(model, [{ $facet: facets }]);
  return result?.[0] || {};
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
    models.Customer.countDocuments({ isDeleted: false }),
    models.Project.countDocuments({ isDeleted: false }),
    models.Quotation.countDocuments({ isDeleted: false, status: { $in: OPEN_QUOTATION_STATUSES } }),
    models.Task.countDocuments({
      isDeleted: false,
      status: { $in: ['OPEN', 'IN_PROGRESS'] },
      dueDate: { $gte: todayStart, $lte: todayEnd },
    }),
  ]);

  return { customers, projects, openQuotes, todayTasks };
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
    models.Lead.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    models.CallCampaign.countDocuments({
      createdBy: actorId,
      isTest: false,
      status: { $in: ['scheduled', 'running', 'paused'] },
    }),
    models.CallRecord.countDocuments({
      createdBy: actorId,
      isTest: false,
      endedAt: { $gte: todayStart, $lte: todayEnd },
      state: { $in: ['completed', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled'] },
    }),
  ]);

  const leads = { total: 0, new: 0, contacted: 0, qualified: 0, unqualified: 0, converted: 0 };
  for (const row of leadRows) {
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
  const facet = await runFacet(Customer, {
    total: [{ $match: match }, { $count: 'count' }],
    active: [{ $match: { ...match, status: 'active' } }, { $count: 'count' }],
    newCurrent: [{ $match: { ...match, ...rangeMatch('createdAt', filters) } }, { $count: 'count' }],
    newPrevious: [{ $match: { ...match, ...rangeMatch('createdAt', filters, true) } }, { $count: 'count' }],
    byType: [
      { $match: match },
      { $group: { _id: { $ifNull: ['$type', 'unknown'] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ],
    topCities: [
      { $match: { ...match, city: { $nin: [null, ''] } } },
      { $group: { _id: '$city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ],
    trend: [
      { $match: { ...match, ...rangeMatch('createdAt', filters) } },
      groupByDate('createdAt', filters.granularity, { customers: { $sum: 1 } }),
      { $sort: { _id: 1 } },
    ],
  });

  const newCurrent = countFrom(facet.newCurrent);
  const newPrevious = countFrom(facet.newPrevious);

  return {
    total: countFrom(facet.total),
    active: countFrom(facet.active),
    newCurrent,
    newPrevious,
    delta: calculateDelta(newCurrent, newPrevious),
    byType: normalizeBreakdown(facet.byType),
    topCities: normalizeBreakdown(facet.topCities),
    trend: fillTimeline(facet.trend, filters, ['customers']),
  };
}

async function getProjectAnalytics(Project, filters) {
  const match = { isDeleted: false };
  const activeMatch = { ...match, status: { $in: ACTIVE_PROJECT_STATUSES } };
  const facet = await runFacet(Project, {
    total: [{ $match: match }, { $count: 'count' }],
    active: [{ $match: activeMatch }, { $count: 'count' }],
    newCurrent: [{ $match: { ...match, ...rangeMatch('createdAt', filters) } }, { $count: 'count' }],
    newPrevious: [{ $match: { ...match, ...rangeMatch('createdAt', filters, true) } }, { $count: 'count' }],
    completedCurrent: [
      { $match: { ...match, status: { $in: ['COMPLETED', 'INVOICED'] }, ...rangeMatch('updatedAt', filters) } },
      { $count: 'count' },
    ],
    budget: [
      { $match: activeMatch },
      { $group: { _id: null, value: { $sum: sumExpression('estimatedBudget') } } },
    ],
    overdue: [
      { $match: { ...activeMatch, plannedEndDate: { $lt: filters.endDate } } },
      { $count: 'count' },
    ],
    onHold: [{ $match: { ...match, status: 'ON_HOLD' } }, { $count: 'count' }],
    byStatus: [
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ],
    byType: [
      { $match: match },
      { $group: { _id: '$projectType', count: { $sum: 1 }, value: { $sum: sumExpression('estimatedBudget') } } },
      { $sort: { count: -1 } },
    ],
    trend: [
      { $match: { ...match, ...rangeMatch('createdAt', filters) } },
      groupByDate('createdAt', filters.granularity, {
        projects: { $sum: 1 },
        budget: { $sum: sumExpression('estimatedBudget') },
      }),
      { $sort: { _id: 1 } },
    ],
  });

  const newCurrent = countFrom(facet.newCurrent);
  const newPrevious = countFrom(facet.newPrevious);

  return {
    total: countFrom(facet.total),
    active: countFrom(facet.active),
    newCurrent,
    newPrevious,
    delta: calculateDelta(newCurrent, newPrevious),
    completed: countFrom(facet.completedCurrent),
    budget: sumFrom(facet.budget),
    overdue: countFrom(facet.overdue),
    onHold: countFrom(facet.onHold),
    byStatus: normalizeBreakdown(facet.byStatus),
    byType: normalizeBreakdown(facet.byType, 'value'),
    trend: fillTimeline(facet.trend, filters, ['projects', 'budget']),
  };
}

async function getSalesAnalytics(models, filters) {
  const quoteMatch = { isDeleted: false };
  const orderMatch = { isDeleted: false };
  const invoiceMatch = { isDeleted: false };

  const [quotes, orders, invoices] = await Promise.all([
    runFacet(models.Quotation, {
      total: [{ $match: quoteMatch }, { $count: 'count' }],
      open: [{ $match: { ...quoteMatch, status: { $in: OPEN_QUOTATION_STATUSES } } }, { $count: 'count' }],
      openValue: [
        { $match: { ...quoteMatch, status: { $in: OPEN_QUOTATION_STATUSES } } },
        { $group: { _id: null, value: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) } } },
      ],
      acceptedCurrent: [
        { $match: { ...quoteMatch, status: { $in: ['ACCEPTED', 'CONVERTED'] }, ...rangeMatch('updatedAt', filters) } },
        { $count: 'count' },
      ],
      acceptedPrevious: [
        { $match: { ...quoteMatch, status: { $in: ['ACCEPTED', 'CONVERTED'] }, ...rangeMatch('updatedAt', filters, true) } },
        { $count: 'count' },
      ],
      declinedCurrent: [
        { $match: { ...quoteMatch, status: 'DECLINED', ...rangeMatch('updatedAt', filters) } },
        { $count: 'count' },
      ],
      byStatus: [
        { $match: quoteMatch },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) } } },
        { $sort: { count: -1 } },
      ],
      trend: [
        { $match: { ...quoteMatch, ...rangeMatch('createdAt', filters) } },
        groupByDate('createdAt', filters.granularity, {
          quotes: { $sum: 1 },
          quoteValue: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) },
        }),
        { $sort: { _id: 1 } },
      ],
    }),
    runFacet(models.Order, {
      total: [{ $match: orderMatch }, { $count: 'count' }],
      current: [{ $match: { ...orderMatch, ...rangeMatch('createdAt', filters) } }, { $count: 'count' }],
      previous: [{ $match: { ...orderMatch, ...rangeMatch('createdAt', filters, true) } }, { $count: 'count' }],
      valueCurrent: [
        { $match: { ...orderMatch, status: { $ne: 'CANCELLED' }, ...rangeMatch('createdAt', filters) } },
        { $group: { _id: null, value: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) } } },
      ],
      byStatus: [
        { $match: orderMatch },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) } } },
        { $sort: { count: -1 } },
      ],
      trend: [
        { $match: { ...orderMatch, ...rangeMatch('createdAt', filters) } },
        groupByDate('createdAt', filters.granularity, {
          orders: { $sum: 1 },
          orderValue: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) },
        }),
        { $sort: { _id: 1 } },
      ],
    }),
    runFacet(models.Invoice, {
      total: [{ $match: invoiceMatch }, { $count: 'count' }],
      currentRevenue: [
        { $match: { ...invoiceMatch, status: { $nin: ['CANCELLED', 'WRITTEN_OFF'] }, ...rangeMatch('invoiceDate', filters) } },
        { $group: { _id: null, value: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) }, count: { $sum: 1 } } },
      ],
      previousRevenue: [
        { $match: { ...invoiceMatch, status: { $nin: ['CANCELLED', 'WRITTEN_OFF'] }, ...rangeMatch('invoiceDate', filters, true) } },
        { $group: { _id: null, value: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) }, count: { $sum: 1 } } },
      ],
      outstanding: [
        { $match: { ...invoiceMatch, status: { $in: OPEN_INVOICE_STATUSES } } },
        { $group: { _id: null, value: { $sum: sumExpression('amountDue') }, count: { $sum: 1 } } },
      ],
      overdue: [
        { $match: { ...invoiceMatch, status: { $in: OPEN_INVOICE_STATUSES }, dueDate: { $lt: filters.endDate } } },
        { $group: { _id: null, value: { $sum: sumExpression('amountDue') }, count: { $sum: 1 } } },
      ],
      byStatus: [
        { $match: invoiceMatch },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) } } },
        { $sort: { count: -1 } },
      ],
      trend: [
        { $match: { ...invoiceMatch, status: { $nin: ['CANCELLED', 'WRITTEN_OFF'] }, ...rangeMatch('invoiceDate', filters) } },
        groupByDate('invoiceDate', filters.granularity, {
          invoices: { $sum: 1 },
          revenue: { $sum: sumExpression(['grandTotalRounded', 'grandTotal']) },
        }),
        { $sort: { _id: 1 } },
      ],
    }),
  ]);

  const acceptedCurrent = countFrom(quotes.acceptedCurrent);
  const acceptedPrevious = countFrom(quotes.acceptedPrevious);
  const declinedCurrent = countFrom(quotes.declinedCurrent);
  const revenue = sumFrom(invoices.currentRevenue);
  const previousRevenue = sumFrom(invoices.previousRevenue);
  const quoteDecisionTotal = acceptedCurrent + declinedCurrent;

  return {
    quotations: {
      total: countFrom(quotes.total),
      open: countFrom(quotes.open),
      openValue: sumFrom(quotes.openValue),
      acceptedCurrent,
      acceptedPrevious,
      acceptedDelta: calculateDelta(acceptedCurrent, acceptedPrevious),
      conversionRate: quoteDecisionTotal > 0 ? Math.round((acceptedCurrent / quoteDecisionTotal) * 1000) / 10 : 0,
      byStatus: normalizeBreakdown(quotes.byStatus, 'value'),
      trend: fillTimeline(quotes.trend, filters, ['quotes', 'quoteValue']),
    },
    orders: {
      total: countFrom(orders.total),
      current: countFrom(orders.current),
      previous: countFrom(orders.previous),
      delta: calculateDelta(countFrom(orders.current), countFrom(orders.previous)),
      valueCurrent: sumFrom(orders.valueCurrent),
      byStatus: normalizeBreakdown(orders.byStatus, 'value'),
      trend: fillTimeline(orders.trend, filters, ['orders', 'orderValue']),
    },
    invoices: {
      total: countFrom(invoices.total),
      revenue,
      previousRevenue,
      revenueDelta: calculateDelta(revenue, previousRevenue),
      invoiceCount: countFrom(invoices.currentRevenue),
      outstanding: sumFrom(invoices.outstanding),
      outstandingCount: countFrom(invoices.outstanding),
      overdue: sumFrom(invoices.overdue),
      overdueCount: countFrom(invoices.overdue),
      byStatus: normalizeBreakdown(invoices.byStatus, 'value'),
      trend: fillTimeline(invoices.trend, filters, ['invoices', 'revenue']),
    },
  };
}

async function getTaskAnalytics(Task, filters) {
  const match = { isDeleted: false };
  const facet = await runFacet(Task, {
    total: [{ $match: match }, { $count: 'count' }],
    open: [{ $match: { ...match, status: { $in: ACTIVE_TASK_STATUSES } } }, { $count: 'count' }],
    overdue: [
      { $match: { ...match, status: { $in: ACTIVE_TASK_STATUSES }, dueDate: { $lt: filters.endDate } } },
      { $count: 'count' },
    ],
    dueToday: [
      { $match: { ...match, status: { $in: ACTIVE_TASK_STATUSES }, dueDate: { $gte: startOfDay(filters.endDate), $lte: filters.endDate } } },
      { $count: 'count' },
    ],
    completedCurrent: [
      { $match: { ...match, status: 'COMPLETED', ...rangeMatch('completedAt', filters) } },
      { $count: 'count' },
    ],
    completedPrevious: [
      { $match: { ...match, status: 'COMPLETED', ...rangeMatch('completedAt', filters, true) } },
      { $count: 'count' },
    ],
    byStatus: [
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ],
    byPriority: [
      { $match: { ...match, status: { $in: ACTIVE_TASK_STATUSES } } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ],
    createdTrend: [
      { $match: { ...match, ...rangeMatch('createdAt', filters) } },
      groupByDate('createdAt', filters.granularity, { created: { $sum: 1 } }),
      { $sort: { _id: 1 } },
    ],
    completedTrend: [
      { $match: { ...match, status: 'COMPLETED', ...rangeMatch('completedAt', filters) } },
      groupByDate('completedAt', filters.granularity, { completed: { $sum: 1 } }),
      { $sort: { _id: 1 } },
    ],
  });

  const completedCurrent = countFrom(facet.completedCurrent);
  const completedPrevious = countFrom(facet.completedPrevious);

  return {
    total: countFrom(facet.total),
    open: countFrom(facet.open),
    overdue: countFrom(facet.overdue),
    dueToday: countFrom(facet.dueToday),
    completedCurrent,
    completedPrevious,
    completedDelta: calculateDelta(completedCurrent, completedPrevious),
    byStatus: normalizeBreakdown(facet.byStatus),
    byPriority: normalizeBreakdown(facet.byPriority),
    trend: mergeTimelines(filters, [
      { rows: facet.createdTrend, metrics: ['created'] },
      { rows: facet.completedTrend, metrics: ['completed'] },
    ]),
  };
}

async function getSchedulingAnalytics(Assignment, filters) {
  const match = { isDeleted: false };
  const todayStart = startOfDay(filters.endDate);
  const todayEnd = endOfDay(filters.endDate);
  const nextWeekEnd = endOfDay(new Date(filters.endDate.getTime() + 7 * DAY_MS));
  const facet = await runFacet(Assignment, {
    total: [{ $match: match }, { $count: 'count' }],
    today: [
      { $match: { ...match, startDatetime: { $gte: todayStart, $lte: todayEnd } } },
      { $count: 'count' },
    ],
    upcoming: [
      { $match: { ...match, status: { $in: ACTIVE_ASSIGNMENT_STATUSES }, startDatetime: { $gt: todayEnd, $lte: nextWeekEnd } } },
      { $count: 'count' },
    ],
    unconfirmed: [
      { $match: { ...match, status: 'PLANNED', startDatetime: { $gte: filters.endDate } } },
      { $count: 'count' },
    ],
    rangeHours: [
      { $match: { ...match, startDatetime: { $gte: filters.startDate, $lte: filters.endDate }, status: { $ne: 'CANCELLED' } } },
      { $project: { hours: { $divide: [{ $subtract: ['$endDatetime', '$startDatetime'] }, 3600000] } } },
      { $group: { _id: null, value: { $sum: '$hours' }, count: { $sum: 1 } } },
    ],
    byStatus: [
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ],
    byType: [
      { $match: match },
      { $group: { _id: '$assignmentType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ],
    trend: [
      { $match: { ...match, startDatetime: { $gte: filters.startDate, $lte: filters.endDate } } },
      {
        $project: {
          startDatetime: 1,
          hours: { $divide: [{ $subtract: ['$endDatetime', '$startDatetime'] }, 3600000] },
        },
      },
      groupByDate('startDatetime', filters.granularity, {
        assignments: { $sum: 1 },
        hours: { $sum: '$hours' },
      }),
      { $sort: { _id: 1 } },
    ],
  });

  return {
    total: countFrom(facet.total),
    today: countFrom(facet.today),
    upcoming: countFrom(facet.upcoming),
    unconfirmed: countFrom(facet.unconfirmed),
    hours: sumFrom(facet.rangeHours),
    byStatus: normalizeBreakdown(facet.byStatus),
    byType: normalizeBreakdown(facet.byType),
    trend: fillTimeline(facet.trend, filters, ['assignments', 'hours']),
  };
}

async function getAccountingAnalytics(models, filters) {
  const [ap, bank, journal] = await Promise.all([
    runFacet(models.ApInvoice, {
      open: [
        { $match: { isDeleted: false, status: { $in: OPEN_AP_STATUSES } } },
        { $group: { _id: null, value: { $sum: sumExpression('outstandingAmount') }, count: { $sum: 1 } } },
      ],
      overdue: [
        { $match: { isDeleted: false, status: { $in: OPEN_AP_STATUSES }, dueDate: { $lt: filters.endDate } } },
        { $group: { _id: null, value: { $sum: sumExpression('outstandingAmount') }, count: { $sum: 1 } } },
      ],
      byStatus: [
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: sumExpression('outstandingAmount') } } },
        { $sort: { count: -1 } },
      ],
    }),
    runFacet(models.BankTransaction, {
      unmatched: [{ $match: { reconciliationStatus: 'UNMATCHED' } }, { $count: 'count' }],
      cashTrend: [
        { $match: { ...rangeMatch('transactionDate', filters) } },
        groupByDate('transactionDate', filters.granularity, {
          bankTransactions: { $sum: 1 },
          cashMovement: { $sum: sumExpression('amount') },
        }),
        { $sort: { _id: 1 } },
      ],
      byStatus: [
        { $group: { _id: '$reconciliationStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ],
    }),
    runFacet(models.JournalEntry, {
      current: [
        { $match: { ...rangeMatch('entryDate', filters) } },
        { $group: { _id: null, value: { $sum: sumExpression('amount') }, count: { $sum: 1 } } },
      ],
      previous: [
        { $match: { ...rangeMatch('entryDate', filters, true) } },
        { $group: { _id: null, value: { $sum: sumExpression('amount') }, count: { $sum: 1 } } },
      ],
      byReferenceType: [
        { $match: { ...rangeMatch('entryDate', filters) } },
        { $group: { _id: '$referenceType', count: { $sum: 1 }, value: { $sum: sumExpression('amount') } } },
        { $sort: { value: -1 } },
        { $limit: 8 },
      ],
    }),
  ]);

  const journalAmount = sumFrom(journal.current);
  const previousJournalAmount = sumFrom(journal.previous);

  return {
    openPayables: sumFrom(ap.open),
    openPayablesCount: countFrom(ap.open),
    overduePayables: sumFrom(ap.overdue),
    overduePayablesCount: countFrom(ap.overdue),
    unmatchedBankTransactions: countFrom(bank.unmatched),
    journalAmount,
    journalCount: countFrom(journal.current),
    journalDelta: calculateDelta(journalAmount, previousJournalAmount),
    payablesByStatus: normalizeBreakdown(ap.byStatus, 'value'),
    bankByStatus: normalizeBreakdown(bank.byStatus),
    journalByReferenceType: normalizeBreakdown(journal.byReferenceType, 'value'),
    cashTrend: fillTimeline(bank.cashTrend, filters, ['bankTransactions', 'cashMovement']),
  };
}

function buildFindChain(rows) {
  return {
    sort: () => ({
      limit: () => ({
        select: () => ({
          lean: async () => rows,
        }),
      }),
    }),
  };
}

async function getSystemAnalytics(models, filters) {
  const [users, audit, recentActivity] = await Promise.all([
    runFacet(models.User, {
      total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
      active: [{ $match: { isDeleted: false, status: 'active' } }, { $count: 'count' }],
      byStatus: [
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ],
    }),
    runFacet(models.AuditLog, {
      successCurrent: [
        { $match: { result: 'success', ...rangeMatch('timestamp', filters) } },
        { $count: 'count' },
      ],
      failureCurrent: [
        { $match: { result: 'failure', ...rangeMatch('timestamp', filters) } },
        { $count: 'count' },
      ],
      failurePrevious: [
        { $match: { result: 'failure', ...rangeMatch('timestamp', filters, true) } },
        { $count: 'count' },
      ],
      byEvent: [
        { $match: { ...rangeMatch('timestamp', filters) } },
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ],
      byModule: [
        { $match: { ...rangeMatch('timestamp', filters) } },
        { $group: { _id: '$module', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ],
      trend: [
        { $match: { ...rangeMatch('timestamp', filters) } },
        {
          $group: {
            _id: {
              bucket: dateBucketExpression('timestamp', filters.granularity),
              result: '$result',
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.bucket',
            successes: { $sum: { $cond: [{ $eq: ['$_id.result', 'success'] }, '$count', 0] } },
            failures: { $sum: { $cond: [{ $eq: ['$_id.result', 'failure'] }, '$count', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ],
    }),
    models.AuditLog.find
      ? models.AuditLog
          .find({})
          .sort({ timestamp: -1 })
          .limit(6)
          .select('timestamp eventType email result module')
          .lean()
      : buildFindChain([]).sort().limit().select().lean(),
  ]);

  const failures = countFrom(audit.failureCurrent);
  const previousFailures = countFrom(audit.failurePrevious);

  return {
    users: {
      total: countFrom(users.total),
      active: countFrom(users.active),
      byStatus: normalizeBreakdown(users.byStatus),
    },
    audit: {
      successes: countFrom(audit.successCurrent),
      failures,
      failureDelta: calculateDelta(failures, previousFailures),
      byEvent: normalizeBreakdown(audit.byEvent),
      byModule: normalizeBreakdown(audit.byModule),
      trend: fillTimeline(audit.trend, filters, ['successes', 'failures']),
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

function buildOverview({ customers, projects, sales, tasks, scheduling, accounting, system }) {
  return {
    kpis: [
      {
        id: 'revenue',
        value: sales.invoices.revenue,
        previousValue: sales.invoices.previousRevenue,
        delta: sales.invoices.revenueDelta,
        format: 'currency',
      },
      {
        id: 'customers',
        value: customers.total,
        previousValue: customers.total - customers.newPrevious,
        delta: customers.delta,
        format: 'number',
      },
      {
        id: 'projects',
        value: projects.active,
        previousValue: Math.max(0, projects.active - projects.newPrevious),
        delta: projects.delta,
        format: 'number',
      },
      {
        id: 'openTasks',
        value: tasks.open,
        previousValue: Math.max(0, tasks.open - tasks.completedPrevious),
        delta: tasks.completedDelta,
        format: 'number',
      },
      {
        id: 'scheduleToday',
        value: scheduling.today,
        previousValue: 0,
        delta: 0,
        format: 'number',
      },
      {
        id: 'outstanding',
        value: sales.invoices.outstanding + accounting.openPayables,
        previousValue: 0,
        delta: 0,
        format: 'currency',
      },
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
      total: 0, active: 0, newCurrent: 0, newPrevious: 0, delta: 0, completed: 0, budget: 0, overdue: 0, onHold: 0, byStatus: [], byType: [], trend: fillTimeline([], filters, ['projects', 'budget']),
    }, () => getProjectAnalytics(models.Project, filters)),
    withWarning(warnings, 'sales', {
      quotations: { total: 0, open: 0, openValue: 0, acceptedCurrent: 0, acceptedPrevious: 0, acceptedDelta: 0, conversionRate: 0, byStatus: [], trend: fillTimeline([], filters, ['quotes', 'quoteValue']) },
      orders: { total: 0, current: 0, previous: 0, delta: 0, valueCurrent: 0, byStatus: [], trend: fillTimeline([], filters, ['orders', 'orderValue']) },
      invoices: { total: 0, revenue: 0, previousRevenue: 0, revenueDelta: 0, invoiceCount: 0, outstanding: 0, outstandingCount: 0, overdue: 0, overdueCount: 0, byStatus: [], trend: fillTimeline([], filters, ['invoices', 'revenue']) },
    }, () => getSalesAnalytics(models, filters)),
    withWarning(warnings, 'tasks', {
      total: 0, open: 0, overdue: 0, dueToday: 0, completedCurrent: 0, completedPrevious: 0, completedDelta: 0, byStatus: [], byPriority: [], trend: fillTimeline([], filters, ['created', 'completed']),
    }, () => getTaskAnalytics(models.Task, filters)),
    withWarning(warnings, 'scheduling', {
      total: 0, today: 0, upcoming: 0, unconfirmed: 0, hours: 0, byStatus: [], byType: [], trend: fillTimeline([], filters, ['assignments', 'hours']),
    }, () => getSchedulingAnalytics(models.Assignment, filters)),
    withWarning(warnings, 'accounting', {
      openPayables: 0, openPayablesCount: 0, overduePayables: 0, overduePayablesCount: 0, unmatchedBankTransactions: 0, journalAmount: 0, journalCount: 0, journalDelta: 0, payablesByStatus: [], bankByStatus: [], journalByReferenceType: [], cashTrend: fillTimeline([], filters, ['bankTransactions', 'cashMovement']),
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
