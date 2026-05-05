export const ARTICLE_TYPES = ['MATERIAL', 'SERVICE'];
export const ARTICLE_STATUSES = ['ACTIVE', 'INACTIVE'];
export const ARTICLE_SOURCES = ['INTERNAL', 'IGH'];

export const ARTICLE_TYPE_CONFIG = {
  MATERIAL: { label: 'Material', labelEn: 'Material', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400', icon: '📦' },
  SERVICE:  { label: 'Dienstleistung', labelEn: 'Service',  badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', icon: '🔧' },
};

export const ARTICLE_STATUS_CONFIG = {
  ACTIVE:   { label: 'Aktiv',    labelEn: 'Active',   dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  INACTIVE: { label: 'Inaktiv', labelEn: 'Inactive', dot: 'bg-slate-400',   badge: 'bg-slate-100   text-slate-600   dark:bg-slate-800      dark:text-slate-400'    },
};
