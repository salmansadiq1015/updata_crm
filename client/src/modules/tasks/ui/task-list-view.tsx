'use client';

import type { MouseEvent } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Copy,
  Flag,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Task, TaskPatch, TaskPriority, TaskStatus } from '../types/task-types';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  taskPriorityBorderClass,
  taskPriorityIconColor,
  taskStatusIconColor,
} from './task-ui-constants';
import { taskApi } from '../services/task-api';

// ── Status cycle for subtask toggle ──────────────────────────────────────────

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  OPEN: 'COMPLETED',
  IN_PROGRESS: 'COMPLETED',
  ON_HOLD: 'COMPLETED',
  COMPLETED: 'OPEN',
  CANCELLED: 'OPEN',
};

const SUBTASK_STATUS_COLOR: Record<TaskStatus, string> = {
  OPEN: 'text-muted-foreground',
  IN_PROGRESS: 'text-primary',
  ON_HOLD: 'text-amber-500',
  COMPLETED: 'text-emerald-500',
  CANCELLED: 'text-red-500',
};

// ── Status icon mapping ──────────────────────────────────────────────────────

const STATUS_ICON = {
  OPEN:        Circle,
  IN_PROGRESS: CircleDashed,
  ON_HOLD:      CirclePause,
  COMPLETED:   CircleCheck,
  CANCELLED:   CircleX,
} as const satisfies Record<TaskStatus, React.ComponentType<{ className?: string }>>;

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const Icon = STATUS_ICON[status];
  return <Icon className={cn('h-3.5 w-3.5 shrink-0', taskStatusIconColor[status], className)} />;
}

function PriorityFlag({ priority, className }: { priority: TaskPriority; className?: string }) {
  if (priority === 'NONE') {
    return <span className={cn('text-muted-foreground/40 text-base leading-none select-none', className)}>—</span>;
  }
  return <Flag className={cn('h-3.5 w-3.5 shrink-0 fill-current', taskPriorityIconColor[priority], className)} />;
}

type WorkspaceUser = {
  id: string;
  firstName?: string;
  lastName?: string;
};

function AssigneeCell({ assigneeId, users = [] }: { assigneeId: string | null; users: WorkspaceUser[] }) {
  const user = users?.find((item) => item.id === assigneeId);
  if (!user) return <span className="text-muted-foreground text-xs">—</span>;
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-[9px] font-medium flex items-center justify-center shrink-0">
        {initials}
      </span>
      <span className="truncate text-xs">{user.firstName} {user.lastName}</span>
    </div>
  );
}

// ── Column layout ────────────────────────────────────────────────────────────

const columns = 'grid-cols-[32px_minmax(280px,1fr)_148px_128px_140px_108px_56px]';

const formatDueDate = (value: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
};

// ── TaskRow ──────────────────────────────────────────────────────────────────

// ── Inline subtask row ───────────────────────────────────────────────────────

function InlineSubtaskRow({ subtask, onToggle }: { subtask: Task; onToggle: (id: string, status: TaskStatus) => void }) {
  const Icon = STATUS_ICON[subtask.status];
  return (
    <div className="flex items-center gap-2 pl-12 pr-3 py-1.5 border-b border-border/40 bg-muted/20 text-xs">
      <button
        type="button"
        className="shrink-0"
        onClick={(e) => { e.stopPropagation(); onToggle(subtask.id, STATUS_CYCLE[subtask.status]); }}
      >
        <Icon className={cn('h-3.5 w-3.5 transition-colors hover:opacity-70', SUBTASK_STATUS_COLOR[subtask.status])} />
      </button>
      <span className={cn('flex-1 truncate', subtask.status === 'COMPLETED' && 'text-muted-foreground line-through')}>
        {subtask.title}
      </span>
      {subtask.priority !== 'NONE' && (
        <Flag className={cn('h-3 w-3 shrink-0 fill-current opacity-70', taskPriorityIconColor[subtask.priority])} />
      )}
    </div>
  );
}

// ── Subtasks expansion block ─────────────────────────────────────────────────

