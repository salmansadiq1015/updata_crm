'use client';

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Gauge,
  Layers3,
  ListChecks,
  Loader2,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useTaskDashboardOverview } from '../hooks/use-task-dashboard-overview';
import type { Task } from '../types/task-types';
import {
  buildTaskDashboardAnalytics,
  type PriorityDatum,
  type TaskDashboardSectionKey,
  type WorkloadDatum,
} from '../utils/task-dashboard-analytics';
import { getTaskPriorityLabel, taskPriorityIconColor } from './task-ui-constants';

type TranslateFn = (key: string, fallback?: string, vars?: Record<string, unknown>) => string;

type LanguageContextValue = {
  locale: string;
  t: TranslateFn;
};

type Accent = 'violet' | 'emerald' | 'amber' | 'rose' | 'sky';

type SectionConfig = {
  labelKey: string;
  fallback: string;
  icon: LucideIcon;
  accent: Accent;
};

type MetricCardProps = {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accent: Accent;
};

type ChartPanelProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
};

type TaskSectionProps = {
  sectionKey: TaskDashboardSectionKey;
  tasks: Task[];
  total: number;
  config: SectionConfig;
  t: TranslateFn;
  formatDate: (value: string | null) => string;
  onOpenTask: (task: Task) => void;
  onOpenAll: () => void;
};

type TaskRowProps = {
  task: Task;
  t: TranslateFn;
  formatDate: (value: string | null) => string;
  onOpen: (task: Task) => void;
};

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
};

const UPCOMING_RANGE_OPTIONS = [7, 14, 30] as const;
const TASK_SECTION_LIMIT = 5;

const SECTION_CONFIG: Record<TaskDashboardSectionKey, SectionConfig> = {
  active: {
    labelKey: 'tasks.dashboard.activeFocus',
    fallback: 'Active focus',
    icon: ClipboardCheck,
    accent: 'violet',
  },
  overdue: {
    labelKey: 'tasks.dashboard.overdue',
    fallback: 'Overdue',
    icon: AlertCircle,
    accent: 'rose',
  },
  today: {
    labelKey: 'tasks.dashboard.dueToday',
    fallback: 'Due today',
    icon: CalendarDays,
    accent: 'amber',
  },
  upcoming: {
    labelKey: 'tasks.dashboard.upcoming',
    fallback: 'Upcoming',
    icon: Clock3,
    accent: 'sky',
  },
  completed: {
    labelKey: 'tasks.dashboard.recentlyCompleted',
    fallback: 'Recently completed',
    icon: CheckCircle2,
    accent: 'emerald',
  },
};

const ACCENT_CLASSES: Record<Accent, { icon: string; surface: string; text: string; border: string; bar: string }> = {
  violet: {
    icon: 'text-brand-400',
    surface: 'bg-brand-500/10',
    text: 'text-brand-400',
    border: 'border-brand-500/20',
    bar: 'from-brand-500',
  },
  emerald: {
    icon: 'text-emerald-400',
    surface: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    bar: 'from-emerald-500',
  },
  amber: {
    icon: 'text-amber-400',
    surface: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    bar: 'from-amber-500',
  },
  rose: {
    icon: 'text-rose-400',
    surface: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20',
    bar: 'from-rose-500',
  },
  sky: {
    icon: 'text-sky-400',
    surface: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/20',
    bar: 'from-sky-500',
  },
};

const WORKLOAD_COLORS: Record<TaskDashboardSectionKey, string> = {
  active: 'var(--primary)',
  overdue: 'var(--destructive)',
  today: 'var(--warning)',
  upcoming: 'var(--info)',
  completed: 'var(--success)',
};

const PRIORITY_COLORS: Record<PriorityDatum['priority'], string> = {
  URGENT: 'var(--destructive)',
  HIGH: '#f97316',
  MEDIUM: 'var(--warning)',
  LOW: 'var(--info)',
  NONE: 'var(--muted-foreground)',
};

