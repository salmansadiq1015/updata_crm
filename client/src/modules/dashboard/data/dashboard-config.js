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
  { id: 'assistant', labelKey: 'dashboard.intelligence.assistant', fallback: 'AI assistant', permission: 'ai:sessions' },
  { id: 'calling', labelKey: 'dashboard.intelligence.calling', fallback: 'AI calling', permission: 'ai-calling:read' },
  { id: 'incoming', labelKey: 'dashboard.intelligence.incoming', fallback: 'Incoming calls', permission: 'inbound-calls:read' },
  { id: 'leads', labelKey: 'dashboard.intelligence.leads', fallback: 'Leads & follow-ups', permission: 'lead:read' },
  { id: 'crm', labelKey: 'dashboard.analytics.tabs.crm', fallback: 'CRM', permission: 'crm:read' },
  { id: 'projects', labelKey: 'dashboard.analytics.tabs.projects', fallback: 'Projects', permission: 'projects:read' },
  { id: 'sales', labelKey: 'dashboard.analytics.tabs.sales', fallback: 'Quotes & Orders', permission: 'qop:read' },
  { id: 'tasks', labelKey: 'dashboard.analytics.tabs.tasks', fallback: 'Tasks', permission: 'tasks:read' },
  { id: 'scheduling', labelKey: 'dashboard.analytics.tabs.scheduling', fallback: 'Scheduling', permission: 'scheduling:read' },
  { id: 'accounting', labelKey: 'dashboard.analytics.tabs.accounting', fallback: 'Accounting', permission: 'accounting:read' },
  { id: 'system', labelKey: 'dashboard.analytics.tabs.system', fallback: 'System', permission: 'system:read' },
]);

export const KPI_CONFIG = Object.freeze({
  revenue: {
    labelKey: 'dashboard.analytics.kpi.revenue',
    fallback: 'Revenue',
    accent: 'cyan',
    href: '/accounting',
    permission: 'accounting:read',
  },
  customers: {
    labelKey: 'dashboard.analytics.kpi.customers',
    fallback: 'Customers',
    accent: 'violet',
    href: '/crm/customers',
    permission: 'crm:read',
  },
  projects: {
    labelKey: 'dashboard.analytics.kpi.projects',
    fallback: 'Active projects',
    accent: 'blue',
    href: '/projects',
    permission: 'projects:read',
  },
  openTasks: {
    labelKey: 'dashboard.analytics.kpi.openTasks',
    fallback: 'Open tasks',
    accent: 'emerald',
    href: '/tasks',
    permission: 'tasks:read',
  },
  scheduleToday: {
    labelKey: 'dashboard.analytics.kpi.scheduleToday',
    fallback: 'Today schedule',
    accent: 'amber',
    href: '/scheduling',
    permission: 'scheduling:read',
  },
  outstanding: {
    labelKey: 'dashboard.analytics.kpi.outstanding',
    fallback: 'Open balance',
    accent: 'rose',
    href: '/accounting',
    permission: 'accounting:read',
  },
});

export const WORK_QUEUE_CONFIG = Object.freeze({
  overdueTasks: {
    labelKey: 'dashboard.analytics.queue.overdueTasks',
    fallback: 'Overdue tasks',
    href: '/tasks?filter=overdue',
  },
  overdueInvoices: {
    labelKey: 'dashboard.analytics.queue.overdueInvoices',
    fallback: 'Overdue invoices',
    href: '/accounting/receivables',
  },
  projectRisk: {
    labelKey: 'dashboard.analytics.queue.projectRisk',
    fallback: 'Project risks',
    href: '/projects?filter=overdue',
  },
  unconfirmedAppointments: {
    labelKey: 'dashboard.analytics.queue.unconfirmedAppointments',
    fallback: 'Unconfirmed appointments',
    href: '/scheduling',
  },
  auditFailures: {
    labelKey: 'dashboard.analytics.queue.auditFailures',
    fallback: 'Audit failures',
    href: '/settings/audit',
  },
});

export const FEATURE_MIX_COLORS = Object.freeze([
  '#0ea5e9',
  '#06b6d4',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#60a5fa',
]);

export const CHART_COLORS = Object.freeze({
  revenue: '#22d3ee',
  quoteValue: '#38bdf8',
  orderValue: '#34d399',
  cashMovement: '#f59e0b',
  created: '#60a5fa',
  completed: '#22c55e',
  assignments: '#0284c7',
  hours: '#fbbf24',
  failures: '#fb7185',
  successes: '#34d399',
  neutral: '#94a3b8',
});
