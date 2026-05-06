'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import { CalendarDays, Columns3, List, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { TaskPriority, TaskStatus, TaskViewType } from '../types/task-types';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  taskPriorityClass,
  taskStatusClass,
} from './task-ui-constants';

type TaskCommandBarProps = {
  activeView: TaskViewType;
  search: string;
  status: TaskStatus | 'ALL';
  priority: TaskPriority | 'ALL';
  isStale: boolean;
  isFetching: boolean;
  onViewChange: (view: TaskViewType) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (status: TaskStatus | 'ALL') => void;
  onPriorityChange: (priority: TaskPriority | 'ALL') => void;
  onCreateTask: (title: string) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
};

const views: Array<{ value: TaskViewType; label: string; icon: typeof List; disabled?: boolean }> = [
  { value: 'list', label: 'List', icon: List },
  { value: 'board', label: 'Board', icon: Columns3 },
  { value: 'calendar', label: 'Calendar', icon: CalendarDays, disabled: true },
  { value: 'timeline', label: 'Timeline', icon: SlidersHorizontal, disabled: true },
];

export function TaskCommandBar({
  activeView,
  search,
  status,
  priority,
  isStale,
  isFetching,
  onViewChange,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onCreateTask,
  pageSize,
  onPageSizeChange,
}: TaskCommandBarProps) {
  const [quickTitle, setQuickTitle] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = quickTitle.trim() || 'New task';
    onCreateTask(title);
    setQuickTitle('');
  };

  return (
    <div className="border-b border-border bg-card">
      <div className="flex h-12 items-center gap-2 px-3">
        <div className="relative min-w-64 flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)}
            placeholder="Search tasks"
            className="h-8 rounded-md border-border bg-background pl-9 text-sm"
            aria-label="Search tasks"
          />
        </div>

        <form onSubmit={submit} className="hidden min-w-72 items-center gap-2 lg:flex">
          <Input
            type="text"
            value={quickTitle}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setQuickTitle(event.target.value)}
            placeholder="Quick add task"
            className="h-8 rounded-md border-border bg-background text-sm"
            aria-label="Quick add task title"
          />
          <Button type="submit" size="sm" className="h-8 gap-1">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </form>

        <div className="ml-auto flex items-center gap-1 rounded-md border border-border bg-background p-0.5" role="tablist" aria-label="Task views">
          {views.map((view) => {
            const Icon = view.icon;
            return (
              <Button
                key={view.value}
                type="button"
                variant="ghost"
                size="sm"
                disabled={view.disabled}
                className={cn('h-7 gap-1 rounded px-2 text-xs', activeView === view.value && 'bg-primary text-primary-foreground hover:bg-primary')}
                onClick={() => onViewChange(view.value)}
              >
                <Icon className="h-3.5 w-3.5" />
                {view.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex h-11 items-center gap-2 border-t border-border px-3">
        <Select value={status} onValueChange={(value: string) => onStatusChange(value as TaskStatus | 'ALL')}>
          <SelectTrigger
            className={cn(
              'h-8 w-40 border text-xs font-semibold',
              status === 'ALL' ? 'border-primary/25 bg-primary/10 text-primary' : taskStatusClass[status],
            )}
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="">
            <SelectItem value="ALL" className="bg-primary/10 text-primary" textValue="All statuses">All statuses</SelectItem>
            {TASK_STATUSES.map((item) => (
              <SelectItem key={item} value={item} className={taskStatusClass[item]} textValue={TASK_STATUS_LABEL[item]}>{TASK_STATUS_LABEL[item]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={(value: string) => onPriorityChange(value as TaskPriority | 'ALL')}>
          <SelectTrigger
            className={cn(
              'h-8 w-40 border text-xs font-semibold',
              priority === 'ALL' ? 'border-secondary/25 bg-secondary/10 text-secondary' : taskPriorityClass[priority],
            )}
          >
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent className="">
            <SelectItem value="ALL" className="bg-secondary/10 text-secondary" textValue="All priorities">All priorities</SelectItem>
            {TASK_PRIORITIES.map((item) => (
              <SelectItem key={item} value={item} className={taskPriorityClass[item]} textValue={TASK_PRIORITY_LABEL[item]}>{TASK_PRIORITY_LABEL[item]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {onPageSizeChange && (
          <Select value={String(pageSize ?? 50)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
              <SelectItem value="100">100 / page</SelectItem>
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {isFetching ? <span>Syncing view...</span> : null}
          {isStale ? <span className="text-warning">Stale cache</span> : <span>Live cache</span>}
        </div>
      </div>
    </div>
  );
}
