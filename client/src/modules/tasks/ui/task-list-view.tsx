'use client';

import type { MouseEvent } from 'react';
import { memo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  Copy,
  Flag,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  taskPriorityBorderClass,
  taskPriorityIconColor,
  taskStatusIconColor,
} from './task-ui-constants';
import { TaskInlineField } from './task-inline-field';

// ── Status icon mapping ──────────────────────────────────────────────────────

const STATUS_ICON = {
  OPEN:        Circle,
  IN_PROGRESS: CircleDashed,
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

function AssigneeCell({ assigneeId, users = [] }: { assigneeId: string | null; users: any[] }) {
  const user = users?.find((u: any) => u.id === assigneeId);
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

const TaskRow = memo(function TaskRow({
  task,
  selected,
  rowSelection,
  users,
  onSelectTask,
  onPatchTask,
  onDeleteTask,
  onRowSelectionChange,
  onDuplicateTask,
}: {
  task: Task;
  selected: boolean;
  rowSelection?: Record<string, boolean>;
  users?: any[];
  onSelectTask: (taskId: string) => void;
  onPatchTask: (id: string, patch: TaskPatch) => void;
  onDeleteTask: (id: string) => void;
  onRowSelectionChange?: (selection: Record<string, boolean>) => void;
  onDuplicateTask?: (id: string) => void;
}) {
  const isOverdue =
    task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';

  return (
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
      {/* Checkbox */}
      <div role="gridcell" className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="rounded border-border w-4 h-4 accent-primary cursor-pointer"
          checked={!!rowSelection?.[task.id]}
          aria-label={`Select task ${task.title}`}
          onChange={(e) => {
            const next = { ...(rowSelection ?? {}) };
            if (e.target.checked) next[task.id] = true;
            else delete next[task.id];
            onRowSelectionChange?.(next);
          }}
        />
      </div>

      {/* Title */}
      <div role="gridcell" className="min-w-0">
        <TaskInlineField
          value={task.title}
          ariaLabel={`Edit title for ${task.title}`}
          className="block max-w-full truncate text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onCommit={(title) => onPatchTask(task.id, { title, expectedVersion: task.version })}
        />
      </div>

      {/* Status — icon + label dropdown */}
      <div role="gridcell" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Status: ${TASK_STATUS_LABEL[task.status]}`}
            >
              <StatusIcon status={task.status} />
              <span className={taskStatusIconColor[task.status]}>{TASK_STATUS_LABEL[task.status]}</span>
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
                <span className={taskStatusIconColor[s]}>{TASK_STATUS_LABEL[s]}</span>
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
              aria-label={`Priority: ${TASK_PRIORITY_LABEL[task.priority]}`}
            >
              <PriorityFlag priority={task.priority} />
              {task.priority !== 'NONE' && (
                <span className={taskPriorityIconColor[task.priority]}>{TASK_PRIORITY_LABEL[task.priority]}</span>
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
                  {TASK_PRIORITY_LABEL[p]}
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
              <Copy className="mr-2 h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
  users?: any[];
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
  const parentRef = useRef<HTMLDivElement | null>(null);
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
    <div className="flex h-full min-h-0 flex-col bg-card" role="grid" aria-label="Tasks list">
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
            aria-label="Select all"
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
        <div role="columnheader">Task</div>
        <div role="columnheader">Status</div>
        <div role="columnheader">Priority</div>
        <div role="columnheader">Assignee</div>
        <div role="columnheader">Due</div>
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
                key={`${task.id}-${task.version}`}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
              >
                <TaskRow
                  task={task}
                  selected={selectedTaskId === task.id}
                  rowSelection={rowSelection}
                  users={users}
                  onSelectTask={onSelectTask}
                  onPatchTask={onPatchTask}
                  onDeleteTask={onDeleteTask}
                  onRowSelectionChange={onRowSelectionChange}
                  onDuplicateTask={onDuplicateTask}
                />
              </div>
            );
          })}
        </div>
        {isFetchingNextPage && (
          <div className="h-10 px-4 py-3 text-xs text-muted-foreground">Loading more…</div>
        )}
      </div>
    </div>
  );
}
