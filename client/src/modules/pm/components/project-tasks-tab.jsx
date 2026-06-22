'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, CircleDashed, CirclePause, CircleX, ListTodo, Plus } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { taskApi } from '@/modules/tasks/services/task-api';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  taskPriorityClass,
  taskStatusClass,
} from '@/modules/tasks/ui/task-ui-constants';

const ALL = 'ALL';

const STATUS_ICON = {
  OPEN: Circle,
  IN_PROGRESS: CircleDashed,
  ON_HOLD: CirclePause,
  COMPLETED: CheckCircle2,
  CANCELLED: CircleX,
};

function projectTaskKeys(projectId) {
  return {
    list: ['pm', 'projectTasks', projectId],
    summary: ['pm', 'projectTasks', projectId, 'summary'],
  };
}

export function ProjectTaskSummaryPanel({ projectId }) {
  const { t } = useLanguage();
  const keys = projectTaskKeys(projectId);
  const { data: summary, isLoading } = useQuery({
    queryKey: keys.summary,
    queryFn: () => taskApi.projectSummary(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  if (isLoading) return <Skeleton className="h-20 w-full rounded-lg" />;
  if (!summary) return null;

  const completedText = `${summary.completed}/${summary.total}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('pm.tasks', 'Tasks')}</p>
          <p className="mt-1 text-sm font-medium">{completedText} {t('pm.tasksCompleted', 'completed')}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{summary.completionRate}%</p>
          <p className="text-xs text-muted-foreground">{t('pm.taskProgress', 'Task progress')}</p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(summary.completionRate, 100)}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <SummaryCount label={t('tasks.status.OPEN', 'Open')} value={summary.open} />
        <SummaryCount label={t('tasks.status.IN_PROGRESS', 'In progress')} value={summary.inProgress} />
        <SummaryCount label={t('tasks.status.ON_HOLD', 'On hold')} value={summary.onHold} />
        <SummaryCount label={t('tasks.status.COMPLETED', 'Complete')} value={summary.completed} />
      </div>
    </div>
  );
}

function SummaryCount({ label, value }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ProjectTaskRow({ task, onStatusChange, disabled }) {
  const { t } = useLanguage();
  const StatusIcon = STATUS_ICON[task.status] || Circle;
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && !['COMPLETED', 'CANCELLED'].includes(task.status);

  return (
    <div className="grid grid-cols-[minmax(220px,1fr)_160px_140px_130px] items-center gap-3 border-b border-border px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className={cn('truncate font-medium', task.status === 'COMPLETED' && 'text-muted-foreground line-through')}>{task.title}</p>
        <p className={cn('mt-0.5 text-xs', overdue ? 'text-red-600' : 'text-muted-foreground')}>
          {task.dueDate ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(task.dueDate)) : t('tasks.noDueDate', 'No due date')}
        </p>
      </div>
      <Select value={task.status} onValueChange={(status) => onStatusChange(task, status)} disabled={disabled}>
        <SelectTrigger className={cn('h-8 text-xs', taskStatusClass[task.status])}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((status) => {
            const Icon = STATUS_ICON[status] || Circle;
            return (
              <SelectItem key={status} value={status}>
                <span className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  {getTaskStatusLabel(t, status)}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <span className={cn('inline-flex w-fit rounded-full border px-2 py-1 text-xs font-medium', taskPriorityClass[task.priority])}>
        {getTaskPriorityLabel(t, task.priority)}
      </span>
      <div className="text-right text-xs text-muted-foreground tabular-nums">
        <StatusIcon className="mr-1 inline h-3.5 w-3.5" />
        v{task.version}
      </div>
    </div>
  );
}

export function ProjectTasksTab({ projectId }) {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const keys = useMemo(() => projectTaskKeys(projectId), [projectId]);

  const params = useMemo(() => ({
    limit: 100,
    sortBy: 'dueDate',
    sortOrder: 'asc',
    ...(status !== ALL ? { status } : {}),
    ...(priority !== ALL ? { priority } : {}),
  }), [priority, status]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [...keys.list, params],
    queryFn: () => taskApi.projectTasks(projectId, params),
    enabled: !!projectId,
    staleTime: 20_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: keys.list });
    queryClient.invalidateQueries({ queryKey: keys.summary });
  };

  const createTask = useMutation({
    mutationFn: (taskTitle) => taskApi.create({ title: taskTitle, projectId }),
    onSuccess: () => {
      setTitle('');
      invalidate();
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ task, nextStatus }) => taskApi.patch(task.id, { status: nextStatus, expectedVersion: task.version }),
    onSuccess: invalidate,
  });

  const submit = (event) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed) createTask.mutate(trimmed);
  };

  const tasks = data?.data || [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <ProjectTaskSummaryPanel projectId={projectId} />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center">
          <form onSubmit={submit} className="flex min-w-0 flex-1 gap-2">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={500}
              placeholder={t('pm.addProjectTask', language === 'de' ? 'Projektaufgabe hinzufuegen' : 'Add project task')}
              className="h-9"
            />
            <Button type="submit" size="sm" disabled={!title.trim() || createTask.isPending} className="h-9 gap-1">
              <Plus className="h-4 w-4" />
              {t('common.add', 'Add')}
            </Button>
          </form>
          <div className="grid grid-cols-2 gap-2 lg:w-80">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('tasks.allStatuses', 'All statuses')}</SelectItem>
                {TASK_STATUSES.map((item) => <SelectItem key={item} value={item}>{getTaskStatusLabel(t, item)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('tasks.allPriorities', 'All priorities')}</SelectItem>
                {TASK_PRIORITIES.map((item) => <SelectItem key={item} value={item}>{getTaskPriorityLabel(t, item)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-12 w-full" />)}
          </div>
        ) : isError ? (
          <div className="p-6">
            <EmptyState
              title={t('pm.tasksLoadError', 'Project tasks could not be loaded')}
              action={<Button variant="outline" size="sm" onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button>}
            />
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={ListTodo}
              title={t('pm.noProjectTasks', 'No project tasks')}
              description={language === 'de' ? 'Aufgaben fuer dieses Projekt erscheinen hier.' : 'Tasks for this project appear here.'}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {tasks.map((task) => (
                <ProjectTaskRow
                  key={task.id}
                  task={task}
                  disabled={updateStatus.isPending}
                  onStatusChange={(item, nextStatus) => updateStatus.mutate({ task: item, nextStatus })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
