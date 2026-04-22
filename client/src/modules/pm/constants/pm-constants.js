import {
  FileText, Hammer, Wrench, FileSignature, MoreHorizontal,
  DollarSign, Package, CalendarClock, CircleDot,
  ArrowRight, Milestone, Building2, Users,
} from 'lucide-react';

// ── Project statuses ────────────────────────────────────────────
export const PROJECT_STATUSES = [
  'DRAFT', 'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED',
];

export const PROJECT_STATUS_CONFIG = {
  DRAFT: {
    label: 'Entwurf',
    labelEn: 'Draft',
    dotColor: 'bg-slate-400',
    bgColor: 'bg-slate-500/10',
    textColor: 'text-slate-700 dark:text-slate-300',
    borderColor: 'border-slate-300',
  },
  PLANNING: {
    label: 'Planung',
    labelEn: 'Planning',
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-700 dark:text-blue-400',
    borderColor: 'border-blue-300',
  },
  IN_PROGRESS: {
    label: 'In Arbeit',
    labelEn: 'In Progress',
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-700 dark:text-amber-400',
    borderColor: 'border-amber-300',
  },
  ON_HOLD: {
    label: 'Pausiert',
    labelEn: 'On Hold',
    dotColor: 'bg-orange-500',
    bgColor: 'bg-orange-500/10',
    textColor: 'text-orange-700 dark:text-orange-400',
    borderColor: 'border-orange-300',
  },
  COMPLETED: {
    label: 'Abgeschlossen',
    labelEn: 'Completed',
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-700 dark:text-emerald-400',
    borderColor: 'border-emerald-300',
  },
  ARCHIVED: {
    label: 'Archiviert',
    labelEn: 'Archived',
    dotColor: 'bg-gray-400',
    bgColor: 'bg-gray-500/10',
    textColor: 'text-gray-500 dark:text-gray-400',
    borderColor: 'border-gray-300',
  },
};

// Valid status transitions (from → [to])
export const STATUS_TRANSITIONS = {
  DRAFT: ['PLANNING'],
  PLANNING: ['IN_PROGRESS', 'ON_HOLD'],
  IN_PROGRESS: ['COMPLETED', 'ON_HOLD'],
  ON_HOLD: ['PLANNING', 'IN_PROGRESS'],
  COMPLETED: ['IN_PROGRESS', 'ARCHIVED'],
  ARCHIVED: [],
};

// ── Project types ───────────────────────────────────────────────
export const PROJECT_TYPES = [
  'NEW_INSTALLATION', 'RENOVATION', 'MAINTENANCE', 'SERVICE_CONTRACT', 'OTHER',
];

export const PROJECT_TYPE_CONFIG = {
  NEW_INSTALLATION: { label: 'Neuinstallation', labelEn: 'New Installation', icon: Hammer },
  RENOVATION: { label: 'Sanierung', labelEn: 'Renovation', icon: Wrench },
  MAINTENANCE: { label: 'Wartung', labelEn: 'Maintenance', icon: CalendarClock },
  SERVICE_CONTRACT: { label: 'Servicevertrag', labelEn: 'Service Contract', icon: FileSignature },
  OTHER: { label: 'Sonstiges', labelEn: 'Other', icon: MoreHorizontal },
};

// ── Preparatory action types ────────────────────────────────────
export const PREP_ACTION_TYPES = [
  'FUNDING_APPLICATION', 'MATERIAL_ORDER', 'SCHEDULING', 'OTHER',
];

export const PREP_ACTION_TYPE_CONFIG = {
  FUNDING_APPLICATION: { label: 'Foerderantrag', labelEn: 'Funding Application', icon: DollarSign },
  MATERIAL_ORDER: { label: 'Materialbestellung', labelEn: 'Material Order', icon: Package },
  SCHEDULING: { label: 'Terminplanung', labelEn: 'Scheduling', icon: CalendarClock },
  OTHER: { label: 'Sonstiges', labelEn: 'Other', icon: MoreHorizontal },
};

// ── Preparatory action statuses ─────────────────────────────────
export const PREP_ACTION_STATUSES = [
  'CREATED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED',
];