const CHART_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  color: 'var(--popover-foreground)',
  boxShadow: 'var(--shadow-md)',
};

const CHART_AXIS_STYLE = {
  fontSize: 11,
  fill: 'var(--muted-foreground)',
};

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-xs text-xs leading-5 text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function MetricCard({ title, value, detail, icon: Icon, accent }: MetricCardProps) {
  const theme = ACCENT_CLASSES[accent];
  return (
    <section className={cn('group relative overflow-hidden rounded-xl border bg-card p-4 shadow-theme-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-theme-md', theme.border)}>
      <div className={cn('absolute inset-x-0 top-0 h-px bg-linear-to-r to-transparent', theme.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
          <p className={cn('mt-2 text-3xl font-semibold leading-none tabular-nums tracking-tight', theme.text)}>{value}</p>
          <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-105', theme.surface, theme.border)}>
          <Icon className={cn('h-5 w-5', theme.icon)} />
        </div>
      </div>
    </section>
  );
}

function ChartPanel({ title, description, icon: Icon, children, className }: ChartPanelProps) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-theme-sm', className)}>
      <div className="flex items-start gap-3 border-b border-border px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            <Skeleton className="h-10 w-72 max-w-full" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <Skeleton className="h-80 rounded-xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    </main>
  );
}

function DashboardError({ onRetry, isFetching, t }: { onRetry: () => void; isFetching: boolean; t: TranslateFn }) {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center p-6">
      <section className="w-full max-w-md rounded-xl border border-destructive/20 bg-card p-6 text-center shadow-theme-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          {t('tasks.dashboard.loadFailed', 'Task dashboard could not be loaded')}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t('tasks.dashboard.loadFailedBody', 'Check the network connection and retry. Cached task views remain available from the task workspace.')}
        </p>
        <Button type="button" className="mt-5" onClick={onRetry} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t('tasks.dashboard.retry', 'Retry')}
        </Button>
      </section>
    </main>
  );
}

