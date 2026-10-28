'use client';

import { cn } from '@/lib/utils';

const STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  archived: 'bg-muted text-muted-foreground',
  waiting: 'bg-amber-500/15 text-amber-300',
  calling: 'bg-emerald-500/15 text-emerald-300',
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  queued: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  running: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  completed: 'bg-brand-500/15 text-brand-600 dark:text-brand-400',
  cancelled: 'bg-muted text-muted-foreground',
  failed: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  // dispositions / qualifications reuse the same pill
  qualified: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  unqualified: 'bg-muted text-muted-foreground',
  callback: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  review: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  do_not_contact: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  answered_completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  answered_partial: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  no_answer: 'bg-muted text-muted-foreground',
  needs_reconcile: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  needs_review: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
};

// A parked call is not a failure: nobody knows yet whether it reached the lead.
const LABELS: Record<string, string> = { needs_reconcile: 'outcome unknown', needs_review: 'outcome unknown' };

export function StatusPill({ status }: { status: string }) {
  if (!status) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5 capitalize', STYLES[status] || 'bg-muted text-muted-foreground')}>
      {LABELS[status] || status.replace(/_/g, ' ')}
    </span>
  );
}