export const PREP_ACTION_STATUS_CONFIG = {
  CREATED: { label: 'Erstellt', labelEn: 'Created', dotColor: 'bg-slate-400', bgColor: 'bg-slate-500/10', textColor: 'text-slate-700 dark:text-slate-300' },
  IN_PROGRESS: { label: 'In Arbeit', labelEn: 'In Progress', dotColor: 'bg-blue-500', bgColor: 'bg-blue-500/10', textColor: 'text-blue-700 dark:text-blue-400' },
  COMPLETED: { label: 'Abgeschlossen', labelEn: 'Completed', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400' },
  REJECTED: { label: 'Abgelehnt', labelEn: 'Rejected', dotColor: 'bg-red-500', bgColor: 'bg-red-500/10', textColor: 'text-red-700 dark:text-red-400' },
  CANCELLED: { label: 'Storniert', labelEn: 'Cancelled', dotColor: 'bg-gray-400', bgColor: 'bg-gray-500/10', textColor: 'text-gray-500 dark:text-gray-400' },
};

// ── Funding statuses ────────────────────────────────────────────
export const FUNDING_STATUSES = [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED',
];

export const FUNDING_STATUS_CONFIG = {
  DRAFT: { label: 'Entwurf', labelEn: 'Draft', dotColor: 'bg-slate-400', bgColor: 'bg-slate-500/10', textColor: 'text-slate-700 dark:text-slate-300' },
  SUBMITTED: { label: 'Eingereicht', labelEn: 'Submitted', dotColor: 'bg-blue-500', bgColor: 'bg-blue-500/10', textColor: 'text-blue-700 dark:text-blue-400' },
  APPROVED: { label: 'Genehmigt', labelEn: 'Approved', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400' },
  PARTIALLY_APPROVED: { label: 'Teilgenehmigt', labelEn: 'Partially Approved', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10', textColor: 'text-amber-700 dark:text-amber-400' },
  REJECTED: { label: 'Abgelehnt', labelEn: 'Rejected', dotColor: 'bg-red-500', bgColor: 'bg-red-500/10', textColor: 'text-red-700 dark:text-red-400' },
};

// ── Delivery statuses ───────────────────────────────────────────
export const DELIVERY_STATUSES = [
  'PENDING', 'ORDERED', 'PARTIALLY_DELIVERED', 'DELIVERED',
];

export const DELIVERY_STATUS_CONFIG = {
  PENDING: { label: 'Ausstehend', labelEn: 'Pending', dotColor: 'bg-slate-400', bgColor: 'bg-slate-500/10', textColor: 'text-slate-700 dark:text-slate-300' },
  ORDERED: { label: 'Bestellt', labelEn: 'Ordered', dotColor: 'bg-blue-500', bgColor: 'bg-blue-500/10', textColor: 'text-blue-700 dark:text-blue-400' },
  PARTIALLY_DELIVERED: { label: 'Teilgeliefert', labelEn: 'Partially Delivered', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10', textColor: 'text-amber-700 dark:text-amber-400' },
  DELIVERED: { label: 'Geliefert', labelEn: 'Delivered', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400' },
};

// ── Schedule entry types ────────────────────────────────────────
export const SCHEDULE_ENTRY_TYPES = ['PHASE', 'MILESTONE'];

export const SCHEDULE_ENTRY_TYPE_CONFIG = {
  PHASE: { label: 'Phase', labelEn: 'Phase', icon: ArrowRight },
  MILESTONE: { label: 'Meilenstein', labelEn: 'Milestone', icon: Milestone },
};

// ── Schedule statuses ───────────────────────────────────────────
export const SCHEDULE_STATUSES = [
  'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'WAIVED',
];

export const SCHEDULE_STATUS_CONFIG = {
  PLANNED: { label: 'Geplant', labelEn: 'Planned', dotColor: 'bg-slate-400', bgColor: 'bg-slate-500/10', textColor: 'text-slate-700 dark:text-slate-300' },
  IN_PROGRESS: { label: 'In Arbeit', labelEn: 'In Progress', dotColor: 'bg-blue-500', bgColor: 'bg-blue-500/10', textColor: 'text-blue-700 dark:text-blue-400' },
  COMPLETED: { label: 'Abgeschlossen', labelEn: 'Completed', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400' },
  CANCELLED: { label: 'Storniert', labelEn: 'Cancelled', dotColor: 'bg-gray-400', bgColor: 'bg-gray-500/10', textColor: 'text-gray-500 dark:text-gray-400' },
  WAIVED: { label: 'Verzichtet', labelEn: 'Waived', dotColor: 'bg-purple-400', bgColor: 'bg-purple-500/10', textColor: 'text-purple-700 dark:text-purple-400' },
};

// ── Responsible types ───────────────────────────────────────────
export const RESPONSIBLE_TYPES = ['INTERNAL_TEAM', 'PARTNER_COMPANY'];

export const RESPONSIBLE_TYPE_CONFIG = {
  INTERNAL_TEAM: { label: 'Internes Team', labelEn: 'Internal Team', icon: Users },
  PARTNER_COMPANY: { label: 'Partnerfirma', labelEn: 'Partner Company', icon: Building2 },
};

// ── Confirmation statuses ───────────────────────────────────────
export const CONFIRMATION_STATUSES = [
  'DRAFT', 'SENT', 'CONFIRMED', 'DECLINED', 'ALTERNATIVE_PROPOSED',
];

export const CONFIRMATION_STATUS_CONFIG = {
  DRAFT: { label: 'Entwurf', labelEn: 'Draft', dotColor: 'bg-slate-400', bgColor: 'bg-slate-500/10', textColor: 'text-slate-700 dark:text-slate-300' },
  SENT: { label: 'Gesendet', labelEn: 'Sent', dotColor: 'bg-blue-500', bgColor: 'bg-blue-500/10', textColor: 'text-blue-700 dark:text-blue-400' },
  CONFIRMED: { label: 'Bestaetigt', labelEn: 'Confirmed', dotColor: 'bg-emerald-500', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-700 dark:text-emerald-400' },
  DECLINED: { label: 'Abgelehnt', labelEn: 'Declined', dotColor: 'bg-red-500', bgColor: 'bg-red-500/10', textColor: 'text-red-700 dark:text-red-400' },
  ALTERNATIVE_PROPOSED: { label: 'Alternative vorgeschlagen', labelEn: 'Alternative Proposed', dotColor: 'bg-amber-500', bgColor: 'bg-amber-500/10', textColor: 'text-amber-700 dark:text-amber-400' },
};

// ── Document categories ─────────────────────────────────────────
export const DOCUMENT_CATEGORIES = [
  'PLANS', 'CONTRACTS', 'PHOTOS', 'CORRESPONDENCE', 'REPORTS', 'OTHER',
];

export const DOCUMENT_CATEGORY_CONFIG = {
  PLANS: { label: 'Plaene', labelEn: 'Plans', icon: FileText },
  CONTRACTS: { label: 'Vertraege', labelEn: 'Contracts', icon: FileSignature },
  PHOTOS: { label: 'Fotos', labelEn: 'Photos', icon: CircleDot },
  CORRESPONDENCE: { label: 'Korrespondenz', labelEn: 'Correspondence', icon: FileText },
  REPORTS: { label: 'Berichte', labelEn: 'Reports', icon: FileText },
  OTHER: { label: 'Sonstiges', labelEn: 'Other', icon: MoreHorizontal },
};

// ── Color accent picker (for project cards) ─────────────────────
const ACCENT_PALETTE = [
  { bar: 'from-blue-500 to-indigo-500', bg: 'bg-blue-500/10', text: 'text-blue-600', ring: 'ring-blue-200' },
  { bar: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-500/10', text: 'text-emerald-600', ring: 'ring-emerald-200' },
  { bar: 'from-violet-500 to-purple-500', bg: 'bg-violet-500/10', text: 'text-violet-600', ring: 'ring-violet-200' },
  { bar: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10', text: 'text-amber-600', ring: 'ring-amber-200' },
  { bar: 'from-rose-500 to-pink-500', bg: 'bg-rose-500/10', text: 'text-rose-600', ring: 'ring-rose-200' },
];

export function pickProjectAccent(project) {
  if (!project?._id) return ACCENT_PALETTE[0];
  const hash = project._id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}
