import {
  ORDER_STATUS, ORDER_TYPE, ORDER_PRIORITY,
  REPORT_STATUS, ACTIVITY_TYPE, RELEASE_STATUS,
  PHOTO_CATEGORY, NOTIFICATION_TYPE,
} from '@/modules/mobile/constants/mobile-constants';

export { ORDER_STATUS, ORDER_TYPE, ORDER_PRIORITY, REPORT_STATUS, ACTIVITY_TYPE, RELEASE_STATUS, PHOTO_CATEGORY, NOTIFICATION_TYPE };

export const ORDER_STATUS_CONFIG = {
  PLANNED:     { label: 'Geplant',       labelEn: 'Planned',      dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  CONFIRMED:   { label: 'Bestätigt',    labelEn: 'Confirmed',    dot: 'bg-cyan-400',    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' },
  IN_PROGRESS: { label: 'In Arbeit',     labelEn: 'In Progress',  dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  PAUSED:      { label: 'Pausiert',      labelEn: 'Paused',       dot: 'bg-orange-400',  badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
  COMPLETED:   { label: 'Abgeschlossen', labelEn: 'Completed',    dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  CANCELLED:   { label: 'Storniert',     labelEn: 'Cancelled',    dot: 'bg-red-400',     badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

export const REPORT_STATUS_CONFIG = {
  DRAFT:     { label: 'Entwurf',      labelEn: 'Draft',      dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-700' },
  SUBMITTED: { label: 'Eingereicht',  labelEn: 'Submitted',  dot: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-700' },
  APPROVED:  { label: 'Genehmigt',    labelEn: 'Approved',   dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
  REJECTED:  { label: 'Abgelehnt',    labelEn: 'Rejected',   dot: 'bg-red-400',     badge: 'bg-red-100 text-red-700' },
  INVOICED:  { label: 'Verrechnet',   labelEn: 'Invoiced',   dot: 'bg-violet-400',  badge: 'bg-violet-100 text-violet-700' },
};

export const REPORT_ARCHIVE_BADGE = 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300';

export const RELEASE_STATUS_CONFIG = {
  PENDING:  { label: 'Ausstehend',  labelEn: 'Pending',  dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700' },
  RELEASED: { label: 'Freigegeben', labelEn: 'Released', dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
  LOCKED:   { label: 'Gesperrt',    labelEn: 'Locked',   dot: 'bg-red-400',     badge: 'bg-red-100 text-red-700' },
};

export const ACTIVITY_TYPE_LABELS = {
  TRAVEL:         { label: 'Reise',      labelEn: 'Travel' },
  ONSITE_WORK:    { label: 'Vor Ort',    labelEn: 'On-site' },
  ADMINISTRATIVE: { label: 'Verwaltung', labelEn: 'Admin' },
  OTHER:          { label: 'Sonstiges',  labelEn: 'Other' },
};

export const ORDER_TYPE_LABELS = {
  SERVICE_CALL:  { label: 'Serviceeinsatz', labelEn: 'Service Call' },
  PROJECT_WORK:  { label: 'Projektarbeit',  labelEn: 'Project Work' },
  MAINTENANCE:   { label: 'Wartung',        labelEn: 'Maintenance' },
  INSTALLATION:  { label: 'Installation',   labelEn: 'Installation' },
  INSPECTION:    { label: 'Inspektion',     labelEn: 'Inspection' },
};