function SubtasksBlock({ taskId }: { taskId: string }) {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const subtaskKey = ['tasks', 'subtasks', taskId];

  const { data, isLoading } = useQuery({
    queryKey: subtaskKey,
    queryFn: () => taskApi.listSubtasks(taskId),
    staleTime: 30_000,
  });
  const subtasks: Task[] = Array.isArray(data) ? data : (data as any)?.data ?? [];

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      taskApi.patch(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: subtaskKey });
      const prev = queryClient.getQueryData(subtaskKey);
      queryClient.setQueryData(subtaskKey, (old: any) => {
        const list: Task[] = Array.isArray(old) ? old : old?.data ?? [];
        const updated = list.map((s) => (s.id === id ? { ...s, status } : s));
        return Array.isArray(old) ? updated : { ...old, data: updated };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(subtaskKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: subtaskKey });
    },
  });

  const handleToggle = useCallback((id: string, status: TaskStatus) => {
    toggleMut.mutate({ id, status });
  }, [toggleMut]);

  if (isLoading) {
    return (
      <div className="pl-12 pr-3 py-2 border-b border-border/40 bg-muted/20">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (subtasks.length === 0) {
    return (
      <div className="pl-12 pr-3 py-2 border-b border-border/40 bg-muted/20 text-xs text-muted-foreground italic">
        {language === 'de' ? 'Keine Unteraufgaben' : 'No subtasks'}
      </div>
    );
  }

  const completed = subtasks.filter((s) => s.status === 'COMPLETED').length;
  return (
    <div>
      <div className="pl-12 pr-3 py-1 border-b border-border/40 bg-muted/30 text-[10px] text-muted-foreground font-medium">
        {completed}/{subtasks.length} {language === 'de' ? 'erledigt' : 'complete'}
      </div>
      {subtasks.map((sub) => (
        <InlineSubtaskRow key={sub.id} subtask={sub} onToggle={handleToggle} />
      ))}
    </div>
  );
}

// ── TaskRow ──────────────────────────────────────────────────────────────────

const TaskRow = memo(function TaskRow({
  task,
  selected,
  expanded,
  rowSelection,
  users,
  onSelectTask,
  onPatchTask,
  onDeleteTask,
  onRowSelectionChange,
  onDuplicateTask,
  onToggleExpand,
}: {
  task: Task;
  selected: boolean;
  expanded: boolean;
  rowSelection?: Record<string, boolean>;
  users?: WorkspaceUser[];
  onSelectTask: (taskId: string) => void;
  onPatchTask: (id: string, patch: TaskPatch) => void;
  onDeleteTask: (id: string) => void;
  onRowSelectionChange?: (selection: Record<string, boolean>) => void;
  onDuplicateTask?: (id: string) => void;
  onToggleExpand: (taskId: string) => void;
}) {
  const { t } = useLanguage();
  const isOverdue =
    task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';

  return (
    <div>
      <div
        role="row"
        tabIndex={0}
        className={cn(
          'group grid h-11 items-center gap-3 border-b border-border border-l-2 px-3 text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-ring',
          columns,
          taskPriorityBorderClass[task.priority ?? 'NONE'],
          selected && 'bg-primary/5',
        )}
        onClick={() => onSelectTask(task.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSelectTask(task.id); }}
      >
        {/* Checkbox + Expand */}
        <div role="gridcell" className="flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
            onClick={() => onToggleExpand(task.id)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', expanded && 'rotate-90')} />
          </button>
          <input
            type="checkbox"
            className="rounded border-border w-4 h-4 accent-primary cursor-pointer"
            checked={!!rowSelection?.[task.id]}
            aria-label={t('tasks.selectTask', 'Aufgabe auswählen: {title}', { title: task.title })}
            onChange={(e) => {
              const next = { ...(rowSelection ?? {}) };
              if (e.target.checked) next[task.id] = true;
              else delete next[task.id];
              onRowSelectionChange?.(next);
            }}
          />
        </div>

        {/* Title — display only: clicking the row opens the detail page, where
            the title can be renamed. Inline rename here collided with that
            navigation (client feedback). */}
        <div role="gridcell" className="min-w-0">
          <span className="block max-w-full truncate text-left font-medium text-foreground group-hover:text-primary">
            {task.title}
          </span>
        </div>

        {/* Status — icon + label dropdown */}
        <div role="gridcell" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('tasks.statusAria', 'Status: {status}', { status: getTaskStatusLabel(t, task.status) })}
              >
                <StatusIcon status={task.status} />
                <span className={taskStatusIconColor[task.status]}>{getTaskStatusLabel(t, task.status)}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {TASK_STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s}
                  className="gap-2"
                  onClick={() => onPatchTask(task.id, { status: s, expectedVersion: task.version })}
                >
                  <StatusIcon status={s} />
                  <span className={taskStatusIconColor[s]}>{getTaskStatusLabel(t, s)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Priority — flag + label dropdown */}
        <div role="gridcell" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('tasks.priorityAria', 'Priorität: {priority}', { priority: getTaskPriorityLabel(t, task.priority) })}
              >
                <PriorityFlag priority={task.priority} />
                {task.priority !== 'NONE' && (
                  <span className={taskPriorityIconColor[task.priority]}>{getTaskPriorityLabel(t, task.priority)}</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              {TASK_PRIORITIES.map((p) => (
                <DropdownMenuItem
                  key={p}
                  className="gap-2"
                  onClick={() => onPatchTask(task.id, { priority: p, expectedVersion: task.version })}
                >
                  <PriorityFlag priority={p} />
                  <span className={p === 'NONE' ? 'text-muted-foreground' : taskPriorityIconColor[p]}>
                    {getTaskPriorityLabel(t, p)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Assignee */}
        <div role="gridcell" className="min-w-0">
          <AssigneeCell assigneeId={task.assigneeId} users={users ?? []} />
        </div>

        {/* Due date */}
        <div
          role="gridcell"
          className={cn('text-xs', isOverdue ? 'text-danger font-medium' : 'text-muted-foreground')}
        >
          {formatDueDate(task.dueDate)}
        </div>

        {/* Actions */}
        <div role="gridcell" className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicateTask?.(task.id); }}>
                <Copy className="mr-2 h-4 w-4" /> {t('common.duplicate', 'Duplizieren')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {t('common.delete', 'Löschen')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Expanded subtasks */}
      {expanded && <SubtasksBlock taskId={task.id} />}
    </div>
  );
});

// ── TaskListView ─────────────────────────────────────────────────────────────

type TaskListViewProps = {
  tasks: Task[];
  selectedTaskId: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
  onSelectTask: (taskId: string) => void;
  onPatchTask: (id: string, patch: TaskPatch) => void;
  onDeleteTask: (id: string) => void;
  rowSelection?: Record<string, boolean>;
  onRowSelectionChange?: (selection: Record<string, boolean>) => void;
  users?: WorkspaceUser[];
  onDuplicateTask?: (id: string) => void;
};

export function TaskListView({
  tasks,
  selectedTaskId,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  onSelectTask,
  onPatchTask,
  onDeleteTask,
  rowSelection,
  onRowSelectionChange,
  users,
  onDuplicateTask,
}: TaskListViewProps) {
  const { t, language } = useLanguage();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = useCallback((taskId: string) => {
    setExpandedIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 14,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  useEffect(() => {
    if (lastVirtualItem && hasNextPage && !isFetchingNextPage && lastVirtualItem.index >= tasks.length - 8) {
      onFetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, lastVirtualItem, onFetchNextPage, tasks.length]);

  const allSelected = tasks.length > 0 && tasks.every((t) => rowSelection?.[t.id]);
  const someSelected = tasks.some((t) => rowSelection?.[t.id]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card" role="grid" aria-label={t('tasks.listAria', 'Aufgabenliste')}>
      {/* Header */}
      <div
        className={cn(
          'grid h-9 shrink-0 items-center gap-3 border-b border-border bg-background px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
          columns,
        )}
        role="row"
      >
        <div role="columnheader" className="flex items-center justify-center">
          <input
            type="checkbox"
            className="rounded border-border w-4 h-4 accent-primary cursor-pointer"
            ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
            checked={allSelected}
            aria-label={t('common.selectAll', 'Alle auswählen')}
            onChange={(e) => {
              if (e.target.checked) {
                const sel: Record<string, boolean> = {};
                tasks.forEach((t) => { sel[t.id] = true; });
                onRowSelectionChange?.(sel);
              } else {
                onRowSelectionChange?.({});
              }
            }}
          />
        </div>
        <div role="columnheader">{t('tasks.task', language === 'de' ? 'Aufgabe' : 'Task')}</div>
        <div role="columnheader">{t('tasks.status', 'Status')}</div>
        <div role="columnheader">{t('tasks.priority', language === 'de' ? 'Priorität' : 'Priority')}</div>
        <div role="columnheader">{t('tasks.assignee', language === 'de' ? 'Zugewiesen' : 'Assignee')}</div>
        <div role="columnheader">{t('tasks.due', language === 'de' ? 'Fällig' : 'Due')}</div>
        <div role="columnheader" />
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {virtualItems.map((virtualRow) => {
            const task = tasks[virtualRow.index];
            if (!task) return null;
            return (
              <div
                key={`${task.id}-${task.version}-${expandedIds[task.id] ? 'e' : 'c'}`}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
              >
                <TaskRow
                  task={task}
                  selected={selectedTaskId === task.id}
                  expanded={!!expandedIds[task.id]}
                  rowSelection={rowSelection}
                  users={users}
                  onSelectTask={onSelectTask}
                  onPatchTask={onPatchTask}
                  onDeleteTask={onDeleteTask}
                  onRowSelectionChange={onRowSelectionChange}
                  onDuplicateTask={onDuplicateTask}
                  onToggleExpand={toggleExpand}
                />
              </div>
            );
          })}
        </div>
        {isFetchingNextPage && (
          <div className="h-10 px-4 py-3 text-xs text-muted-foreground">{t('common.loadingMore', 'Weitere laden...')}</div>
        )}
      </div>
    </div>
  );
}
