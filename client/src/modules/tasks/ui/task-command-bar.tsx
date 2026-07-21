'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import {
  CalendarDays,
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Columns3,
  Flag,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { TaskPriority, TaskStatus, TaskViewType } from '../types/task-types';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  taskPriorityIconColor,
  taskStatusIconColor,
} from './task-ui-constants';

// ── Icon maps ────────────────────────────────────────────────────────────────

const STATUS_ICON = {
  OPEN:        Circle,
  IN_PROGRESS: CircleDashed,
  ON_HOLD:      CirclePause,
  COMPLETED:   CircleCheck,
  CANCELLED:   CircleX,
} as const satisfies Record<TaskStatus, React.ComponentType<{ className?: string }>>;

// ── Types ────────────────────────────────────────────────────────────────────

type CommandBarUser = { id: string; firstName?: string; lastName?: string; email?: string };

type TaskCommandBarProps = {
  activeView: TaskViewType;
  search: string;
  status: TaskStatus | 'ALL';
  priority: TaskPriority | 'ALL';
  assigneeFilter?: string;
  users?: CommandBarUser[];
  currentUserId?: string | null;
  isStale: boolean;
  isFetching: boolean;
  onViewChange: (view: TaskViewType) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (status: TaskStatus | 'ALL') => void;
  onPriorityChange: (priority: TaskPriority | 'ALL') => void;
  onAssigneeFilterChange?: (value: string) => void;
  onCreateTask: (title: string) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
};

const views: Array<{ value: TaskViewType; labelKey: string; fallback: string; icon: typeof List; disabled?: boolean }> = [
  { value: 'list',     labelKey: 'tasks.view.list',     fallback: 'List',     icon: List },
  { value: 'board',    labelKey: 'tasks.view.board',    fallback: 'Board',    icon: Columns3 },
  { value: 'calendar', labelKey: 'tasks.view.calendar', fallback: 'Calendar', icon: CalendarDays },
  { value: 'timeline', labelKey: 'tasks.view.timeline', fallback: 'Timeline', icon: SlidersHorizontal },
];

// ── StatusTriggerContent ─────────────────────────────────────────────────────

function StatusTriggerContent({ status }: { status: TaskStatus | 'ALL' }) {
  const { t } = useLanguage();
  if (status === 'ALL') {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Circle className="h-3.5 w-3.5 opacity-50" />
        {t('tasks.allStatuses', 'All statuses')}
      </span>
    );
  }
  const Icon = STATUS_ICON[status];
  const label = getTaskStatusLabel(t, status);
  return (
    <span className={cn('flex items-center gap-1.5', taskStatusIconColor[status])}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </span>
  );
}

// ── PriorityTriggerContent ───────────────────────────────────────────────────

function PriorityTriggerContent({ priority }: { priority: TaskPriority | 'ALL' }) {
  const { t } = useLanguage();
  if (priority === 'ALL') {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Flag className="h-3.5 w-3.5 opacity-40" />
        {t('tasks.allPriorities', 'All priorities')}
      </span>
    );
  }
  if (priority === 'NONE') {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="w-3.5 text-center text-sm leading-none opacity-40">—</span>
        {t('tasks.none', 'None')}
      </span>
    );
  }
  const label = getTaskPriorityLabel(t, priority);
  return (
    <span className={cn('flex items-center gap-1.5', taskPriorityIconColor[priority])}>
      <Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
      {label}
    </span>
  );
}

// ── TaskCommandBar ───────────────────────────────────────────────────────────

