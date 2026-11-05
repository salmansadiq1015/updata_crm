'use client';

import { useState } from 'react';
import { Bot, ChevronDown, History, Loader2, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { enumLabel, formatDateTime, workPatch, workTone, TONE_CLASS, type T } from '../inbound-domain';
import { WORK_STATUSES, type InboundCallDetail } from '../types/inbound-call-types';
import { inputClass, primaryClass } from './inbound-primitives';

type Work = NonNullable<InboundCallDetail['work']>;

/** Why the agent/system set a status: a qualification result, or a named reason. */
export const reasonLabel = (reason: string, t: T) => (reason.startsWith('qualification_')
  ? enumLabel(t, 'qualification', reason.slice('qualification_'.length).toUpperCase())
  : t(`inbound.work.reason.${reason}`, reason.replace(/_/g, ' ')));

/**
 * Review workflow at the top of the call drawer: where the follow-up work stands, who owns it,
 * an optional note, and the full change history (person or AI agent, when, from → to).
 */
export function WorkPanel({ work, users, t, locale, busy, onSave }: {
  work: InboundCallDetail['work']; users: Array<{ id: string; name: string }>; t: T; locale?: string; busy?: boolean;
  onSave: (body: { status?: string; assignedTo?: string | null; note?: string }) => void;
}) {
  const w: Work = work ?? { status: null, reason: null, source: null, updatedAt: null, updatedBy: null, assignee: null, history: [] };
  const [status, setStatus] = useState(w.status ?? '');
  const [assignee, setAssignee] = useState(w.assignee?.id ?? '');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const patch = workPatch({ status: w.status, assigneeId: w.assignee?.id ?? null }, { status, assigneeId: assignee, note });
  // The current assignee is always selectable even if the directory does not list them.
  const options = w.assignee && !users.some((u) => u.id === w.assignee!.id) ? [{ id: w.assignee.id, name: w.assignee.name || w.assignee.id }, ...users] : users;
  const who = w.source === 'agent' ? t('inbound.work.byAgent', 'Set by AI agent') : w.source === 'system' ? t('inbound.work.bySystem', 'Set automatically') : w.updatedBy?.name ? t('inbound.work.byPerson', 'Changed by {name}', { name: w.updatedBy.name }) : null;

  return (
    <section aria-label={t('inbound.work.title', 'Follow-up status')} className="mb-5 rounded-2xl border border-sky-400/25 bg-gradient-to-br from-blue-500/[0.07] to-cyan-500/[0.05] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">{t('inbound.work.status', 'Status')}
          <span className="relative">
            <select aria-label={t('inbound.work.status', 'Status')} className={cn(inputClass, 'appearance-none pe-8 font-semibold', status && TONE_CLASS[workTone(status)])} value={status} onChange={(e) => setStatus(e.target.value)}>
              {!w.status ? <option value="">{t('inbound.work.none', 'Not set')}</option> : null}
              {WORK_STATUSES.map((s) => <option key={s} value={s}>{enumLabel(t, 'work', s)}</option>)}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 opacity-60" />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">{t('inbound.work.assignee', 'Assigned to')}
          <select aria-label={t('inbound.work.assignee', 'Assigned to')} className={inputClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t('inbound.work.unassigned', 'Unassigned')}</option>
            {options.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
      </div>
      {patch ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">{t('inbound.work.note', 'Note (optional)')}
            <input className={cn(inputClass, 'mt-1.5 min-h-0 py-2')} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('inbound.work.notePlaceholder', 'Why is the status changing?')} />
          </label>
          <button type="button" className={cn(primaryClass, 'h-10 min-h-0 px-4 text-xs')} disabled={busy} onClick={() => onSave(patch)}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : null}{t('inbound.work.save', 'Save')}</button>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">{w.source === 'agent' ? <Bot aria-hidden className="size-3.5" /> : <UserRound aria-hidden className="size-3.5" />}{who ? `${who}${w.updatedAt ? ` · ${formatDateTime(w.updatedAt, locale)}` : ''}` : t('inbound.work.notYet', 'Set after the call is processed.')}</span>
        {w.history.length ? <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 font-medium text-primary"><History className="size-3.5" />{t('inbound.work.history', 'Status history ({count})', { count: w.history.length })}</button> : null}
      </div>
      {open && w.history.length ? (
        <ol aria-label={t('inbound.work.historyLabel', 'Status history')} className="mt-3 space-y-2 border-s-2 border-sky-400/30 ps-3">
          {[...w.history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`} className="relative text-xs">
              <span aria-hidden className="absolute -start-[17px] top-1 size-2 rounded-full bg-sky-400" />
              <p className="font-medium">
                {h.from !== h.to && h.to ? <>{h.from ? `${enumLabel(t, 'work', h.from)} → ` : ''}{enumLabel(t, 'work', h.to)}</> : null}
                {h.assignedTo || h.assignedFrom ? <span className="ms-1 font-normal text-muted-foreground">{h.assignedTo ? t('inbound.work.assignedTo', 'assigned to {name}', { name: h.assignedTo.name || '—' }) : t('inbound.work.unassignedFrom', 'unassigned from {name}', { name: h.assignedFrom?.name || '—' })}</span> : null}
              </p>
              <p className="text-muted-foreground">{h.source === 'agent' ? t('inbound.work.byAgent', 'Set by AI agent') : h.source === 'system' ? t('inbound.work.bySystem', 'Set automatically') : h.by?.name || t('inbound.work.someone', 'A team member')} · {formatDateTime(h.at, locale)}{h.reason && h.source !== 'user' ? ` · ${reasonLabel(h.reason, t)}` : ''}</p>
              {h.note ? <p className="mt-0.5 italic text-foreground/80" dir="auto">“{h.note}”</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
