'use client';

import { useMemo } from 'react';
import { CheckCircle2, ClipboardCheck, ShieldAlert, TimerReset } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useTaskDashboardOverview } from '../hooks/use-task-dashboard-overview';
import { buildTaskDashboardAnalytics } from '../utils/task-dashboard-analytics';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Which task set a tile stands for; `null` means the tile is not a filter. */
export type TaskMetricFilter = 'open' | 'completedThisWeek' | 'overdue' | null;

const ACCENTS = {
  violet: { text: 'text-blue-600 dark:text-sky-300', surface: 'bg-blue-500/10', border: 'border-blue-500/20' },
  emerald: { text: 'text-emerald-600 dark:text-emerald-400', surface: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  rose: { text: 'text-rose-600 dark:text-rose-400', surface: 'bg-rose-500/10', border: 'border-rose-500/20' },
  sky: { text: 'text-sky-600 dark:text-sky-400', surface: 'bg-sky-500/10', border: 'border-sky-500/20' },
} as const;

/**
 * The four status tiles of the former dashboard, now heading the tasks
 * workspace. Three of them filter the list below; the coverage tile is a
 * read-out, so it is not clickable.
 */
export function TaskMetricTiles({
  active,
  onSelect,
}: {
  active: TaskMetricFilter;
  onSelect: (filter: TaskMetricFilter) => void;
}) {
  const { locale, t } = useLanguage() as { locale: string; t: (k: string, f?: string, v?: Record<string, unknown>) => string };
  const query = useTaskDashboardOverview(7);
  const analytics = useMemo(() => buildTaskDashboardAnalytics(query.data, 7), [query.data]);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }
  if (query.isError && !query.data) return null;

  const tiles = [
    {
      key: 'open' as const,
      title: t('tasks.dashboard.open', 'Offen'),
      value: numberFormatter.format(analytics.stats.totalOpen),
      detail: t('tasks.dashboard.totalTasks', '{count} Aufgaben insgesamt', { count: analytics.stats.totalTasks }),
      icon: ClipboardCheck,
      accent: 'violet' as const,
    },
    {
      key: 'completedThisWeek' as const,
      title: t('tasks.dashboard.completedThisWeek', 'Diese Woche abgeschlossen'),
      value: numberFormatter.format(analytics.stats.completedThisWeek),
      detail: t('tasks.dashboard.weeklyCloseRate', '{count}% Abschlussquote diese Woche', { count: analytics.weeklyCloseRate }),
      icon: CheckCircle2,
      accent: 'emerald' as const,
    },
    {
      key: 'overdue' as const,
      title: t('tasks.dashboard.overdue', 'Überfällig'),
      value: numberFormatter.format(analytics.stats.overdueCount),
      detail: t('tasks.dashboard.overdueRate', '{count}% der offenen Arbeit', { count: analytics.overdueRate }),
      icon: ShieldAlert,
      accent: 'rose' as const,
    },
    {
      key: null,
      title: t('tasks.dashboard.dueDateCoverage', 'Fälligkeits-Abdeckung'),
      value: query.data?.sampleUnavailable ? "—" : `${analytics.dueDateCoverage}%`,
      detail: t('tasks.dashboard.visibleActive', '{count} aktive erfasst', { count: analytics.totalVisibleActive }),
      icon: TimerReset,
      accent: 'sky' as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      {tiles.map((tile) => {
        const theme = ACCENTS[tile.accent];
        const clickable = tile.key !== null;
        const isActive = clickable && active === tile.key;
        const Icon = tile.icon;

        return (
          <button
            key={tile.title}
            type="button"
            // Clicking the active tile clears the filter — the way back out.
            onClick={clickable ? () => onSelect(isActive ? null : tile.key) : undefined}
            disabled={!clickable}
            aria-pressed={clickable ? isActive : undefined}
            className={cn(
              'group relative overflow-hidden rounded-xl border bg-card p-3 text-left sm:p-4 shadow-theme-sm transition-all duration-200',
              theme.border,
              clickable && 'hover:-translate-y-0.5 hover:shadow-theme-md',
              !clickable && 'cursor-default',
              isActive && 'ring-2 ring-primary/50',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase leading-4 text-muted-foreground sm:text-xs">{tile.title}</p>
                <p className={cn('mt-2 text-2xl font-semibold sm:text-3xl leading-none tabular-nums tracking-tight', theme.text)}>
                  {tile.value}
                </p>
                <p className="mt-2 hidden min-h-8 text-xs leading-4 text-muted-foreground sm:block">{tile.detail}</p>
              </div>
              <div className={cn(
                'hidden h-8 w-8 shrink-0 sm:flex items-center justify-center rounded-xl border transition-transform duration-200',
                clickable && 'group-hover:scale-105',
                theme.surface, theme.border,
              )}>
                <Icon className={cn('h-4 w-4', theme.text)} />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
