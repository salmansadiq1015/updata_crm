'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { ORDER_STATUS } from '../constants/mobile-constants';
import { cn } from '@/lib/utils';

const FILTER_OPTIONS = [
  { key: 'today', labelKey: 'mobile.orders.filterToday', labelFallback: 'Heute' },
  { key: 'all', labelKey: 'mobile.orders.filterAll', labelFallback: 'Alle' },
  { key: ORDER_STATUS.PLANNED, labelKey: null, label: { de: 'Geplant', en: 'Planned' } },
  { key: ORDER_STATUS.IN_PROGRESS, labelKey: null, label: { de: 'In Arbeit', en: 'In Progress' } },
  { key: ORDER_STATUS.COMPLETED, labelKey: null, label: { de: 'Erledigt', en: 'Done' } },
];

export function OrderFilters({ activeFilter, onFilterChange }) {
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-none">
      {FILTER_OPTIONS.map((opt) => {
        const label = opt.labelKey
          ? t(opt.labelKey, opt.labelFallback)
          : opt.label[lang];

        return (
          <button
            key={opt.key}
            onClick={() => onFilterChange(opt.key)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              'border',
              activeFilter === opt.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
