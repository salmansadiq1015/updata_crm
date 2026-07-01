const DASHBOARD_METRIC_FALLBACKS = Object.freeze({
  revenue: 'Revenue',
  quoteValue: 'Quote value',
  orderValue: 'Order value',
  cashMovement: 'Cash movement',
  bankTransactions: 'Transactions',
  created: 'Created',
  completed: 'Completed',
  assignments: 'Assignments',
  hours: 'Hours',
  customers: 'Customers',
  projects: 'Projects',
  budget: 'Budget',
  quotes: 'Quotes',
  orders: 'Orders',
  invoices: 'Invoices',
  successes: 'Successes',
  failures: 'Failures',
});

export const DASHBOARD_METRIC_LABEL_KEYS = Object.freeze(
  Object.fromEntries(
    Object.keys(DASHBOARD_METRIC_FALLBACKS).map((key) => [
      key,
      `dashboard.analytics.metrics.${key}`,
    ]),
  ),
);

export const DASHBOARD_BREAKDOWN_LABEL_KEYS = Object.freeze({
  featureMix: {
    crm: 'dashboard.analytics.breakdowns.featureMix.crm',
    projects: 'dashboard.analytics.breakdowns.featureMix.projects',
    sales: 'dashboard.analytics.breakdowns.featureMix.sales',
    tasks: 'dashboard.analytics.breakdowns.featureMix.tasks',
    scheduling: 'dashboard.analytics.breakdowns.featureMix.scheduling',
    accounting: 'dashboard.analytics.breakdowns.featureMix.accounting',
  },
  crmType: {
    private: 'dashboard.analytics.breakdowns.crmType.private',
    individual: 'dashboard.analytics.breakdowns.crmType.private',
    business: 'dashboard.analytics.breakdowns.crmType.business',
    company: 'dashboard.analytics.breakdowns.crmType.business',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  projectStatus: {
    draft: 'dashboard.analytics.breakdowns.status.draft',
    planning: 'dashboard.analytics.breakdowns.projectStatus.planning',
    scheduled: 'dashboard.analytics.breakdowns.projectStatus.scheduled',
    waiting_for_material: 'dashboard.analytics.breakdowns.projectStatus.waitingForMaterial',
    in_progress: 'dashboard.analytics.breakdowns.status.inProgress',
    awaiting_customer_approval: 'dashboard.analytics.breakdowns.projectStatus.awaitingCustomerApproval',
    awaiting_quotation_approval: 'dashboard.analytics.breakdowns.projectStatus.awaitingQuotationApproval',
    on_hold: 'dashboard.analytics.breakdowns.status.onHold',
    completed: 'dashboard.analytics.breakdowns.status.completed',
    invoiced: 'dashboard.analytics.breakdowns.projectStatus.invoiced',
    cancelled: 'dashboard.analytics.breakdowns.status.cancelled',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  projectType: {
    installation: 'dashboard.analytics.breakdowns.projectType.installation',
    maintenance: 'dashboard.analytics.breakdowns.projectType.maintenance',
    service: 'dashboard.analytics.breakdowns.projectType.service',
    repair: 'dashboard.analytics.breakdowns.projectType.repair',
    replacement: 'dashboard.analytics.breakdowns.projectType.replacement',
    renovation: 'dashboard.analytics.breakdowns.projectType.renovation',
    other: 'dashboard.analytics.breakdowns.common.other',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  quoteStatus: {
    draft: 'dashboard.analytics.breakdowns.status.draft',
    sent: 'dashboard.analytics.breakdowns.salesStatus.sent',
    viewed: 'dashboard.analytics.breakdowns.salesStatus.viewed',
    accepted: 'dashboard.analytics.breakdowns.salesStatus.accepted',
    converted: 'dashboard.analytics.breakdowns.salesStatus.converted',
    declined: 'dashboard.analytics.breakdowns.salesStatus.declined',
    expired: 'dashboard.analytics.breakdowns.salesStatus.expired',
    cancelled: 'dashboard.analytics.breakdowns.status.cancelled',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  orderStatus: {
    draft: 'dashboard.analytics.breakdowns.status.draft',
    confirmed: 'dashboard.analytics.breakdowns.orderStatus.confirmed',
    in_progress: 'dashboard.analytics.breakdowns.status.inProgress',
    completed: 'dashboard.analytics.breakdowns.status.completed',
    cancelled: 'dashboard.analytics.breakdowns.status.cancelled',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  invoiceStatus: {
    draft: 'dashboard.analytics.breakdowns.status.draft',
    sent: 'dashboard.analytics.breakdowns.salesStatus.sent',
    partially_paid: 'dashboard.analytics.breakdowns.invoiceStatus.partiallyPaid',
    paid: 'dashboard.analytics.breakdowns.invoiceStatus.paid',
    overdue: 'dashboard.analytics.breakdowns.status.overdue',
    cancelled: 'dashboard.analytics.breakdowns.status.cancelled',
    written_off: 'dashboard.analytics.breakdowns.invoiceStatus.writtenOff',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  taskStatus: {
    open: 'dashboard.analytics.breakdowns.status.open',
    in_progress: 'dashboard.analytics.breakdowns.status.inProgress',
    on_hold: 'dashboard.analytics.breakdowns.status.onHold',
    completed: 'dashboard.analytics.breakdowns.status.completed',
    cancelled: 'dashboard.analytics.breakdowns.status.cancelled',
    archived: 'dashboard.analytics.breakdowns.status.archived',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  taskPriority: {
    low: 'dashboard.analytics.breakdowns.priority.low',
    medium: 'dashboard.analytics.breakdowns.priority.medium',
    high: 'dashboard.analytics.breakdowns.priority.high',
    urgent: 'dashboard.analytics.breakdowns.priority.urgent',
    critical: 'dashboard.analytics.breakdowns.priority.critical',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  schedulingStatus: {
    planned: 'dashboard.analytics.breakdowns.schedulingStatus.planned',
    confirmed: 'dashboard.analytics.breakdowns.orderStatus.confirmed',
    in_progress: 'dashboard.analytics.breakdowns.status.inProgress',
    paused: 'dashboard.analytics.breakdowns.schedulingStatus.paused',
    completed: 'dashboard.analytics.breakdowns.status.completed',
    cancelled: 'dashboard.analytics.breakdowns.status.cancelled',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  schedulingType: {
    installation: 'dashboard.analytics.breakdowns.projectType.installation',
    maintenance: 'dashboard.analytics.breakdowns.projectType.maintenance',
    service: 'dashboard.analytics.breakdowns.projectType.service',
    repair: 'dashboard.analytics.breakdowns.projectType.repair',
    inspection: 'dashboard.analytics.breakdowns.schedulingType.inspection',
    consultation: 'dashboard.analytics.breakdowns.schedulingType.consultation',
    other: 'dashboard.analytics.breakdowns.common.other',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  accountingPayableStatus: {
    recorded: 'dashboard.analytics.breakdowns.payableStatus.recorded',
    approved: 'dashboard.analytics.breakdowns.payableStatus.approved',
    partially_paid: 'dashboard.analytics.breakdowns.invoiceStatus.partiallyPaid',
    paid: 'dashboard.analytics.breakdowns.invoiceStatus.paid',
    disputed: 'dashboard.analytics.breakdowns.payableStatus.disputed',
    cancelled: 'dashboard.analytics.breakdowns.status.cancelled',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  bankStatus: {
    unmatched: 'dashboard.analytics.breakdowns.bankStatus.unmatched',
    matched: 'dashboard.analytics.breakdowns.bankStatus.matched',
    reconciled: 'dashboard.analytics.breakdowns.bankStatus.reconciled',
    ignored: 'dashboard.analytics.breakdowns.bankStatus.ignored',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  journalReferenceType: {
    invoice: 'dashboard.analytics.breakdowns.reference.invoice',
    payment: 'dashboard.analytics.breakdowns.reference.payment',
    bank_transaction: 'dashboard.analytics.breakdowns.reference.bankTransaction',
    manual: 'dashboard.analytics.breakdowns.reference.manual',
    ap_invoice: 'dashboard.analytics.breakdowns.reference.apInvoice',
    ar_invoice: 'dashboard.analytics.breakdowns.reference.arInvoice',
    fx_revaluation: 'dashboard.analytics.breakdowns.reference.fxRevaluation',
    fixed_asset: 'dashboard.analytics.breakdowns.reference.fixedAsset',
    inventory: 'dashboard.analytics.breakdowns.reference.inventory',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  userStatus: {
    active: 'dashboard.analytics.breakdowns.userStatus.active',
    inactive: 'dashboard.analytics.breakdowns.userStatus.inactive',
    suspended: 'dashboard.analytics.breakdowns.userStatus.suspended',
    pending: 'dashboard.analytics.breakdowns.userStatus.pending',
    invited: 'dashboard.analytics.breakdowns.userStatus.invited',
    unknown: 'dashboard.analytics.breakdowns.common.unknown',
  },
  auditEvent: {
    login_success: 'dashboard.activity.loginSuccess',
    login_failed: 'dashboard.activity.loginFailed',
    logout: 'dashboard.activity.logout',
    password_changed: 'dashboard.activity.passwordChanged',
    user_created: 'dashboard.activity.userCreated',
    user_updated: 'dashboard.activity.userUpdated',
    user_deactivated: 'dashboard.activity.userDeactivated',
    role_created: 'dashboard.activity.roleCreated',
    role_updated: 'dashboard.activity.roleUpdated',
    session_revoked: 'dashboard.activity.sessionRevoked',
    account_activated: 'dashboard.activity.accountActivated',
  },
});

function normalizeDashboardKey(value) {
  return String(value || 'unknown')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s.-]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'unknown';
}

function toFallbackLabel(value) {
  return String(value || 'Unknown')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatBucketLabel(key, locale, t, fallback) {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(String(key));
  if (monthMatch) {
    const [, year, month] = monthMatch;
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      year: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
  }

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  if (dayMatch) {
    const [, year, month, day] = dayMatch;
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
  }

  const weekMatch = /^(\d{4})-W(\d{2})$/.exec(String(key));
  if (weekMatch) {
    return t('dashboard.analytics.period.week', 'Wk {week}', {
      year: weekMatch[1],
      week: weekMatch[2],
    });
  }

  return fallback || String(key || '');
}

export function translateDashboardMetric(t, metric) {
  const key = DASHBOARD_METRIC_LABEL_KEYS[metric];
  return key ? t(key, DASHBOARD_METRIC_FALLBACKS[metric]) : toFallbackLabel(metric);
}

export function translateDashboardBreakdownLabel(t, group, id, fallback) {
  const groupMap = DASHBOARD_BREAKDOWN_LABEL_KEYS[group];
  if (!groupMap) return fallback || toFallbackLabel(id);

  const normalizedId = normalizeDashboardKey(id);
  const key = groupMap[id] || groupMap[normalizedId];
  return key ? t(key, fallback || toFallbackLabel(id)) : fallback || toFallbackLabel(id);
}

export function translateDashboardBreakdown(items, t, group) {
  if (!Array.isArray(items) || !group) return items || [];

  return items.map((item) => ({
    ...item,
    label: translateDashboardBreakdownLabel(t, group, item?.id, item?.label),
  }));
}

export function translateDashboardEventType(t, eventType) {
  if (!eventType) return '-';
  return translateDashboardBreakdownLabel(t, 'auditEvent', eventType, eventType);
}

export function localizeDashboardSeries(series, locale, t) {
  if (!Array.isArray(series)) return [];

  return series.map((point) => ({
    ...point,
    label: formatBucketLabel(point?.key, locale, t, point?.label),
  }));
}
