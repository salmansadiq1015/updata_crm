'use client';

import type { MouseEvent } from 'react';
import { memo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Task, TaskPatch } from '../types/task-types';
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, taskPriorityBorderClass, taskPriorityClass, taskStatusClass } from './task-ui-constants';
import { TaskInlineField } from './task-inline-field';

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

const columns = 'grid-cols-[32px_minmax(280px,1fr)_140px_120px_140px_120px_56px]';

const formatDueDate = (value: string | null) => {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
};

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
  return (
    <div
      role="row"
      tabIndex={0}
      className={cn(
        'group grid h-11 items-center gap-3 border-b border-border border-l-2 px-3 text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring',
        columns,
        taskPriorityBorderClass[task.priority ?? 'NONE'],
        selected && 'bg-primary/5',
      )}
      onClick={() => onSelectTask(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelectTask(task.id);
      }}
    >
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

      <div role="gridcell" className="min-w-0">
        <TaskInlineField
          value={task.title}
          ariaLabel={`Edit title for ${task.title}`}
          className="block max-w-full truncate text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onCommit={(title) => onPatchTask(task.id, { title, expectedVersion: task.version })}
        />
      </div>

      <div role="gridcell">
        <Select value={task.status} onValueChange={(status: string) => onPatchTask(task.id, { status: status as Task['status'], expectedVersion: task.version })}>
          <SelectTrigger className={cn('h-7 w-32 rounded-md border px-2 text-xs', taskStatusClass[task.status])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="">
            {TASK_STATUSES.map((status) => (
              <SelectItem key={status} value={status} className={taskStatusClass[status]} textValue={TASK_STATUS_LABEL[status]}>{TASK_STATUS_LABEL[status]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div role="gridcell">
        <Select value={task.priority} onValueChange={(priority: string) => onPatchTask(task.id, { priority: priority as Task['priority'], expectedVersion: task.version })}>
          <SelectTrigger className={cn('h-7 w-28 rounded-md border-border text-xs', taskPriorityClass[task.priority])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="">
            {TASK_PRIORITIES.map((priority) => (
              <SelectItem key={priority} value={priority} className={taskPriorityClass[priority]} textValue={TASK_PRIORITY_LABEL[priority]}>{TASK_PRIORITY_LABEL[priority]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div role="gridcell" className="min-w-0">
        <AssigneeCell assigneeId={task.assigneeId} users={users ?? []} />
      </div>

      <div role="gridcell" className={cn('text-xs', task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED' ? 'text-danger' : 'text-muted-foreground')}>
        {formatDueDate(task.dueDate)}
      </div>

      <div role="gridcell" className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()}>
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
      <div className={cn('grid h-9 shrink-0 items-center gap-3 border-b border-border bg-background px-3 text-[11px] font-semibold uppercase text-muted-foreground', columns)} role="row">
        <div role="columnheader" className="flex items-center justify-center">
          <input
            type="checkbox"
            className="rounded border-border w-4 h-4 accent-primary cursor-pointer"
            ref={(el) => {
              if (el) el.indeterminate = !allSelected && someSelected;
            }}
            checked={allSelected}
            aria-label="Select all"
            onChange={(e) => {
              if (e.target.checked) {
                const newSelection: Record<string, boolean> = {};
                tasks.forEach((t) => { newSelection[t.id] = true; });
                onRowSelectionChange?.(newSelection);
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
        <div role="columnheader" className="sr-only"><MoreHorizontal className="h-4 w-4" /></div>
      </div>

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
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
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
        {isFetchingNextPage ? <div className="h-10 px-4 py-3 text-xs text-muted-foreground">Loading more tasks...</div> : null}
      </div>
    </div>
  );
}
