export const RECONCILIATION_STATUSES = ['UNMATCHED', 'AUTO_MATCHED', 'MANUALLY_MATCHED', 'CATEGORIZED'];

export const RECONCILIATION_STATUS_CONFIG = {
  UNMATCHED:       { label: 'Nicht abgeglichen', labelEn: 'Unmatched',       badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-500' },
  AUTO_MATCHED:    { label: 'Auto abgeglichen',  labelEn: 'Auto Matched',    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  MANUALLY_MATCHED:{ label: 'Manuell abgeglichen', labelEn: 'Manually Matched', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
  CATEGORIZED:     { label: 'Kategorisiert',    labelEn: 'Categorized',      badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', dot: 'bg-violet-500' },
};