export function TaskCommandBar({
  activeView,
  search,
  status,
  priority,
  assigneeFilter = 'ALL',
  users = [],
  currentUserId,
  isStale,
  isFetching,
  onViewChange,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onAssigneeFilterChange,
  onCreateTask,
  pageSize,
  onPageSizeChange,
}: TaskCommandBarProps) {
  const { t } = useLanguage();
  const [quickTitle, setQuickTitle] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = quickTitle.trim() || t('tasks.newTask', 'New task');
    onCreateTask(title);
    setQuickTitle('');
  };

  return (
    <div className="border-b border-border bg-card">
      {/* Top row: search + quick-add + view switcher */}
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="relative min-w-64 flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
            placeholder={t('tasks.searchTasks', 'Search tasks')}
            className="h-8 rounded-md border-border bg-background pl-9 text-sm"
            aria-label={t('tasks.searchTasks', 'Search tasks')}
          />
        </div>

        <form onSubmit={submit} className="hidden min-w-72 items-center gap-2 lg:flex">
          <Input
            type="text"
            value={quickTitle}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuickTitle(e.target.value)}
            placeholder={t('tasks.quickAdd', 'Quick add task')}
            className="h-8 rounded-md border-border bg-background text-sm"
            aria-label={t('tasks.quickAddTitle', 'Quick add task title')}
          />
          <Button type="submit" size="sm" className="h-8 gap-1">
            <Plus className="h-4 w-4" />
            {t('common.add', 'Add')}
          </Button>
        </form>

        <div
          className="ml-auto flex items-center gap-1 rounded-md border border-border bg-background p-0.5"
          role="tablist"
          aria-label={t('tasks.views', 'Task views')}
        >
          {views.map((view) => {
            const Icon = view.icon;
            const label = t(view.labelKey, view.fallback);
            return (
              <Button
                key={view.value}
                type="button"
                variant="ghost"
                size="sm"
                disabled={view.disabled}
                className={cn(
                  'h-7 gap-1 rounded px-2 text-xs',
                  activeView === view.value && 'bg-primary text-primary-foreground hover:bg-primary',
                )}
                onClick={() => onViewChange(view.value)}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        {/* Status filter */}
        <Select value={status} onValueChange={(v: string) => onStatusChange(v as TaskStatus | 'ALL')}>
          <SelectTrigger className="h-8 w-40 gap-1.5 border border-border bg-background text-xs font-medium hover:bg-muted [&>svg:last-child]:shrink-0">
            <StatusTriggerContent status={status} />
          </SelectTrigger>
          <SelectContent className="w-44">
            <SelectItem value="ALL" textValue={t('tasks.allStatuses', 'All statuses')}>
              <span className="flex items-center gap-2 text-muted-foreground">
                <Circle className="h-3.5 w-3.5 opacity-40" />
                {t('tasks.allStatuses', 'All statuses')}
                {status === 'ALL' && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
              </span>
            </SelectItem>
            {TASK_STATUSES.map((s) => {
              const Icon = STATUS_ICON[s];
              const label = getTaskStatusLabel(t, s);
              return (
                <SelectItem key={s} value={s} textValue={label}>
                  <span className={cn('flex items-center gap-2', taskStatusIconColor[s])}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* Priority filter */}
        <Select value={priority} onValueChange={(v: string) => onPriorityChange(v as TaskPriority | 'ALL')}>
          <SelectTrigger className="h-8 w-40 gap-1.5 border border-border bg-background text-xs font-medium hover:bg-muted [&>svg:last-child]:shrink-0">
            <PriorityTriggerContent priority={priority} />
          </SelectTrigger>
          <SelectContent className="w-40">
            <SelectItem value="ALL" textValue={t('tasks.allPriorities', 'All priorities')}>
              <span className="flex items-center gap-2 text-muted-foreground">
                <Flag className="h-3.5 w-3.5 opacity-40" />
                {t('tasks.allPriorities', 'All priorities')}
              </span>
            </SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p} textValue={getTaskPriorityLabel(t, p)}>
                {p === 'NONE' ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-3.5 text-center text-sm leading-none opacity-40">—</span>
                    {t('tasks.none', 'None')}
                  </span>
                ) : (
                  <span className={cn('flex items-center gap-2', taskPriorityIconColor[p])}>
                    <Flag className="h-3.5 w-3.5 shrink-0 fill-current" />
                    {getTaskPriorityLabel(t, p)}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assignee scope filter: everyone's tasks / mine / a specific colleague */}
        {onAssigneeFilterChange && (
          <Select value={assigneeFilter} onValueChange={(v: string) => onAssigneeFilterChange(v)}>
            <SelectTrigger className="h-8 w-44 gap-1.5 border border-border bg-background text-xs font-medium hover:bg-muted [&>svg:last-child]:shrink-0">
              <span className="flex items-center gap-1.5 truncate">
                <UserRound className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate">
                  {assigneeFilter === 'ALL'
                    ? t('tasks.allAssignees', 'Alle Zugewiesenen')
                    : assigneeFilter === 'ME'
                    ? t('tasks.myTasks', 'Meine Aufgaben')
                    : (() => {
                        const u = users.find((usr) => usr.id === assigneeFilter);
                        return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email : t('tasks.assignee', 'Zugewiesen');
                      })()}
                </span>
              </span>
            </SelectTrigger>
            <SelectContent className="max-h-72 w-56">
              <SelectItem value="ALL" textValue={t('tasks.allAssignees', 'Alle Zugewiesenen')}>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <UserRound className="h-3.5 w-3.5 opacity-40" />
                  {t('tasks.allAssignees', 'Alle Zugewiesenen')}
                </span>
              </SelectItem>
              {currentUserId && (
                <SelectItem value="ME" textValue={t('tasks.myTasks', 'Meine Aufgaben')}>
                  <span className="flex items-center gap-2 font-medium">
                    <UserRound className="h-3.5 w-3.5" />
                    {t('tasks.myTasks', 'Meine Aufgaben')}
                  </span>
                </SelectItem>
              )}
              {users
                .filter((u) => u.id !== currentUserId)
                .map((u) => {
                  const label = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id;
                  return (
                    <SelectItem key={u.id} value={u.id} textValue={label}>
                      <span className="flex items-center gap-2">
                        <UserRound className="h-3.5 w-3.5 opacity-60" />
                        {label}
                      </span>
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
        )}

        {/* Page size */}
        {onPageSizeChange && (
          <Select value={String(pageSize ?? 50)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-28 border-border bg-background text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">{t('common.perPage', '{count} / Seite', { count: 25 })}</SelectItem>
              <SelectItem value="50">{t('common.perPage', '{count} / Seite', { count: 50 })}</SelectItem>
              <SelectItem value="100">{t('common.perPage', '{count} / Seite', { count: 100 })}</SelectItem>
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {isFetching ? <span>{t('common.syncing', 'Synchronisiert...')}</span> : null}
          {isStale ? <span className="text-warning">{t('common.stale', 'Stale')}</span> : <span>{t('common.live', 'Live')}</span>}
        </div>
      </div>
    </div>
  );
}
