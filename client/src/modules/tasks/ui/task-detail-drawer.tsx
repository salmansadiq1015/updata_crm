'use client';

import { CalendarDays, Copy, Paperclip, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Task, TaskPatch } from '../types/task-types';
import { TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, taskPriorityClass, taskStatusClass } from './task-ui-constants';
import { TaskInlineField } from './task-inline-field';
import { TaskEmptyState } from './task-empty-state';
import { AssigneeSelector } from './assignee-selector';

type TaskDetailDrawerProps = {
  task: Task | undefined;
  open: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onPatchTask: (id: string, patch: TaskPatch) => void;
  users?: any[];
  onDuplicateTask?: (id: string) => void;
};

const formatDate = (value: string | null) => {
  if (!value) return 'No due date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
};

export default function TaskDetailDrawer({ task, open, isLoading, onOpenChange, onPatchTask, users, onDuplicateTask }: TaskDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 bg-card p-0 sm:max-w-xl">
        {isLoading ? (
          <div className="space-y-4 p-5">
            <div className="h-7 w-3/4 rounded bg-muted skeleton-shimmer" />
            <div className="h-4 w-1/2 rounded bg-muted skeleton-shimmer" />
            <div className="h-28 rounded-lg bg-muted skeleton-shimmer" />
          </div>
        ) : task ? (
          <>
            <SheetHeader className="border-b border-border p-5 pr-12">
              <SheetTitle className="">
                <TaskInlineField
                  value={task.title}
                  ariaLabel="Edit task title"
                  className="block max-w-full truncate text-left text-base font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onCommit={(title) => onPatchTask(task.id, { title, expectedVersion: task.version })}
                />
              </SheetTitle>
              <SheetDescription className="">Version {task.version} - updated {formatDate(task.updatedAt)}</SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  <span>Status</span>
                  <Select value={task.status} onValueChange={(status: string) => onPatchTask(task.id, { status: status as Task['status'], expectedVersion: task.version })}>
                    <SelectTrigger className={cn('h-8 border text-xs font-semibold', taskStatusClass[task.status])}><SelectValue /></SelectTrigger>
                    <SelectContent className="">
                      {TASK_STATUSES.map((status) => (
                        <SelectItem key={status} value={status} className={taskStatusClass[status]} textValue={TASK_STATUS_LABEL[status]}>{TASK_STATUS_LABEL[status]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  <span>Priority</span>
                  <Select value={task.priority} onValueChange={(priority: string) => onPatchTask(task.id, { priority: priority as Task['priority'], expectedVersion: task.version })}>
                    <SelectTrigger className={cn('h-8 border text-xs font-semibold', taskPriorityClass[task.priority])}><SelectValue /></SelectTrigger>
                    <SelectContent className="">
                      {TASK_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority} className={taskPriorityClass[priority]} textValue={TASK_PRIORITY_LABEL[priority]}>{TASK_PRIORITY_LABEL[priority]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <div className="mt-5 grid gap-2 text-sm">
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Assignee</span>
                  <div className="ml-auto">
                    <AssigneeSelector
                      assigneeId={task.assigneeId ?? null}
                      users={users ?? []}
                      onAssigneeChange={(assigneeId) =>
                        onPatchTask(task.id, { assigneeId, expectedVersion: task.version })
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Due date</span>
                  <span className="ml-auto font-medium">{formatDate(task.dueDate)}</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Attachments</span>
                  <span className="ml-auto font-medium">{task.attachmentCount}</span>
                </div>
              </div>

              <section className="mt-5">
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Description</h3>
                <div className="min-h-32 rounded-lg border border-border bg-background p-3 text-sm text-foreground">
                  {task.description ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: task.description }} />
                  ) : (
                    <p className="text-muted-foreground">No description yet.</p>
                  )}
                </div>
              </section>
            </div>

            <div className="border-t border-border p-4 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => task && onDuplicateTask?.(task.id)}
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Close details
              </Button>
            </div>
          </>
        ) : (
          <TaskEmptyState type="empty" />
        )}
      </SheetContent>
    </Sheet>
  );
}
