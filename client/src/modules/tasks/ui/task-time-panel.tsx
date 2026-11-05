'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock3, Focus, Pause, Play, RefreshCw, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useActiveTaskTimer, useTaskTimeSummary, useTaskTimerActions, useTaskTimerBusy, useTaskTimerUi, useTimerElapsed } from '../hooks/use-task-timer';
import { formatTaskDuration } from '../utils/task-time-format';
import { TaskTimeMetrics, TaskEmployeeTimeTable } from './task-time-summary';
import type { Task } from '../types/task-types';

export function TaskTimePanel({ task }: { task: Task }) {
  const { t, locale } = useLanguage();
  const { hasPermission } = usePermissions();
  const [page, setPage] = useState(1);
  const [targetMinutes, setTargetMinutes] = useState(25);
  const timer = useActiveTaskTimer();
  const elapsed = useTimerElapsed(timer);
  const query = useTaskTimeSummary(task.id, page);
  const { start, change } = useTaskTimerActions();
  const busy = useTaskTimerBusy();
  const setFocusId = useTaskTimerUi(state => state.setFocusId);
  const setStopId = useTaskTimerUi(state => state.setStopId);
  const active = timer.data?.session;
  const mine = active?.taskId === task.id ? active : null;
  const canStart = hasPermission('tasks:write') && !['COMPLETED', 'CANCELLED'].includes(task.status) && !active && timer.isSuccess && !timer.isError;
  const startTimer = (mode: 'TIMER' | 'FOCUS') => start.mutate({ taskId: task.id, mode, targetMinutes }, {
    onSuccess: result => { if (mode === 'FOCUS' && result.session) setFocusId(result.session.id); },
  });
  const timestamp = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  return <section data-testid="task-time-panel" className="mb-5 space-y-5 rounded-xl border border-border bg-card p-4 shadow-theme-sm sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">{t('tasks.time.title', 'Time & focus')}</h2></div>
      <span className="text-xs text-muted-foreground">{t('tasks.time.saved', 'Sessions saved across devices')}</span>
    </div>
    <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
      {mine ? <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-medium text-primary">{mine.status === 'PAUSED' ? t('tasks.time.paused', 'Paused') : t('tasks.time.running', 'Tracking time')}</p><p role="timer" aria-live="off" className="mt-1 font-mono text-3xl font-semibold tabular-nums">{formatTaskDuration(elapsed)}</p></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || !hasPermission('tasks:write')} onClick={() => change.mutate({ sessionId: mine.id, action: mine.status === 'PAUSED' ? 'resume' : 'pause' })}>{mine.status === 'PAUSED' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{mine.status === 'PAUSED' ? t('tasks.time.resume', 'Resume') : t('tasks.time.pause', 'Pause')}</Button>
            <Button size="sm" variant="outline" onClick={() => setFocusId(mine.id)}><Focus className="h-3.5 w-3.5" />{t('tasks.time.focus', 'Focus mode')}</Button>
            <Button size="sm" disabled={busy || !hasPermission('tasks:write')} onClick={() => setStopId(mine.id)}><Square className="h-3.5 w-3.5" />{t('tasks.time.stop', 'Stop timer')}</Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t('tasks.time.started', 'Started')}: {timestamp(mine.startedAt)} · {t('tasks.time.pauses', '{count} pauses', { count: mine.pauseCount })}</p>
      </> : <>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!canStart || busy} onClick={() => startTimer('TIMER')}><Play className="h-3.5 w-3.5" />{t('tasks.time.start', 'Start timer')}</Button>
          <Button size="sm" variant="outline" disabled={!canStart || busy} onClick={() => startTimer('FOCUS')}><Focus className="h-3.5 w-3.5" />{t('tasks.time.startFocus', 'Start focus')}</Button>
          <Select value={String(targetMinutes)} onValueChange={value => setTargetMinutes(Number(value))}><SelectTrigger aria-label={t('tasks.time.focusGoal', 'Focus goal')} className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger><SelectContent>{[15, 25, 50, 90].map(minutes => <SelectItem key={minutes} value={String(minutes)}>{t('tasks.time.minutes', '{count} min', { count: minutes })}</SelectItem>)}</SelectContent></Select>
        </div>
        {active && <p className="mt-3 text-xs text-muted-foreground">{t('tasks.time.otherActive', 'Another task timer is active. Stop it before starting this task.')} <Link className="font-medium text-primary underline" href={`/tasks/all/${active.taskId}`}>{active.taskTitle}</Link></p>}
        {['COMPLETED', 'CANCELLED'].includes(task.status) && <p className="mt-3 text-xs text-muted-foreground">{t('tasks.time.reopen', 'Reopen the task to track another session.')}</p>}
      </>}
      {timer.isError && <p role="status" className="mt-3 text-xs text-warning">{t('tasks.time.syncError', 'Timer status could not be refreshed. Saved time is retained.')} <button type="button" className="underline" onClick={() => void timer.refetch()}>{t('common.retry', 'Retry')}</button></p>}
    </div>
    {query.data ? <>
      <TaskTimeMetrics data={query.data} />
      <p className="text-xs leading-5 text-muted-foreground">{t('tasks.time.averageHelp', 'Average session uses stopped sessions. Total time includes running sessions and excludes pauses.')}</p>
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">{t('tasks.time.employeeBreakdown', 'Time by employee')}</h3>
      <TaskEmployeeTimeTable data={query.data} />
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold uppercase text-muted-foreground">{t('tasks.time.history', 'Session history')}</h3><span className="text-xs text-muted-foreground">{t('tasks.time.sessionCount', '{count} sessions', { count: query.data.sessionCount })}</span></div>
      <div className="space-y-2">{query.data.sessions.map(session => <article key={session.id} className="rounded-lg border border-border p-3 text-xs">
        <div className="flex items-center justify-between gap-2"><span className="font-medium">{session.userName || t('tasks.time.employee', 'Employee')}</span><span className="font-mono font-semibold tabular-nums">{formatTaskDuration(session.elapsedMs)}</span></div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground"><span>{t('tasks.time.started', 'Started')}: {timestamp(session.startedAt)}</span><span>{session.stoppedAt ? `${t('tasks.time.stopped', 'Stopped')}: ${timestamp(session.stoppedAt)}` : session.status === 'PAUSED' ? t('tasks.time.paused', 'Paused') : t('tasks.time.running', 'Tracking time')}</span><span>{session.mode === 'FOCUS' ? t('tasks.time.focus', 'Focus mode') : t('tasks.time.timer', 'Timer')}</span></div>
        {session.note && <p className="mt-2 whitespace-pre-wrap break-words leading-5">{session.note}</p>}
        {session.stopReason && session.stopReason !== 'USER' && <p className="mt-2 text-muted-foreground">{t('tasks.time.autoStopped', 'Stopped automatically when the task was closed or deleted.')}</p>}
      </article>)}</div>
      {(page > 1 || query.data.hasMore) && <div className="flex items-center justify-between"><Button size="sm" variant="outline" disabled={page === 1 || query.isFetching} onClick={() => setPage(value => value - 1)}>{t('common.previous', 'Previous')}</Button><span className="text-xs text-muted-foreground">{t('tasks.time.page', 'Page {count}', { count: page })}</span><Button size="sm" variant="outline" disabled={!query.data.hasMore || query.isFetching} onClick={() => setPage(value => value + 1)}>{t('common.next', 'Next')}</Button></div>}
    </> : query.isLoading ? <p className="text-xs text-muted-foreground">{t('common.loading', 'Loading…')}</p> : null}
    {query.isError && <div role="status" className="flex items-center justify-between gap-3 text-xs text-warning">{t('tasks.time.historyError', 'Time history could not be loaded. Please retry.')}<Button variant="outline" size="sm" onClick={() => void query.refetch()}><RefreshCw className="h-3.5 w-3.5" />{t('common.retry', 'Retry')}</Button></div>}
  </section>;
}
