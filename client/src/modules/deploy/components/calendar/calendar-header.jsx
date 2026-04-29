'use client';

import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { CALENDAR_VIEWS } from '../../constants/deploy-constants';
import { FilterBar } from '../shared/filter-bar';

const VIEW_OPTIONS = [
  { key: CALENDAR_VIEWS.DAY, labelKey: 'deploy.calendar.day', fallback: 'Tag' },
  { key: CALENDAR_VIEWS.WEEK, labelKey: 'deploy.calendar.week', fallback: 'Woche' },
  { key: CALENDAR_VIEWS.MONTH, labelKey: 'deploy.calendar.month', fallback: 'Monat' },
];

export function CalendarHeader({
  title,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onNewAssignment,
  onPrint,
}) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* Top row: title + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            {t('deploy.title', 'Einsatzplanung')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {onPrint && (
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="h-4 w-4 mr-1.5" />
              {t('deploy.calendar.print', 'Drucken')}
            </Button>
          )}
          {onNewAssignment && (
            <Button size="sm" onClick={onNewAssignment}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t('deploy.assignments.create', 'Einsatz erstellen')}
            </Button>
          )}
        </div>
      </div>

      {/* Bottom row: navigation + view toggle + filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={onToday}>
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
              {t('deploy.calendar.today', 'Heute')}
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <span className="text-sm font-medium text-foreground ml-2">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <FilterBar />

          {/* View toggle */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {VIEW_OPTIONS.map(({ key, labelKey, fallback }) => (
              <button
                key={key}
                onClick={() => onViewChange(key)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-colors',
                  view === key
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(labelKey, fallback)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