function DashboardHeader({
  upcomingDays,
  onChangeUpcomingDays,
  onOpenAll,
  onRefresh,
  isFetching,
  t,
}: {
  upcomingDays: number;
  onChangeUpcomingDays: (value: number) => void;
  onOpenAll: () => void;
  onRefresh: () => void;
  isFetching: boolean;
  t: TranslateFn;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card shadow-theme-sm">
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary via-sky-400 to-emerald-400" />
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t('tasks.dashboard.eyebrow', 'Task intelligence')}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {t('tasks.dashboard.title', 'My Tasks')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t('tasks.dashboard.subtitle', 'Personal workload, risk, due dates, and completion analytics in one operational view.')}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={String(upcomingDays)} onValueChange={(value: string) => onChangeUpcomingDays(Number(value))}>
            <SelectTrigger className="h-10 min-w-44">
              <SlidersHorizontal className="mr-1.5 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="">
              {UPCOMING_RANGE_OPTIONS.map((days) => {
                const label = t('tasks.dashboard.nextDays', 'Next {count} days', { count: days });
                return (
                  <SelectItem key={days} value={String(days)} textValue={label} className="">
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button type="button" variant="outline" className="" onClick={onRefresh} disabled={isFetching} aria-label={t('tasks.dashboard.refresh', 'Refresh dashboard')}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              <span className="hidden sm:inline">{t('tasks.dashboard.refresh', 'Refresh')}</span>
            </Button>
            <Button type="button" className="" onClick={onOpenAll}>
              <ListChecks className="h-4 w-4" />
              {t('tasks.allTasks', 'All tasks')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DueTrendChart({
  data,
  valueLabel,
  emptyTitle,
  emptyDescription,
}: {
  data: Array<{ key: string; label: string; value: number }>;
  valueLabel: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const hasData = data.some((item) => item.value > 0);
  if (!hasData) {
    return <EmptyState icon={CalendarDays} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="h-72 min-h-72 min-w-0 overflow-hidden" role="img" aria-label={emptyDescription}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="taskDueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--info)" stopOpacity={0.45} />
              <stop offset="95%" stopColor="var(--info)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={CHART_AXIS_STYLE} tickLine={false} axisLine={false} minTickGap={18} />
          <YAxis allowDecimals={false} tick={CHART_AXIS_STYLE} tickLine={false} axisLine={false} width={28} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ stroke: 'var(--info)', strokeOpacity: 0.25 }} />
          <Area type="monotone" dataKey="value" name={valueLabel} stroke="var(--info)" strokeWidth={2} fill="url(#taskDueGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function WorkloadChart({
  data,
  valueLabel,
  emptyTitle,
  emptyDescription,
}: {
  data: Array<WorkloadDatum & { label: string; fill: string }>;
  valueLabel: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const hasData = data.some((item) => item.value > 0);
  if (!hasData) {
    return <EmptyState icon={BarChart3} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="h-64 min-h-64 min-w-0 overflow-hidden" role="img" aria-label={emptyDescription}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 10, left: 10, bottom: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={CHART_AXIS_STYLE} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" tick={CHART_AXIS_STYLE} tickLine={false} axisLine={false} width={118} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} />
          <Bar dataKey="value" name={valueLabel} radius={[0, 8, 8, 0]}>
            {data.map((item) => (
              <Cell key={item.key} fill={item.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PriorityChart({
  data,
  emptyTitle,
  emptyDescription,
}: {
  data: Array<PriorityDatum & { label: string; fill: string }>;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (data.length === 0) {
    return <EmptyState icon={Layers3} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] sm:items-center">
      <div className="h-52 min-h-52 min-w-0 overflow-hidden" role="img" aria-label={emptyDescription}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <PieChart>
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="58%" outerRadius="82%" paddingAngle={4} stroke="var(--card)" strokeWidth={3}>
              {data.map((item) => (
                <Cell key={item.priority} fill={item.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.priority} className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{item.label}</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CloseRateGauge({ value, label, helperText }: { value: number; label: string; helperText: string }) {
  const safeValue = clampPercent(value);
  return (
    <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
      <div className="relative mx-auto h-36 min-h-36 w-36 min-w-36 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <RadialBarChart innerRadius="74%" outerRadius="100%" data={[{ value: safeValue, fill: 'var(--success)' }]} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={12} background={{ fill: 'var(--muted)' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums text-foreground">{safeValue}%</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{label}</span>
            <span>{safeValue}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success transition-all duration-300" style={{ width: `${safeValue}%` }} />
          </div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{helperText}</p>
      </div>
    </div>
  );
}

function RiskQueue({
  tasks,
  t,
  formatDate,
  onOpenTask,
}: {
  tasks: Task[];
  t: TranslateFn;
  formatDate: (value: string | null) => string;
  onOpenTask: (task: Task) => void;
}) {
  if (tasks.length === 0) {
    return (
      <ChartPanel
        title={t('tasks.dashboard.riskQueue', 'Focus queue')}
        description={t('tasks.dashboard.riskQueueDesc', 'Active work sorted by priority and due date.')}
        icon={ShieldAlert}
      >
        <EmptyState
          icon={CheckCircle2}
          title={t('tasks.dashboard.noRiskTitle', 'No active focus queue')}
          description={t('tasks.dashboard.noRiskBody', 'Active assigned tasks will appear here as soon as they are available.')}
        />
      </ChartPanel>
    );
  }

  return (
    <ChartPanel
      title={t('tasks.dashboard.riskQueue', 'Focus queue')}
      description={t('tasks.dashboard.riskQueueDesc', 'Active work sorted by priority and due date.')}
      icon={ShieldAlert}
    >
      <div className="space-y-2">
        {tasks.map((task) => (
          <DashboardTaskRow key={task.id} task={task} t={t} formatDate={formatDate} onOpen={onOpenTask} />
        ))}
      </div>
    </ChartPanel>
  );
}

function DashboardTaskRow({ task, t, formatDate, onOpen }: TaskRowProps) {
  const priorityLabel = getTaskPriorityLabel(t, task.priority);
  return (
    <button
      type="button"
      className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-3 text-left transition-colors hover:border-primary/30 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:grid-cols-[minmax(0,1fr)_140px_96px_28px]"
      onClick={() => onOpen(task)}
      aria-label={t('tasks.selectTask', 'Select task: {title}', { title: task.title })}
    >
      <span className="min-w-0">
        <span className={cn('block truncate text-sm font-medium text-foreground', task.status === 'COMPLETED' && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.attachmentCount > 0 ? <span>{t('tasks.fileCount', '{count} file(s)', { count: task.attachmentCount })}</span> : null}
          {task.noteCount > 0 ? <span>{t('tasks.dashboard.noteCount', '{count} note(s)', { count: task.noteCount })}</span> : null}
          {task.subtaskCount > 0 ? <span>{t('tasks.dashboard.subtaskCount', '{count} subtask(s)', { count: task.subtaskCount })}</span> : null}
        </span>
      </span>
      <span className="hidden text-xs text-muted-foreground sm:block">{formatDate(task.dueDate)}</span>
      <span className={cn('rounded-full border px-2 py-1 text-center text-xs font-semibold', taskPriorityIconColor[task.priority], 'border-current/20 bg-current/10')}>
        {priorityLabel}
      </span>
      <ArrowRight className="hidden h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground sm:block" />
    </button>
  );
}

function TaskSection({ sectionKey, tasks, total, config, t, formatDate, onOpenTask, onOpenAll }: TaskSectionProps) {
  const visibleTasks = tasks.slice(0, TASK_SECTION_LIMIT);
  const Icon = config.icon;
  const accent = ACCENT_CLASSES[config.accent];
  const label = t(config.labelKey, config.fallback);

  return (
    <section className="min-h-72 rounded-xl border border-border bg-card shadow-theme-sm">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg border', accent.surface, accent.border)}>
          <Icon className={cn('h-4 w-4', accent.icon)} />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{label}</h2>
          <p className="text-xs text-muted-foreground">{t('tasks.taskCount', '{count} task(s)', { count: total })}</p>
        </div>
      </div>

      {visibleTasks.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={t('tasks.dashboard.noSectionTasks', 'No tasks')}
          description={t('tasks.dashboard.noSectionTasksBody', 'This lane is clear for the selected time window.')}
        />
      ) : (
        <div className="space-y-2 p-3">
          {visibleTasks.map((task) => (
            <DashboardTaskRow key={`${sectionKey}-${task.id}`} task={task} t={t} formatDate={formatDate} onOpen={onOpenTask} />
          ))}
          {total > TASK_SECTION_LIMIT ? (
            <Button type="button" variant="ghost" className="w-full justify-between" onClick={onOpenAll}>
              {t('tasks.dashboard.viewMore', 'View {count} more', { count: total - TASK_SECTION_LIMIT })}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

/**
 * `embedded` renders only the analysis blocks, for the collapsible section of
 * the tasks workspace: the page chrome, the header and the metric row are the
 * workspace's own since the two pages were merged.
 */
export function TaskDashboardPage({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const { locale, t } = useLanguage() as LanguageContextValue;
  const [upcomingDays, setUpcomingDays] = useState<(typeof UPCOMING_RANGE_OPTIONS)[number]>(7);
  const dashboardQuery = useTaskDashboardOverview(upcomingDays);

  const analytics = useMemo(
    () => buildTaskDashboardAnalytics(dashboardQuery.data, upcomingDays),
    [dashboardQuery.data, upcomingDays],
  );

  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const shortDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }),
    [locale],
  );
  const dueTrendFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }),
    [locale],
  );

  const formatDate = (value: string | null): string => {
    if (!value) return t('tasks.noDueDate', 'No due date');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('tasks.noDueDate', 'No due date');
    return shortDateFormatter.format(date);
  };

  const openTask = (task: Task) => {
    router.push(`/tasks/${task.listId ?? 'all'}/${task.id}`);
  };

  const openAllTasks = () => {
    router.push('/tasks/all');
  };

  const workloadData = analytics.workload.map((item) => ({
    ...item,
    label: t(SECTION_CONFIG[item.key].labelKey, SECTION_CONFIG[item.key].fallback),
    fill: WORKLOAD_COLORS[item.key],
  }));

  const priorityData = analytics.priorityMix.map((item) => ({
    ...item,
    label: getTaskPriorityLabel(t, item.priority),
    fill: PRIORITY_COLORS[item.priority],
  }));

  const dueTrendData = analytics.dueTrend.map((item) => ({
    ...item,
    label: dueTrendFormatter.format(new Date(item.date)),
  }));

  if (dashboardQuery.isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <DashboardSkeleton />
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <DashboardError
          onRetry={() => {
            void dashboardQuery.refetch();
          }}
          isFetching={dashboardQuery.isFetching}
          t={t}
        />
      </div>
    );
  }

  const Shell = embedded
    ? ({ children }: { children: React.ReactNode }) => <div className="space-y-5">{children}</div>
    : ({ children }: { children: React.ReactNode }) => (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <div className="space-y-5">{children}</div>
        </main>
      </div>
    );

  return (
    <Shell>
      {!embedded && (
          <DashboardHeader
            upcomingDays={upcomingDays}
            onChangeUpcomingDays={(value) => {
              if (UPCOMING_RANGE_OPTIONS.includes(value as (typeof UPCOMING_RANGE_OPTIONS)[number])) {
                setUpcomingDays(value as (typeof UPCOMING_RANGE_OPTIONS)[number]);
              }
            }}
            onOpenAll={openAllTasks}
            onRefresh={() => {
              void dashboardQuery.refetch();
            }}
            isFetching={dashboardQuery.isFetching}
            t={t}
          />
      )}

      {!embedded && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title={t('tasks.dashboard.open', 'Open')}
              value={numberFormatter.format(analytics.stats.totalOpen)}
              detail={t('tasks.dashboard.totalTasks', '{count} total tasks', { count: analytics.stats.totalTasks })}
              icon={ClipboardCheck}
              accent="violet"
            />
            <MetricCard
              title={t('tasks.dashboard.completedThisWeek', 'Completed this week')}
              value={numberFormatter.format(analytics.stats.completedThisWeek)}
              detail={t('tasks.dashboard.weeklyCloseRate', '{count}% weekly close rate', { count: analytics.weeklyCloseRate })}
              icon={CheckCircle2}
              accent="emerald"
            />
            <MetricCard
              title={t('tasks.dashboard.overdue', 'Overdue')}
              value={numberFormatter.format(analytics.stats.overdueCount)}
              detail={t('tasks.dashboard.overdueRate', '{count}% of open work', { count: analytics.overdueRate })}
              icon={ShieldAlert}
              accent="rose"
            />
            <MetricCard
              title={t('tasks.dashboard.dueDateCoverage', 'Due-date coverage')}
              value={`${analytics.dueDateCoverage}%`}
              detail={t('tasks.dashboard.visibleActive', '{count} active sampled', { count: analytics.totalVisibleActive })}
              icon={TimerReset}
              accent="sky"
            />
          </div>
      )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
            <ChartPanel
              title={t('tasks.dashboard.dueTrend', 'Due-date trend')}
              description={t('tasks.dashboard.dueTrendDesc', 'Visible due work across the selected planning window.')}
              icon={TrendingUp}
            >
              <DueTrendChart
                data={dueTrendData}
                valueLabel={t('tasks.task', 'Task')}
                emptyTitle={t('tasks.dashboard.noDueTrend', 'No dated work in this window')}
                emptyDescription={t('tasks.dashboard.noDueTrendBody', 'Tasks without due dates stay visible in the task workspace but do not appear in this chart.')}
              />
            </ChartPanel>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <ChartPanel
                title={t('tasks.dashboard.completionVelocity', 'Completion velocity')}
                description={t('tasks.dashboard.completionVelocityDesc', 'Closed work compared with the current open workload.')}
                icon={Gauge}
              >
                <CloseRateGauge
                  value={analytics.weeklyCloseRate}
                  label={t('tasks.dashboard.closeRate', 'Close rate')}
                  helperText={t('tasks.dashboard.closeRateBody', "Uses open work and this week's completions so historical task volume does not dilute the signal.")}
                />
              </ChartPanel>

              <ChartPanel
                title={t('tasks.dashboard.priorityMix', 'Priority mix')}
                description={t('tasks.dashboard.priorityMixDesc', 'Active visible work by priority.')}
                icon={Layers3}
              >
                <PriorityChart
                  data={priorityData}
                  emptyTitle={t('tasks.dashboard.noPriorityMix', 'No active priorities')}
                  emptyDescription={t('tasks.dashboard.noPriorityMixBody', 'Active assigned work will appear here as soon as tasks are available.')}
                />
              </ChartPanel>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <ChartPanel
              title={t('tasks.dashboard.workloadSplit', 'Workload split')}
              description={t('tasks.dashboard.workloadSplitDesc', 'Dashboard lanes by current task count.')}
              icon={BarChart3}
            >
              <WorkloadChart
                data={workloadData}
                valueLabel={t('tasks.task', 'Task')}
                emptyTitle={t('tasks.dashboard.noWorkload', 'No dashboard workload')}
                emptyDescription={t('tasks.dashboard.noWorkloadBody', 'Create or assign tasks to populate the dashboard.')}
              />
            </ChartPanel>

            <RiskQueue tasks={analytics.riskQueue} t={t} formatDate={formatDate} onOpenTask={openTask} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TaskSection
              sectionKey="active"
              tasks={analytics.activeTasks}
              total={analytics.stats.totalOpen}
              config={SECTION_CONFIG.active}
              t={t}
              formatDate={formatDate}
              onOpenTask={openTask}
              onOpenAll={openAllTasks}
            />
            <TaskSection
              sectionKey="overdue"
              tasks={dashboardQuery.data?.overdue ?? []}
              total={dashboardQuery.data?.overdue.length ?? 0}
              config={SECTION_CONFIG.overdue}
              t={t}
              formatDate={formatDate}
              onOpenTask={openTask}
              onOpenAll={openAllTasks}
            />
            <TaskSection
              sectionKey="today"
              tasks={dashboardQuery.data?.dueToday ?? []}
              total={dashboardQuery.data?.dueToday.length ?? 0}
              config={SECTION_CONFIG.today}
              t={t}
              formatDate={formatDate}
              onOpenTask={openTask}
              onOpenAll={openAllTasks}
            />
            <TaskSection
              sectionKey="upcoming"
              tasks={dashboardQuery.data?.upcoming ?? []}
              total={dashboardQuery.data?.upcoming.length ?? 0}
              config={SECTION_CONFIG.upcoming}
              t={t}
              formatDate={formatDate}
              onOpenTask={openTask}
              onOpenAll={openAllTasks}
            />
            <TaskSection
              sectionKey="completed"
              tasks={dashboardQuery.data?.recentlyCompleted ?? []}
              total={dashboardQuery.data?.recentlyCompleted.length ?? 0}
              config={SECTION_CONFIG.completed}
              t={t}
              formatDate={formatDate}
              onOpenTask={openTask}
              onOpenAll={openAllTasks}
            />
          </div>
    </Shell>
  );
}
