'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Loader2, SlidersHorizontal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { taskApi } from '../services/task-api';
import type { Task } from '../types/task-types';
import { taskPriorityIconColor } from './task-ui-constants';

type Section = {
  key: string;
  label: string;
  icon: typeof AlertCircle;
  tasks: Task[];
  tone: string;
};

const formatDueDate = (value: string | null) => {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
};

function DashboardTaskRow({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  return (
    <button
      type="button"
      className="grid w-full grid-cols-[minmax(0,1fr)_120px_82px] items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/45"
      onClick={() => onOpen(task)}
    >
      <span className={cn('truncate text-sm font-medium', task.status === 'COMPLETED' && 'text-muted-foreground line-through')}>
        {task.title}
      </span>
      <span className="truncate text-xs text-muted-foreground">{formatDueDate(task.dueDate)}</span>
      <span className={cn('text-right text-xs font-semibold', taskPriorityIconColor[task.priority])}>{task.priority}</span>
    </button>
  );
}

export function TaskDashboardPage() {
  const router = useRouter();
  const [upcomingDays, setUpcomingDays] = useState(7);
  const dashboardQuery = useQuery({
    queryKey: ['tasks', 'dashboard', upcomingDays],
    queryFn: async () => {
      const [dashboard, stats] = await Promise.all([
        taskApi.dashboard({ upcomingDays }),
        taskApi.dashboardStats(),
      ]);
      return { ...dashboard, stats };
    },
    staleTime: 20_000,
  });

  const sections = useMemo<Section[]>(() => {
    const data = dashboardQuery.data;
    return [
      { key: 'overdue', label: 'Overdue', icon: AlertCircle, tasks: data?.overdue ?? [], tone: 'text-red-500' },
      { key: 'today', label: 'Due Today', icon: CalendarDays, tasks: data?.dueToday ?? [], tone: 'text-amber-500' },
      { key: 'upcoming', label: 'Upcoming', icon: Clock3, tasks: data?.upcoming ?? [], tone: 'text-sky-500' },
      { key: 'completed', label: 'Recently Completed', icon: CheckCircle2, tasks: data?.recentlyCompleted ?? [], tone: 'text-emerald-500' },
    ];
  }, [dashboardQuery.data]);

  const openTask = (task: Task) => {
    router.push(`/tasks/${task.listId ?? 'all'}/${task.id}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
        <div>
          <h1 className="text-base font-semibold text-foreground">My Tasks</h1>
          <p className="text-xs text-muted-foreground">Personal task overview</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select value={String(upcomingDays)} onValueChange={(value) => setUpcomingDays(Number(value))}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Next 7 days</SelectItem>
              <SelectItem value="14">Next 14 days</SelectItem>
              <SelectItem value="30">Next 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => router.push('/tasks/all')}>
            All Tasks
          </Button>
        </div>
      </header>

      {dashboardQuery.isLoading ? (
        <main className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      ) : dashboardQuery.isError ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-3">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <Button type="button" variant="outline" size="sm" onClick={() => dashboardQuery.refetch()}>Retry</Button>
        </main>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Open</div>
              <div className="mt-1 text-2xl font-semibold">{dashboardQuery.data?.stats?.totalOpen ?? 0}</div>
            </div>
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Completed This Week</div>
              <div className="mt-1 text-2xl font-semibold">{dashboardQuery.data?.stats?.completedThisWeek ?? 0}</div>
            </div>
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Overdue</div>
              <div className="mt-1 text-2xl font-semibold text-red-500">{dashboardQuery.data?.stats?.overdueCount ?? 0}</div>
            </div>
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="mt-1 text-2xl font-semibold">{dashboardQuery.data?.stats?.totalTasks ?? 0}</div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <section key={section.key} className="min-h-56 rounded-md border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <Icon className={cn('h-4 w-4', section.tone)} />
                    <h2 className="text-sm font-semibold">{section.label}</h2>
                    <span className="ml-auto text-xs text-muted-foreground">{section.tasks.length}</span>
                  </div>
                  {section.tasks.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No tasks</div>
                  ) : (
                    <div>{section.tasks.map((task) => <DashboardTaskRow key={task.id} task={task} onOpen={openTask} />)}</div>
                  )}
                </section>
              );
            })}
          </div>
        </main>
      )}
    </div>
  );
}
