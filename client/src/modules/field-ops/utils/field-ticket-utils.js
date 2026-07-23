export const FIELD_TICKET_TYPES = [
  'TECHNICAL_NOTIFICATION',
  'SERVICE_REQUEST',
  'INCIDENT',
  'MAINTENANCE_ISSUE',
];

export const FIELD_TICKET_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const FIELD_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING', 'COMPLETED'];

export const FIELD_TICKET_TYPE_LABELS = {
  TECHNICAL_NOTIFICATION: { de: 'Technische Meldung', en: 'Technical Alert' },
  SERVICE_REQUEST: { de: 'Serviceanfrage', en: 'Service Request' },
  INCIDENT: { de: 'Vorfall', en: 'Incident' },
  MAINTENANCE_ISSUE: { de: 'Wartungsthema', en: 'Maintenance Issue' },
};

export const FIELD_TICKET_STATUS_CONFIG = {
  OPEN: {
    de: 'Offen',
    en: 'Open',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  IN_PROGRESS: {
    de: 'In Arbeit',
    en: 'In Progress',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  PENDING: {
    de: 'Wartend',
    en: 'Pending',
    className: 'border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300',
    dot: 'bg-brand-500',
  },
  COMPLETED: {
    de: 'Erledigt',
    en: 'Completed',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
};

export const FIELD_TICKET_PRIORITY_CONFIG = {
  CRITICAL: {
    de: 'Kritisch',
    en: 'Critical',
    className: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    weight: 4,
  },
  HIGH: {
    de: 'Hoch',
    en: 'High',
    className: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
    weight: 3,
  },
  MEDIUM: {
    de: 'Mittel',
    en: 'Medium',
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
    weight: 2,
  },
  LOW: {
    de: 'Niedrig',
    en: 'Low',
    className: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-500',
    weight: 1,
  },
};

export function normalizeFieldTicketPage(payload) {
  const source = payload?.data && !payload.items ? payload.data : payload;
  return {
    items: Array.isArray(source?.items) ? source.items : [],
    pagination: source?.pagination || { hasNext: false, nextCursor: null, limit: 25 },
    summary: source?.summary || {
      total: 0,
      overdue: 0,
      escalated: 0,
      byStatus: {},
      byPriority: {},
    },
  };
}

export function userDisplayName(user, fallback = 'Unassigned') {
  if (!user) return fallback;
  if (typeof user === 'string') return user;
  const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return fullName || user.email || fallback;
}

export function isTicketOverdue(ticket, now = Date.now()) {
  if (!ticket?.dueAt || ticket.status === 'COMPLETED') return false;
  return new Date(ticket.dueAt).getTime() < now;
}

export function labelFor(config, value, locale = 'de') {
  const item = config[value];
  if (!item) return value;
  return locale === 'de' ? item.de : item.en;
}

export function getTicketSearchText(ticket) {
  return [
    ticket.ticketNumber,
    ticket.title,
    ticket.description,
    ticket.customerName,
    ticket.projectName,
    ticket.assetName,
    ticket.jobNumber,
  ].filter(Boolean).join(' ').toLowerCase();
}
