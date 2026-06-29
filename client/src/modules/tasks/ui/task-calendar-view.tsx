'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Circle, CircleCheck, CircleDashed, CirclePause, CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { Task, TaskStatus } from '../types/task-types';
import { taskPriorityIconColor, taskStatusIconColor } from './task-ui-constants';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<TaskStatus, React.ComponentType<{ className?: string }>> = {
  OPEN:        Circle,
  IN_PROGRESS: CircleDashed,
  ON_HOLD:      CirclePause,
  COMPLETED:   CircleCheck,
  CANCELLED:   CircleX,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOffset(year: number, month: number, weekStartsOnMonday: boolean) {
  const day = new Date(year, month, 1).getDay();
  return weekStartsOnMonday ? (day + 6) % 7 : day;
}

function groupByDueDate(tasks: Task[]): Record<string, Task[]> {
  const map: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const key = t.dueDate.slice(0, 10);
    (map[key] ??= []).push(t);
  }
  return map;
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskCalendarViewProps = {
  tasks: Task[];
  listId?: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function TaskCalendarView({ tasks, listId }: TaskCalendarViewProps) {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today.getFullYear(), today.getMonth(), today.getDate()), [today]);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const tasksByDate = useMemo(() => groupByDueDate(tasks), [tasks]);
  const noDateTasks = useMemo(() => tasks.filter((t) => !t.dueDate), [tasks]);
  const weekStartsOnMonday = locale === 'de' || locale === 'fr' || locale === 'it';
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale === 'de' ? 'de-CH' : 'en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1)),
    [locale, month, year],
  );
  const dayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, day) =>
      new Intl.DateTimeFormat(locale === 'de' ? 'de-CH' : 'en-US', { weekday: 'short' }).format(new Date(2026, 1, day + (weekStartsOnMonday ? 2 : 1)))),
    [locale, weekStartsOnMonday],
  );

  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOffset(year, month, weekStartsOnMonday);

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  // Build grid: leading empty cells + day cells
  const cells: Array<{ day: number | null; dateKey: string | null }> = [
    ...Array.from({ length: firstDow }, () => ({ day: null, dateKey: null })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      dateKey: toDateKey(year, month, i + 1),
    })),
  ];
  // Pad to complete last week row
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) cells.push({ day: null, dateKey: null });
  }

  const navigate = (taskId: string) =>
    router.push(`/tasks/${listId ?? 'all'}/${taskId}`);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold tabular-nums">
          {monthLabel}
        </h2>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>
          {t('common.today', 'Today')}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Main calendar grid ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Day-of-week headers */}
          <div className="grid shrink-0 grid-cols-7 border-b border-border bg-muted/30">
            {dayLabels.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid flex-1 grid-cols-7 overflow-y-auto" style={{ gridAutoRows: 'minmax(80px, 1fr)' }}>
            {cells.map((cell, idx) => {
              if (!cell.day || !cell.dateKey) {
                return <div key={`empty-${idx}`} className="border-b border-r border-border/40 bg-muted/10" />;
              }

              const dateKey = cell.dateKey;
              const dayTasks = tasksByDate[dateKey] ?? [];
              const isToday = dateKey === todayKey;
              const isPast = dateKey < todayKey;
              const isExpanded = expandedDay === dateKey;
              const overflow = dayTasks.length - 3;
              const visibleTasks = isExpanded ? dayTasks : dayTasks.slice(0, 3);

              return (
                <div
                  key={dateKey}
                  className={cn(
                    'flex flex-col border-b border-r border-border/40 p-1.5 transition-colors',
                    isPast && !isToday && 'bg-muted/10',
                    isToday && 'bg-primary/5',
                  )}
                >
                  {/* Day number */}
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                        isToday
                          ? 'bg-primary text-primary-foreground'
                          : isPast
                            ? 'text-muted-foreground'
                            : 'text-foreground',
                      )}
                    >
                      {cell.day}
                    </span>
                    {dayTasks.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{dayTasks.length}</span>
                    )}
                  </div>

                  {/* Task chips */}
                  <div className="flex-1 space-y-0.5 overflow-hidden">
                    {visibleTasks.map((task) => {
                      const Icon = STATUS_ICON[task.status];
                      return (
                        <button
                          key={task.id}
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-colors hover:bg-accent',
                            task.status === 'COMPLETED' && 'opacity-60',
                          )}
                          onClick={() => navigate(task.id)}
                        >
                          <Icon className={cn('h-2.5 w-2.5 shrink-0', taskStatusIconColor[task.status])} />
                          <span className="min-w-0 truncate">{task.title}</span>
                        </button>
                      );
                    })}
                    {!isExpanded && overflow > 0 && (
                      <button
                        type="button"
                        className="w-full px-1 text-left text-[10px] text-primary hover:underline"
                        onClick={() => setExpandedDay(isExpanded ? null : dateKey)}
                      >
                        +{overflow} {t('common.more', 'more')}
                      </button>
                    )}
                    {isExpanded && (
                      <button
                        type="button"
                        className="w-full px-1 text-left text-[10px] text-muted-foreground hover:underline"
                        onClick={() => setExpandedDay(null)}
                      >
                        {t('common.less', 'Show less')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right panel: tasks without due date ── */}
        {noDateTasks.length > 0 && (
          <aside className="flex w-52 shrink-0 flex-col border-l border-border">
            <div className="shrink-0 border-b border-border px-3 py-2.5">
              <p className="text-xs font-semibold text-muted-foreground">{t('tasks.noDueDate', 'No due date')}</p>
              <p className="text-[10px] text-muted-foreground">{t('tasks.taskCount', '{count} Aufgabe(n)', { count: noDateTasks.length })}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {noDateTasks.map((task) => {
                const Icon = STATUS_ICON[task.status];
                return (
                  <button
                    key={task.id}
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                    onClick={() => navigate(task.id)}
                  >
                    <Icon className={cn('h-3 w-3 shrink-0', taskStatusIconColor[task.status])} />
                    <span className="min-w-0 truncate">{task.title}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
