'use client';

import { Inbox, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

type TaskEmptyStateProps = {
  type: 'empty' | 'filtered' | 'error' | 'offline';
  onReset?: () => void;
  onRetry?: () => void;
};

export function TaskEmptyState({ type, onReset, onRetry }: TaskEmptyStateProps) {
  const isError = type === 'error' || type === 'offline';
  const Icon = type === 'offline' ? WifiOff : Inbox;
  const title = {
    empty: 'No tasks yet',
    filtered: 'No tasks match this view',
    error: 'Tasks could not be loaded',
    offline: 'You are offline',
  }[type];
  const body = {
    empty: 'Create a task to start building this workspace.',
    filtered: 'Adjust search or filters to widen the task window.',
    error: 'The current view is still available from cache when possible.',
    offline: 'Cached tasks remain usable. Changes will sync after reconnect.',
  }[type];

  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface">
        <Icon className={isError ? 'h-5 w-5 text-warning' : 'h-5 w-5 text-primary'} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
      </div>
      {type === 'filtered' && onReset ? (
        <Button type="button" variant="outline" size="sm" className="" onClick={onReset}>
          Clear filters
        </Button>
      ) : null}
      {isError && onRetry ? (
        <Button type="button" variant="outline" size="sm" className="" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
