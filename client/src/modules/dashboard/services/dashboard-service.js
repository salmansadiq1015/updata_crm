import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

const VALID_RANGES = new Set(['7d', '30d', '90d', '12m']);
const VALID_GRANULARITIES = new Set(['day', 'week', 'month']);

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeAnalyticsFilters(filters = {}) {
  const range = VALID_RANGES.has(filters.range) ? filters.range : '30d';
  const granularity = VALID_GRANULARITIES.has(filters.granularity)
    ? filters.granularity
    : range === '12m'
    ? 'month'
    : range === '90d'
    ? 'week'
    : 'day';

  return { range, granularity };
}

function normalizeSeries(series, metrics = []) {
  return asArray(series).map((point) => {
    const next = {
      key: String(point?.key || ''),
      label: String(point?.label || point?.key || ''),
    };
    metrics.forEach((metric) => {
      next[metric] = asNumber(point?.[metric]);
    });
    return next;
  });
}

function normalizeBreakdown(items) {
  return asArray(items).map((item) => ({
    id: String(item?.id || 'unknown'),
    label: String(item?.label || item?.id || 'Unknown'),
    count: asNumber(item?.count),
    value: asNumber(item?.value ?? item?.count),
  }));
}

function normalizeKpis(items) {
  return asArray(items).map((item) => ({
    id: String(item?.id || ''),
    value: asNumber(item?.value),
    previousValue: asNumber(item?.previousValue),
    delta: asNumber(item?.delta),
    format: item?.format === 'currency' ? 'currency' : 'number',
  }));
}

function normalizeAnalyticsResponse(payload = {}) {
  const overview = payload.overview || {};
  const crm = payload.crm || {};
  const projects = payload.projects || {};
  const sales = payload.sales || {};
  const tasks = payload.tasks || {};
  const scheduling = payload.scheduling || {};
  const accounting = payload.accounting || {};
  const system = payload.system || {};

  return {
    filters: payload.filters || {},
    updatedAt: payload.updatedAt || null,
    warnings: asArray(payload.warnings),
    overview: {
      kpis: normalizeKpis(overview.kpis),
      financialTrend: normalizeSeries(overview.financialTrend, [
        'revenue',
        'invoices',
        'quotes',
        'quoteValue',
        'orders',
        'orderValue',
        'cashMovement',
        'bankTransactions',
      ]),
      operationsTrend: normalizeSeries(overview.operationsTrend, [
        'created',
        'completed',
        'assignments',
        'hours',
      ]),
      featureMix: normalizeBreakdown(overview.featureMix),
      workQueue: asArray(overview.workQueue).map((item) => ({
        id: String(item?.id || ''),
        value: asNumber(item?.value),
        severity: ['success', 'warning', 'danger'].includes(item?.severity)
          ? item.severity
          : 'success',
      })),
    },
    crm: {
      total: asNumber(crm.total),
      active: asNumber(crm.active),
      newCurrent: asNumber(crm.newCurrent),
      delta: asNumber(crm.delta),
      byType: normalizeBreakdown(crm.byType),
      topCities: normalizeBreakdown(crm.topCities),
      trend: normalizeSeries(crm.trend, ['customers']),
    },
    projects: {
      total: asNumber(projects.total),
      active: asNumber(projects.active),
      completed: asNumber(projects.completed),
      budget: asNumber(projects.budget),
      overdue: asNumber(projects.overdue),
      onHold: asNumber(projects.onHold),
      delta: asNumber(projects.delta),
      byStatus: normalizeBreakdown(projects.byStatus),
      byType: normalizeBreakdown(projects.byType),
      trend: normalizeSeries(projects.trend, ['projects', 'budget']),
    },
    sales: {
      quotations: {
        ...(sales.quotations || {}),
        byStatus: normalizeBreakdown(sales.quotations?.byStatus),
        trend: normalizeSeries(sales.quotations?.trend, ['quotes', 'quoteValue']),
      },
      orders: {
        ...(sales.orders || {}),
        byStatus: normalizeBreakdown(sales.orders?.byStatus),
        trend: normalizeSeries(sales.orders?.trend, ['orders', 'orderValue']),
      },
      invoices: {
        ...(sales.invoices || {}),
        byStatus: normalizeBreakdown(sales.invoices?.byStatus),
        trend: normalizeSeries(sales.invoices?.trend, ['invoices', 'revenue']),
      },
    },
    tasks: {
      ...tasks,
      byStatus: normalizeBreakdown(tasks.byStatus),
      byPriority: normalizeBreakdown(tasks.byPriority),
      trend: normalizeSeries(tasks.trend, ['created', 'completed']),
    },
    scheduling: {
      ...scheduling,
      byStatus: normalizeBreakdown(scheduling.byStatus),
      byType: normalizeBreakdown(scheduling.byType),
      trend: normalizeSeries(scheduling.trend, ['assignments', 'hours']),
    },
    accounting: {
      ...accounting,
      payablesByStatus: normalizeBreakdown(accounting.payablesByStatus),
      bankByStatus: normalizeBreakdown(accounting.bankByStatus),
      journalByReferenceType: normalizeBreakdown(accounting.journalByReferenceType),
      cashTrend: normalizeSeries(accounting.cashTrend, ['bankTransactions', 'cashMovement']),
    },
    system: {
      users: {
        ...(system.users || {}),
        byStatus: normalizeBreakdown(system.users?.byStatus),
      },
      audit: {
        ...(system.audit || {}),
        byEvent: normalizeBreakdown(system.audit?.byEvent),
        byModule: normalizeBreakdown(system.audit?.byModule),
        trend: normalizeSeries(system.audit?.trend, ['successes', 'failures']),
        recent: asArray(system.audit?.recent),
      },
    },
  };
}

export const dashboardService = {
  async getIntelligence(filters = {}) {
    const res = await apiClient.get(ENDPOINTS.DASHBOARD.INTELLIGENCE, { params: sanitizeAnalyticsFilters(filters) });
    return res.data;
  },
  async getStats() {
    try {
      const res = await apiClient.get(ENDPOINTS.DASHBOARD.STATS);
      return res.data;
    } catch {
      return null;
    }
  },

  async getAnalytics(filters = {}) {
    const params = sanitizeAnalyticsFilters(filters);
    const res = await apiClient.get(ENDPOINTS.DASHBOARD.ANALYTICS, { params });
    return normalizeAnalyticsResponse(res.data);
  },
};
