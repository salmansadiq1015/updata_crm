'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Circle, CirclePause, ListTodo, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useMobileTasks, useMobileTaskMutations } from '@/modules/mobile/hooks/use-task-queries';
import { triggerSync } from '@/modules/mobile/lib/sync-engine';

const ALL = 'ALL';

const STATUS_META = {
  OPEN: { label: 'Open', labelDe: 'Offen', icon: Circle, className: 'text-muted-foreground' },
  IN_PROGRESS: { label: 'In progress', labelDe: 'In Arbeit', icon: RefreshCw, className: 'text-primary' },
  ON_HOLD: { label: 'On hold', labelDe: 'Pausiert', icon: CirclePause, className: 'text-amber-600' },
  COMPLETED: { label: 'Done', labelDe: 'Erledigt', icon: CheckCircle2, className: 'text-emerald-600' },
  CANCELLED: { label: 'Cancelled', labelDe: 'Abgebrochen', icon: Circle, className: 'text-red-600' },
};

const PRIORITY_META = {
  NONE: { label: 'None', labelDe: 'Keine', className: 'bg-muted text-muted-foreground' },
  LOW: { label: 'Low', labelDe: 'Niedrig', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  MEDIUM: { label: 'Medium', labelDe: 'Mittel', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  HIGH: { label: 'High', labelDe: 'Hoch', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
  URGENT: { label: 'Urgent', labelDe: 'Dringend', className: 'bg-red-500/10 text-red-700 dark:text-red-300' },
};

function label(meta, locale) {
  return locale === 'de' ? meta.labelDe : meta.label;
}

function formatDueDate(value, locale) {
  if (!value) return locale === 'de' ? 'Ohne Datum' : 'No due date';
  return new Intl.DateTimeFormat(locale || undefined, { month: 'short', day: '2-digit' }).format(new Date(value));
}

function TaskCard({ task, locale, onToggleComplete, onDelete, isPending }) {
  const status = STATUS_META[task.status] || STATUS_META.OPEN;
  const priority = PRIORITY_META[task.priority] || PRIORITY_META.NONE;
  const StatusIcon = status.icon;
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';
  const isQueued = task.sync_status === 'PENDING_SYNC';

  return (
    <article className="border-b border-border bg-background px-4 py-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
            task.status === 'COMPLETED'
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-border bg-card text-muted-foreground active:bg-muted',
          )}
          onClick={() => onToggleComplete(task)}
          disabled={isPending}
          aria-label={task.status === 'COMPLETED' ? 'Reopen task' : 'Complete task'}
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className={cn('line-clamp-2 text-sm font-semibold', task.status === 'COMPLETED' && 'text-muted-foreground line-through')}>
              {task.title}
            </h2>
            <button
              type="button"
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground active:bg-muted"
              onClick={() => onDelete(task)}
              disabled={isPending}
              aria-label="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={cn('inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium', status.className)}>
              <StatusIcon className="h-3 w-3" />
              {label(status, locale)}
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', priority.className)}>
              {label(priority, locale)}
            </span>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', overdue ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-muted text-muted-foreground')}>
              {formatDueDate(task.dueDate, locale)}
            </span>
            {isQueued && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                {locale === 'de' ? 'Wartet' : 'Queued'}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function TaskSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export default function MobileTasksPage() {
  const { t, locale } = useLanguage();
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [priority, setPriority] = useState(ALL);

  const filters = useMemo(() => ({
    limit: 100,
    sortBy: 'dueDate',
    sortOrder: 'asc',
    hideCompleted: status === ALL,
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(status !== ALL ? { status } : {}),
    ...(priority !== ALL ? { priority } : {}),
  }), [priority, search, status]);

  const { data, isLoading, isError, isOffline, refetch } = useMobileTasks(filters);
  const mutations = useMobileTaskMutations(filters);
  const tasks = Array.isArray(data?.data) ? data.data : [];

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await mutations.createTask.mutateAsync({ title: trimmed });
      setTitle('');
    } catch (error) {
      toast.error(error?.message || t('mobile.tasks.createError', 'Task could not be created'));
    }
  };

  const toggleComplete = async (task) => {
    const nextStatus = task.status === 'COMPLETED' ? 'OPEN' : 'COMPLETED';
    try {
      await mutations.updateTask.mutateAsync({ id: task.id, patch: { status: nextStatus } });
    } catch (error) {
      toast.error(error?.message || t('mobile.tasks.updateError', 'Task could not be updated'));
    }
  };

  const deleteTask = async (task) => {
    try {
      await mutations.deleteTask.mutateAsync(task.id);
    } catch (error) {
      toast.error(error?.message || t('mobile.tasks.deleteError', 'Task could not be deleted'));
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <MobileHeader
        title={t('mobile.tasks.title', locale === 'de' ? 'Aufgaben' : 'Tasks')}
        rightAction={(
          <button
            type="button"
            onClick={() => { triggerSync(); refetch(); }}
            className="rounded-lg p-2 active:bg-muted"
            aria-label={t('mobile.common.refresh', 'Refresh')}
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        )}
      />

      <form onSubmit={submit} className="flex gap-2 border-b border-border px-4 py-3">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={500}
          placeholder={t('mobile.tasks.quickAdd', locale === 'de' ? 'Aufgabe hinzufuegen' : 'Add task')}
          className="h-9"
        />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={!title.trim() || mutations.createTask.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      <div className="space-y-2 border-b border-border px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('mobile.tasks.search', locale === 'de' ? 'Aufgaben suchen' : 'Search tasks')}
            className="h-9 pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{locale === 'de' ? 'Aktive' : 'Active'}</SelectItem>
              {Object.entries(STATUS_META).map(([value, meta]) => (
                <SelectItem key={value} value={value}>{label(meta, locale)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{locale === 'de' ? 'Alle Prioritaeten' : 'All priorities'}</SelectItem>
              {Object.entries(PRIORITY_META).map(([value, meta]) => (
                <SelectItem key={value} value={value}>{label(meta, locale)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <TaskSkeleton />
        ) : isError ? (
          <div className="p-4">
            <EmptyState
              variant="error"
              title={t('mobile.tasks.loadError', locale === 'de' ? 'Aufgaben konnten nicht geladen werden' : 'Tasks could not be loaded')}
              action={<button onClick={() => refetch()} className="text-sm text-primary underline underline-offset-2">{t('mobile.common.retry', 'Retry')}</button>}
            />
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-4">
            <EmptyState
              variant={isOffline ? 'offline' : 'empty'}
              icon={ListTodo}
              title={t('mobile.tasks.empty', locale === 'de' ? 'Keine Aufgaben' : 'No tasks')}
              description={isOffline ? t('mobile.common.offlineNote', 'You are offline. Data may be outdated.') : t('mobile.tasks.emptyDesc', locale === 'de' ? 'Neue Aufgaben erscheinen hier.' : 'New tasks appear here.')}
            />
          </div>
        ) : (
          <div>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                locale={locale}
                onToggleComplete={toggleComplete}
                onDelete={deleteTask}
                isPending={mutations.updateTask.isPending || mutations.deleteTask.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
