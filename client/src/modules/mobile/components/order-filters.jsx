'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { ORDER_STATUS, ORDER_TYPE } from '../constants/mobile-constants';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { key: 'today', label: { de: 'Heute', en: 'Today' } },
  { key: 'all', label: { de: 'Alle', en: 'All' } },
  { key: ORDER_STATUS.PLANNED, label: { de: 'Geplant', en: 'Planned' } },
  { key: ORDER_STATUS.IN_PROGRESS, label: { de: 'In Arbeit', en: 'In Progress' } },
  { key: ORDER_STATUS.COMPLETED, label: { de: 'Erledigt', en: 'Done' } },
];

const TYPE_OPTIONS = [
  { key: 'all_types', label: { de: 'Alle Typen', en: 'All Types' } },
  { key: ORDER_TYPE.SERVICE_CALL, label: { de: 'Störung', en: 'Service' } },
  { key: ORDER_TYPE.PROJECT_WORK, label: { de: 'Projekt', en: 'Project' } },
  { key: ORDER_TYPE.MAINTENANCE, label: { de: 'Wartung', en: 'Maintenance' } },
  { key: ORDER_TYPE.INSTALLATION, label: { de: 'Installation', en: 'Installation' } },
  { key: ORDER_TYPE.INSPECTION, label: { de: 'Inspektion', en: 'Inspection' } },
];

const SORT_OPTIONS = [
  { key: 'time', label: { de: 'Zeit', en: 'Time' } },
  { key: 'priority', label: { de: 'Priorität', en: 'Priority' } },
  { key: 'customer', label: { de: 'Kunde', en: 'Customer' } },
];

function Chip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border'
      )}
    >
      {label}
    </button>
  );
}

export function OrderFilters({ activeFilter, onFilterChange, activeType, onTypeChange, activeSort, onSortChange }) {
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';

  return (
    <div className="border-b border-border">
      {/* Row 1: Status filters */}
      <div className="flex gap-2 overflow-x-auto px-4 py-2 scrollbar-none">
        {STATUS_OPTIONS.map((opt) => (
          <Chip
            key={opt.key}
            active={activeFilter === opt.key}
            onClick={() => onFilterChange(opt.key)}
            label={opt.label[lang]}
          />
        ))}
      </div>

      {/* Row 2: Type filters */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
        {TYPE_OPTIONS.map((opt) => (
          <Chip
            key={opt.key}
            active={(activeType || 'all_types') === opt.key}
            onClick={() => onTypeChange?.(opt.key)}
            label={opt.label[lang]}
          />
        ))}
        <span className="shrink-0 w-px bg-border mx-1" />
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onSortChange?.(opt.key)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border flex items-center gap-1',
              (activeSort || 'time') === opt.key
                ? 'bg-muted border-foreground/30 text-foreground'
                : 'bg-background border-border text-muted-foreground'
            )}
          >
            {(activeSort || 'time') === opt.key && (
              <span className="text-[10px]">↑</span>
            )}
            {opt.label[lang]}
          </button>
        ))}
      </div>
    </div>
  );
}
