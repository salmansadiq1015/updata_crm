export const DASHBOARD_RANGES = Object.freeze([
  { value: '7d', labelKey: 'dashboard.analytics.filters.7d', fallback: '7 days' },
  { value: '30d', labelKey: 'dashboard.analytics.filters.30d', fallback: '30 days' },
  { value: '90d', labelKey: 'dashboard.analytics.filters.90d', fallback: '90 days' },
  { value: '12m', labelKey: 'dashboard.analytics.filters.12m', fallback: '12 months' },
]);

export const DASHBOARD_GRANULARITIES = Object.freeze([
  { value: 'day', labelKey: 'dashboard.analytics.filters.day', fallback: 'Daily' },
  { value: 'week', labelKey: 'dashboard.analytics.filters.week', fallback: 'Weekly' },
  { value: 'month', labelKey: 'dashboard.analytics.filters.month', fallback: 'Monthly' },
]);

export const DASHBOARD_TABS = Object.freeze([
  { id: 'overview', labelKey: 'dashboard.analytics.tabs.overview', fallback: 'Overview' },
  { id: 'crm', labelKey: 'dashboard.analytics.tabs.crm', fallback: 'CRM' },
  { id: 'projects', labelKey: 'dashboard.analytics.tabs.projects', fallback: 'Projects' },
  { id: 'sales', labelKey: 'dashboard.analytics.tabs.sales', fallback: 'Quotes & Orders' },
  { id: 'tasks', labelKey: 'dashboard.analytics.tabs.tasks', fallback: 'Tasks' },
  { id: 'scheduling', labelKey: 'dashboard.analytics.tabs.scheduling', fallback: 'Scheduling' },
  { id: 'accounting', labelKey: 'dashboard.analytics.tabs.accounting', fallback: 'Accounting' },
  { id: 'system', labelKey: 'dashboard.analytics.tabs.system', fallback: 'System' },
]);

export const KPI_CONFIG = Object.freeze({
  revenue: {
    labelKey: 'dashboard.analytics.kpi.revenue',
    fallback: 'Revenue',
    accent: 'cyan',
  },
  customers: {
    labelKey: 'dashboard.analytics.kpi.customers',
    fallback: 'Customers',
    accent: 'violet',
  },
  projects: {
    labelKey: 'dashboard.analytics.kpi.projects',
    fallback: 'Active projects',
    accent: 'blue',
  },
  openTasks: {
    labelKey: 'dashboard.analytics.kpi.openTasks',
    fallback: 'Open tasks',
    accent: 'emerald',
  },
  scheduleToday: {
    labelKey: 'dashboard.analytics.kpi.scheduleToday',
    fallback: 'Today schedule',
    accent: 'amber',
  },
  outstanding: {
    labelKey: 'dashboard.analytics.kpi.outstanding',
    fallback: 'Open balance',
    accent: 'rose',
  },
});

export const WORK_QUEUE_CONFIG = Object.freeze({
  overdueTasks: {
    labelKey: 'dashboard.analytics.queue.overdueTasks',
    fallback: 'Overdue tasks',
  },
  overdueInvoices: {
    labelKey: 'dashboard.analytics.queue.overdueInvoices',
    fallback: 'Overdue invoices',
  },
  projectRisk: {
    labelKey: 'dashboard.analytics.queue.projectRisk',
    fallback: 'Project risks',
  },
  unconfirmedAppointments: {
    labelKey: 'dashboard.analytics.queue.unconfirmedAppointments',
    fallback: 'Unconfirmed appointments',
  },
  auditFailures: {
    labelKey: 'dashboard.analytics.queue.auditFailures',
    fallback: 'Audit failures',
  },
});

export const FEATURE_MIX_COLORS = Object.freeze([
  '#8b5cf6',
  '#06b6d4',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#60a5fa',
]);

export const CHART_COLORS = Object.freeze({
  revenue: '#22d3ee',
  quoteValue: '#a78bfa',
  orderValue: '#34d399',
  cashMovement: '#f59e0b',
  created: '#60a5fa',
  completed: '#22c55e',
  assignments: '#f472b6',
  hours: '#fbbf24',
  failures: '#fb7185',
  successes: '#34d399',
  neutral: '#94a3b8',
});
