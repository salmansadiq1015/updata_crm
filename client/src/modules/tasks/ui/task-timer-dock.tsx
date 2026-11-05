'use client';

import { useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Clock3, Focus, Pause, Play, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useActiveTaskTimer, useTaskTimerActions, useTaskTimerBusy, useTaskTimerUi, useTimerElapsed } from '../hooks/use-task-timer';
import { formatTaskDuration } from '../utils/task-time-format';
import type { TaskTimeSession } from '../types/task-time-types';

function StopSessionDialog({ session }: { session: TaskTimeSession }) {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const stopId = useTaskTimerUi(state => state.stopId);
  const setStopId = useTaskTimerUi(state => state.setStopId);
  const setFocusId = useTaskTimerUi(state => state.setFocusId);
  const { change } = useTaskTimerActions();
  const busy = useTaskTimerBusy();
  return <Dialog open={stopId === session.id} onOpenChange={open => { if (!open && !busy) setStopId(null); }}>
    <DialogContent className="sm:max-w-lg">
      <form className="space-y-4 p-5 sm:p-6" onSubmit={event => {
        event.preventDefault();
        if (busy) return;
        change.mutate({ sessionId: session.id, action: 'stop', note: note.trim() }, { onSuccess: () => { setStopId(null); setFocusId(null); } });
      }}>
        <DialogTitle className="pe-8">{t('tasks.time.finishSession', 'Finish this session')}</DialogTitle>
        <DialogDescription>{t('tasks.time.stopHelp', 'Stopping saves your time. The task stays open until you mark it complete.')}</DialogDescription>
        <label className="block space-y-2 text-sm"><span>{t('tasks.time.sessionNote', 'Session note (optional)')}</span><Textarea className="resize-y" value={note} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNote(event.target.value)} maxLength={1000} disabled={busy} rows={4} placeholder={t('tasks.time.notePlaceholder', 'What did you work on?')} /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setStopId(null)}>{t('common.cancel', 'Cancel')}</Button><Button type="submit" disabled={busy}><Square className="h-4 w-4" />{t('tasks.time.saveStop', 'Save & stop')}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function TaskTimerDock() {
  const { t, locale } = useLanguage();
  const { hasPermission } = usePermissions();
  const timer = useActiveTaskTimer();
  const elapsed = useTimerElapsed(timer);
  const { change } = useTaskTimerActions();
  const busy = useTaskTimerBusy();
  const focusId = useTaskTimerUi(state => state.focusId);
  const setFocusId = useTaskTimerUi(state => state.setFocusId);
  const setStopId = useTaskTimerUi(state => state.setStopId);
  const session = timer.data?.session;
  if (!session) return null;
  const paused = session.status === 'PAUSED';
  const focusOpen = focusId === session.id;
  const goal = session.targetMinutes * 60000;
  const reached = elapsed >= goal;
  const progress = Math.min(100, elapsed / goal * 100);
  const toggle = () => change.mutate({ sessionId: session.id, action: paused ? 'resume' : 'pause' });
  const canControl = hasPermission('tasks:write') && !busy;

  return <>
    {!focusOpen && <aside aria-label={t('tasks.time.activeSession', 'Active session')} className="fixed bottom-20 end-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-primary/30 bg-card p-3 shadow-theme-lg" data-testid="task-timer-dock">
      <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 shrink-0 text-primary" /><Link className="min-w-0 flex-1 truncate text-xs font-semibold hover:text-primary" href={`/tasks/all/${session.taskId}`}>{session.taskTitle}</Link><span role="timer" aria-live="off" className="font-mono text-sm font-semibold tabular-nums">{formatTaskDuration(elapsed)}</span></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{paused ? t('tasks.time.paused', 'Paused') : t('tasks.time.running', 'Tracking time')}</span><div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" aria-label={paused ? t('tasks.time.resume', 'Resume') : t('tasks.time.pause', 'Pause')} disabled={!canControl} onClick={toggle}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</Button>
        <Button size="icon-sm" variant="ghost" aria-label={t('tasks.time.focus', 'Focus mode')} onClick={() => setFocusId(session.id)}><Focus className="h-4 w-4" /></Button>
        <Button size="icon-sm" variant="ghost" aria-label={t('tasks.time.stop', 'Stop timer')} disabled={!canControl} onClick={() => setStopId(session.id)}><Square className="h-4 w-4" /></Button>
      </div></div>
      {timer.isError && <p role="status" className="mt-2 text-xs text-warning">{t('tasks.time.syncError', 'Timer status could not be refreshed. Saved time is retained.')}</p>}
    </aside>}
    <Dialog open={focusOpen} onOpenChange={open => { if (!open) setFocusId(null); }}>
      <DialogContent showCloseButton={false} className="inset-0 top-0 left-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none bg-background sm:max-w-none">
        <div className="absolute inset-0 bg-radial-[at_50%_35%] from-primary/10 via-background to-background" />
        <div className="relative flex h-full flex-col overflow-y-auto p-5 sm:p-8">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium text-primary"><Focus className="h-4 w-4" />{t('tasks.time.focus', 'Focus mode')}</span><Button variant="outline" size="sm" onClick={() => setFocusId(null)}><X className="h-4 w-4" />{t('tasks.time.exitFocus', 'Exit focus')}</Button></div>
          <div className="m-auto w-full max-w-2xl space-y-6 py-10 text-center">
            <DialogTitle className="text-2xl font-semibold tracking-tight sm:text-4xl">{session.taskTitle}</DialogTitle>
            <DialogDescription>{t('tasks.time.focusHelp', 'One task at a time. Pauses are excluded. Leaving this view keeps your timer running.')}</DialogDescription>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{paused ? t('tasks.time.paused', 'Paused') : t('tasks.time.elapsed', 'Session time')}</p>
            <div role="timer" aria-live="off" className="font-mono text-5xl font-semibold tabular-nums tracking-tight sm:text-8xl">{formatTaskDuration(elapsed)}</div>
            <div className="mx-auto max-w-md space-y-3">
              <div className="flex justify-between text-xs text-muted-foreground"><span>{t('tasks.time.goal', 'Focus goal')}: {t('tasks.time.minutes', '{count} min', { count: session.targetMinutes })}</span><span>{formatTaskDuration(Math.max(0, goal - elapsed))} {t('tasks.time.remaining', 'remaining')}</span></div>
              <div role="progressbar" aria-label={t('tasks.time.focusGoal', 'Focus goal')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(progress)} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-1000 motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
              <p role="status" className="min-h-10 text-sm text-primary">{reached ? t('tasks.time.goalReached', 'Focus goal reached. Take a break or keep going. Time continues until you pause or stop.') : t('tasks.time.keepFocus', 'Make room for focused work.')}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3"><Button size="lg" variant="outline" disabled={!canControl} onClick={toggle}>{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? t('tasks.time.resume', 'Resume') : t('tasks.time.pauseBreak', 'Pause / take a break')}</Button><Button size="lg" disabled={!canControl} onClick={() => setStopId(session.id)}><Square className="h-4 w-4" />{t('tasks.time.finishSession', 'Finish this session')}</Button></div>
            <p className="text-xs text-muted-foreground">{t('tasks.time.started', 'Started')}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.startedAt))} · {t('tasks.time.pauses', '{count} pauses', { count: session.pauseCount })}</p>
            {timer.isError && <p role="status" className="text-xs text-warning">{t('tasks.time.syncError', 'Timer status could not be refreshed. Saved time is retained.')}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <StopSessionDialog key={session.id} session={session} />
  </>;
}
