'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Circle, CircleCheck, CircleDashed, CircleX, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Task, TaskStatus } from '../types/task-types';
import { taskPriorityIconColor, taskStatusIconColor } from './task-ui-constants';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_WIDTH = 40; // px per day column
const ROW_HEIGHT = 40; // px per task row
const LABEL_WIDTH = 280; // px for left task label column

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STATUS_ICON: Record<TaskStatus, React.ComponentType<{ className?: string }>> = {
  OPEN:        Circle,
  IN_PROGRESS: CircleDashed,
  COMPLETED:   CircleCheck,
  CANCELLED:   CircleX,
};

const STATUS_BAR_COLOR: Record<TaskStatus, string> = {
  OPEN:        'bg-muted-foreground/40',
  IN_PROGRESS: 'bg-primary/70',
  COMPLETED:   'bg-emerald-500/80',
  CANCELLED:   'bg-red-500/50',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

function buildDateRange(centerDate: Date, spanDays: number): Date[] {
  const start = addDays(startOfDay(centerDate), -Math.floor(spanDays / 3));
  return Array.from({ length: spanDays }, (_, i) => addDays(start, i));
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TaskTimelineViewProps = {
  tasks: Task[];
  listId?: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function TaskTimelineView({ tasks, listId }: TaskTimelineViewProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const [spanDays] = useState(90);
  const [offset, setOffset] = useState(0); // shift in days

  const dates = useMemo(() => {
    const center = addDays(today, offset);
    return buildDateRange(center, spanDays);
  }, [today, offset, spanDays]);

  const rangeStart = dates[0];
  const rangeEnd = dates[dates.length - 1];

  const todayIndex = useMemo(() => daysBetween(rangeStart, today), [rangeStart, today]);

  // Split tasks
  const { scheduledTasks, unscheduledTasks } = useMemo(() => {
    const scheduled: Task[] = [];
    const unscheduled: Task[] = [];
    for (const t of tasks) {
      if (t.dueDate || t.startDate) scheduled.push(t);
      else unscheduled.push(t);
    }
    return { scheduledTasks: scheduled, unscheduledTasks: unscheduled };
  }, [tasks]);

  // Month header groups: { label, startIdx, spanDays }
  const monthGroups = useMemo(() => {
    const groups: Array<{ label: string; startIdx: number; count: number }> = [];
    let cur: { label: string; startIdx: number; count: number } | null = null;
    dates.forEach((d, i) => {
      const label = `${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
      if (!cur || cur.label !== label) {
        if (cur) groups.push(cur);
        cur = { label, startIdx: i, count: 1 };
      } else {
        cur.count++;
      }
    });
    if (cur) groups.push(cur);
    return groups;
  }, [dates]);

  const goBack = () => setOffset((o) => o - 30);
  const goForward = () => setOffset((o) => o + 30);
  const goToday = () => {
    setOffset(0);
    // Scroll to today after state update
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ left: Math.max(0, todayIndex * DAY_WIDTH - 200), behavior: 'smooth' });
    });
  };

  const navigate = (taskId: string) =>
    router.push(`/tasks/${listId ?? 'all'}/${taskId}`);

  const totalWidth = dates.length * DAY_WIDTH;

  const getBarProps = (task: Task) => {
    const start = task.startDate ? new Date(task.startDate) : task.dueDate ? new Date(task.dueDate) : null;
    const end = task.dueDate ? new Date(task.dueDate) : task.startDate ? new Date(task.startDate) : null;
    if (!start || !end) return null;

    const startIdx = daysBetween(rangeStart, start);
    const endIdx = daysBetween(rangeStart, end);
    const clampedStart = Math.max(0, startIdx);
    const clampedEnd = Math.min(dates.length - 1, endIdx);
    if (clampedStart > dates.length - 1 || clampedEnd < 0) return null; // out of range

    const left = clampedStart * DAY_WIDTH;
    const width = Math.max(DAY_WIDTH, (clampedEnd - clampedStart + 1) * DAY_WIDTH);
    const isPartial = startIdx < 0 || endIdx >= dates.length;
    return { left, width, isPartial };
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">Timeline</h2>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>Today</Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goForward}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {MONTHS_SHORT[rangeStart.getMonth()]} {rangeStart.getFullYear()} — {MONTHS_SHORT[rangeEnd.getMonth()]} {rangeEnd.getFullYear()}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">{scheduledTasks.length} task{scheduledTasks.length !== 1 ? 's' : ''} with dates</span>
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: task label column */}
        <div className="flex shrink-0 flex-col border-r border-border" style={{ width: LABEL_WIDTH }}>
          {/* Header placeholder (matches date header height: 2 rows = 56px) */}
          <div className="shrink-0 border-b border-border bg-muted/30" style={{ height: 56 }}>
            <div className="flex h-full items-end px-3 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Task</span>
            </div>
          </div>

          {/* Task rows */}
          <div className="flex-1 overflow-y-auto">
            {scheduledTasks.map((task) => {
              const Icon = STATUS_ICON[task.status];
              return (
                <div
                  key={task.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 transition-colors hover:bg-muted/30"
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => navigate(task.id)}
                >
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', taskStatusIconColor[task.status])} />
                  <span className="min-w-0 truncate text-xs font-medium">{task.title}</span>
                </div>
              );
            })}

            {unscheduledTasks.length > 0 && (
              <>
                <div className="border-b border-border bg-muted/20 px-3 py-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">No dates ({unscheduledTasks.length})</span>
                </div>
                {unscheduledTasks.map((task) => {
                  const Icon = STATUS_ICON[task.status];
                  return (
                    <div
                      key={task.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 opacity-60 transition-colors hover:bg-muted/30 hover:opacity-100"
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => navigate(task.id)}
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', taskStatusIconColor[task.status])} />
                      <span className="min-w-0 truncate text-xs">{task.title}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Right: scrollable Gantt grid */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto">
          <div style={{ width: totalWidth, minWidth: totalWidth }}>
            {/* Date header */}
            <div className="sticky top-0 z-10 border-b border-border bg-card" style={{ width: totalWidth }}>
              {/* Month row */}
              <div className="flex border-b border-border/40" style={{ height: 28 }}>
                {monthGroups.map((g) => (
                  <div
                    key={g.label}
                    className="flex items-center justify-start overflow-hidden border-r border-border/40 px-2"
                    style={{ width: g.count * DAY_WIDTH, minWidth: g.count * DAY_WIDTH }}
                  >
                    <span className="text-[11px] font-semibold text-muted-foreground">{g.label}</span>
                  </div>
                ))}
              </div>

              {/* Day row */}
              <div className="flex" style={{ height: 28 }}>
                {dates.map((d, i) => {
                  const isToday = i === todayIndex;
                  const isSunday = d.getDay() === 0;
                  const isSaturday = d.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'flex flex-col items-center justify-center border-r border-border/40',
                        isToday && 'bg-primary/10',
                        (isSunday || isSaturday) && 'bg-muted/30',
                      )}
                      style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                    >
                      <span className={cn('text-[10px]', isToday ? 'font-bold text-primary' : 'text-muted-foreground')}>
                        {d.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Gantt rows */}
            <div style={{ width: totalWidth }}>
              {scheduledTasks.map((task) => {
                const bar = getBarProps(task);
                return (
                  <div
                    key={task.id}
                    className="relative border-b border-border/40"
                    style={{ height: ROW_HEIGHT, width: totalWidth }}
                  >
                    {/* Weekend / today column shading */}
                    {dates.map((d, i) => {
                      const isToday = i === todayIndex;
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      if (!isToday && !isWeekend) return null;
                      return (
                        <div
                          key={i}
                          className={cn(
                            'absolute inset-y-0',
                            isToday ? 'bg-primary/8' : 'bg-muted/20',
                          )}
                          style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                        />
                      );
                    })}

                    {/* Today line */}
                    {todayIndex >= 0 && todayIndex < dates.length && (
                      <div
                        className="absolute inset-y-0 w-px bg-primary/60 z-10"
                        style={{ left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2 }}
                      />
                    )}

                    {/* Gantt bar */}
                    {bar && (
                      <div
                        className={cn(
                          'absolute top-1/2 -translate-y-1/2 cursor-pointer rounded-full px-2 flex items-center gap-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-80',
                          STATUS_BAR_COLOR[task.status],
                        )}
                        style={{ left: bar.left + 2, width: bar.width - 4, height: 24 }}
                        onClick={() => navigate(task.id)}
                        title={task.title}
                      >
                        <span className="truncate">{task.title}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unscheduled rows */}
              {unscheduledTasks.length > 0 && (
                <>
                  <div className="border-b border-border bg-muted/20" style={{ height: 28, width: totalWidth }}>
                    {/* Today line */}
                    {todayIndex >= 0 && todayIndex < dates.length && (
                      <div className="absolute inset-y-0 w-px bg-primary/60" style={{ left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2 }} />
                    )}
                  </div>
                  {unscheduledTasks.map((task) => (
                    <div
                      key={task.id}
                      className="relative border-b border-border/40 opacity-40"
                      style={{ height: ROW_HEIGHT, width: totalWidth }}
                    >
                      {/* Today line */}
                      {todayIndex >= 0 && todayIndex < dates.length && (
                        <div
                          className="absolute inset-y-0 w-px bg-primary/60"
                          style={{ left: todayIndex * DAY_WIDTH + DAY_WIDTH / 2 }}
                        />
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
