export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const TASK_PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const TASK_STATUS_CONFIG = {
  OPEN:        { label: 'Offen',         labelEn: 'Open',        dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  IN_PROGRESS: { label: 'In Bearbeitung',labelEn: 'In Progress', dot: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  COMPLETED:   { label: 'Abgeschlossen', labelEn: 'Completed',   dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  CANCELLED:   { label: 'Storniert',     labelEn: 'Cancelled',   dot: 'bg-red-400',     badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

export const TASK_PRIORITY_CONFIG = {
  NONE:   { label: 'Keine',    labelEn: 'None',   icon: '—',  color: 'text-muted-foreground', badge: 'bg-slate-100 text-slate-500' },
  LOW:    { label: 'Niedrig',  labelEn: 'Low',    icon: '▼',  color: 'text-emerald-600',       badge: 'bg-emerald-100 text-emerald-700' },
  MEDIUM: { label: 'Mittel',   labelEn: 'Medium', icon: '●',  color: 'text-amber-600',         badge: 'bg-amber-100 text-amber-700' },
  HIGH:   { label: 'Hoch',     labelEn: 'High',   icon: '▲',  color: 'text-orange-600',        badge: 'bg-orange-100 text-orange-700' },
  URGENT: { label: 'Dringend', labelEn: 'Urgent', icon: '!!', color: 'text-red-600',           badge: 'bg-red-100 text-red-700' },
};
