'use client';

import { memo, useMemo, useRef, useState, type ReactNode } from 'react';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CalendarDays, GripVertical, MessageSquare, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import type { Task, TaskPatch, TaskStatus } from '../types/task-types';
import { TASK_STATUSES, getTaskPriorityLabel, getTaskStatusLabel, taskPriorityClass, taskStatusClass } from './task-ui-constants';

type TaskBoardViewProps = {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onPatchTask: (id: string, patch: TaskPatch) => void;
  users?: WorkspaceUser[];
};

type WorkspaceUser = {
  id: string;
  firstName?: string;
  lastName?: string;
};

function AssigneeCell({ assigneeId, users = [] }: { assigneeId: string | null; users: WorkspaceUser[] }) {
  const user = users.find((u) => u.id === assigneeId);
  if (!user) return null;
  const inits = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <span
      className="h-5 w-5 rounded-full bg-primary/20 text-primary text-[9px] font-medium flex items-center justify-center shrink-0"
      title={`${user.firstName} ${user.lastName}`}
    >
      {inits}
    </span>
  );
}

const formatDueDate = (value: string | null) => {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
};

const sortBoardTasks = (items: Task[]) =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

const getTopSortOrder = (items: Task[]) => {
  const first = sortBoardTasks(items)[0];
  return first ? first.sortOrder - 1 : 0;
};

function TaskCardSurface({
  task,
  selected,
  users,
  dragHandle,
  isDragging,
  isOverlay,
  onSelectTask,
}: {
  task: Task;
  selected: boolean;
  users: WorkspaceUser[];
  dragHandle?: ReactNode;
  isDragging?: boolean;
  isOverlay?: boolean;
  onSelectTask?: (taskId: string) => void;
}) {
  const { t } = useLanguage();
  const due = formatDueDate(task.dueDate);

  return (
    <article
      className={cn(
        'group rounded-lg border border-border bg-card p-3 shadow-sm transition hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring',
        selected && 'border-primary bg-primary/5',
        isDragging && 'opacity-40',
        isOverlay && 'cursor-grabbing border-primary/50 shadow-2xl ring-2 ring-primary/20',
      )}
    >
      <div className="flex items-start gap-2">
        {dragHandle}
        {onSelectTask ? (
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-sm font-semibold leading-5 text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelectTask(task.id)}
          >
            <span className="line-clamp-2">{task.title}</span>
          </button>
        ) : (
          <div className="min-w-0 flex-1 text-sm font-semibold leading-5 text-foreground">
            <span className="line-clamp-2">{task.title}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn('rounded border px-1.5 py-0.5 font-medium', taskPriorityClass[task.priority])}>
          {getTaskPriorityLabel(t, task.priority)}
        </span>
        {due ? (
          <span className={cn('inline-flex items-center gap-1', task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED' ? 'text-danger' : '')}>
            <CalendarDays className="h-3 w-3" />
            {due}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        {task.noteCount > 0 ? <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{task.noteCount}</span> : null}
        {task.attachmentCount > 0 ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{task.attachmentCount}</span> : null}
        <span className="ml-auto">
          <AssigneeCell assigneeId={task.assigneeId} users={users} />
        </span>
      </div>
    </article>
  );
}

const TaskCard = memo(function TaskCard({
  task,
  selected,
  users,
  onSelectTask,
}: {
  task: Task;
  selected: boolean;
  users: WorkspaceUser[];
  onSelectTask: (taskId: string) => void;
}) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  });

  return (
    <div ref={setNodeRef}>
      <TaskCardSurface
        task={task}
        selected={selected}
        users={users}
        isDragging={isDragging}
        onSelectTask={onSelectTask}
        dragHandle={(
          <button
            type="button"
            className="mt-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            aria-label={t('tasks.dragTask', 'Aufgabe ziehen: {title}', { title: task.title })}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      />
    </div>
  );
});

function TaskBoardColumn({
  status,
  tasks,
  selectedTaskId,
  users,
  onSelectTask,
}: {
  status: TaskStatus;
  tasks: Task[];
  selectedTaskId: string | null;
  users: WorkspaceUser[];
  onSelectTask: (taskId: string) => void;
}) {
  const { t } = useLanguage();
  const statusLabel = getTaskStatusLabel(t, status);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 132,
    overscan: 6,
  });

  return (
    <section
      ref={setNodeRef}
      className={cn('flex min-h-0 min-w-70 flex-1 flex-col rounded-lg border border-border bg-background', isOver && 'border-primary bg-primary/5')}
      aria-label={t('tasks.boardColumnAria', '{status} Spalte', { status: statusLabel })}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className={cn('h-2.5 w-2.5 rounded-full border', taskStatusClass[status])} />
        <span className="text-xs font-semibold uppercase text-foreground">{statusLabel}</span>
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{tasks.length}</span>
      </header>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto p-2 scrollbar-thin">
        {tasks.length === 0 ? (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
            {t('tasks.dropTasksHere', 'Aufgaben hier ablegen')}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const task = tasks[virtualItem.index];
              if (!task) return null;
              return (
                <div
                  key={`${task.id}-${task.version}`}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  className="pb-2"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <TaskCard task={task} selected={selectedTaskId === task.id} users={users} onSelectTask={onSelectTask} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function TaskBoardView({ tasks, selectedTaskId, onSelectTask, onPatchTask, users }: TaskBoardViewProps) {
  const { t } = useLanguage();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      OPEN: [],
      IN_PROGRESS: [],
      ON_HOLD: [],
      COMPLETED: [],
      CANCELLED: [],
    };
    for (const task of tasks) map[task.status].push(task);
    for (const status of TASK_STATUSES) map[status] = sortBoardTasks(map[status]);
    return map;
  }, [tasks]);

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks],
  );

  const onDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null);
    const taskId = String(event.active.id);
    const nextStatus = event.over?.id;
    if (!nextStatus || !TASK_STATUSES.includes(nextStatus as TaskStatus)) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const targetStatus = nextStatus as TaskStatus;
    const targetTasks = grouped[targetStatus].filter((item) => item.id !== task.id);
    const nextSortOrder = getTopSortOrder(targetTasks);
    const isAlreadyTop = task.status === targetStatus && grouped[targetStatus][0]?.id === task.id;
    if (isAlreadyTop) return;

    onPatchTask(task.id, {
      ...(task.status !== targetStatus ? { status: targetStatus } : {}),
      sortOrder: nextSortOrder,
      expectedVersion: task.version,
    });
  };

  return (
    <DndContext onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveTaskId(null)}>
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto bg-card p-3 scrollbar-thin" aria-label={t('tasks.boardAria', 'Kanban-Board')}>
        {TASK_STATUSES.map((status) => (
          <TaskBoardColumn
            key={status}
            status={status}
            tasks={grouped[status]}
            selectedTaskId={selectedTaskId}
            users={users ?? []}
            onSelectTask={onSelectTask}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="w-72">
            <TaskCardSurface
              task={activeTask}
              selected={selectedTaskId === activeTask.id}
              users={users ?? []}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
