'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentDialog, inputClass, primaryClass, secondaryClass } from '@/modules/aiCalling/ui/calling-agent-primitives';
import {
  aiTone, audioTone, enumLabel, outcomeTone, qualificationTone, statusTone, TONE_CLASS,
  type T, type Tone,
} from '../inbound-domain';
import { RECOMMENDATION_ACTIONS, type RecommendationAction } from '../types/inbound-call-types';
import { leadTarget, workTone, type LeadChoice } from '../inbound-domain';

export { inputClass, primaryClass, secondaryClass };
export const cardClass = 'rounded-2xl border border-border bg-card';
export const selectClass = 'h-9 min-w-0 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground outline-none focus:border-sky-400/60 focus-visible:ring-2 focus-visible:ring-sky-400/20';

export function Pill({ tone = 'neutral', children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return <span title={title} className={cn('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5', TONE_CLASS[tone], className)}>{children}</span>;
}

export function CallStatusPill({ status, t }: { status: string | null | undefined; t: T }) {
  if (!status) return null;
  const tone = statusTone(status);
  return <Pill tone={tone}>{tone === 'live' && <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" />}{enumLabel(t, 'status', status)}</Pill>;
}
export function AiPill({ status, t }: { status: string | null | undefined; t: T }) {
  if (!status || status === 'not_applicable') return null;
  return <Pill tone={aiTone(status)}>{t('inbound.ai.prefix', 'AI')}: {enumLabel(t, 'ai', status)}</Pill>;
}
export function AudioPill({ status, t }: { status: string | null | undefined; t: T }) {
  if (!status || status === 'none') return null;
  return <Pill tone={audioTone(status)}>{t('inbound.audio.prefix', 'Audio')}: {enumLabel(t, 'audio', status)}</Pill>;
}
export function QualificationPill({ value, t }: { value: string | null | undefined; t: T }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Pill tone={qualificationTone(value)}>{enumLabel(t, 'qualification', value)}</Pill>;
}
export function OutcomePill({ value, t }: { value: string | null | undefined; t: T }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Pill tone={outcomeTone(value)}>{enumLabel(t, 'outcome', value)}</Pill>;
}
export function CallerTypeBadge({ type, t }: { type: string | null | undefined; t: T }) {
  if (!type) return null;
  const tone: Tone = type === 'existing' ? 'info' : type === 'new' ? 'live' : type === 'ambiguous' ? 'warning' : 'neutral';
  return <Pill tone={tone}>{enumLabel(t, 'callerType', type)}</Pill>;
}

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-4 py-3">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-1.5 text-2xl font-semibold tabular-nums text-foreground', tone === 'success' && 'text-emerald-600 dark:text-emerald-400', tone === 'warning' && 'text-amber-600 dark:text-amber-400', tone === 'danger' && 'text-rose-600 dark:text-rose-400', tone === 'live' && 'text-cyan-600 dark:text-cyan-300')}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Section({ title, description, actions, children, className, id }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn(cardClass, 'p-4 sm:p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h2 id={id} className="text-sm font-semibold text-foreground">{title}</h2>{description ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}</div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }: { icon: ComponentType<{ className?: string }>; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl border border-sky-400/20 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 text-primary"><Icon className="size-5" /></span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {hint ? <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ t, onRetry }: { t: T; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 p-8 text-center text-xs text-muted-foreground">
      <AlertTriangle className="size-5 text-amber-500" />
      {t('inbound.common.loadError', 'This could not be loaded.')}
      <button type="button" onClick={onRetry} className="font-semibold text-primary hover:underline">{t('inbound.common.retry', 'Try again')}</button>
    </div>
  );
}

export function SkeletonBlocks({ count = 4, className = 'h-14', label }: { count?: number; className?: string; label: string }) {
  return <div role="status" aria-busy="true" aria-label={label} className="grid gap-2">{Array.from({ length: count }, (_, i) => <div key={i} className={cn('animate-pulse rounded-xl bg-muted/60', className)} />)}</div>;
}

export function Toggle({ checked, onChange, label, description, disabled, id, compact }: { checked: boolean; onChange: (next: boolean) => void; label: string; description?: string; disabled?: boolean; id?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-start justify-between gap-4', !compact && 'py-2')}>
      {compact ? null : <div className="min-w-0"><p id={id ? `${id}-label` : undefined} className="text-sm font-medium text-foreground">{label}</p>{description ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}</div>}
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50', checked ? 'border-transparent bg-gradient-to-r from-blue-600 to-cyan-500' : 'border-border bg-muted')}
      >
        <span className={cn('inline-block size-4.5 rounded-full bg-white shadow transition', checked ? 'translate-x-5.5 rtl:-translate-x-5.5' : 'translate-x-0.5 rtl:-translate-x-0.5')} />
      </button>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={cn('flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground', className)}><span>{label}</span>{children}{hint ? <span className="text-[11px] font-normal leading-relaxed">{hint}</span> : null}</label>;
}

export function ConfirmAction({ title, description, confirmLabel, cancelLabel, busy, onConfirm, onClose, danger }: {
  title: string; description: string; confirmLabel: string; cancelLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void; danger?: boolean;
}) {
  return (
    <AgentDialog title={title} description={description} onClose={() => { if (!busy) onClose(); }}>
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryClass} disabled={busy} onClick={onClose}>{cancelLabel}</button>
        <button type="button" className={cn(primaryClass, danger && '!bg-rose-600 hover:!bg-rose-700')} disabled={busy} onClick={onConfirm}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{confirmLabel}</button>
      </div>
    </AgentDialog>
  );
}

export function NoteDialog({ t, busy, onSubmit, onClose }: { t: T; busy?: boolean; onSubmit: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  return (
    <AgentDialog title={t('inbound.notes.addTitle', 'Add a note')} description={t('inbound.notes.addHint', 'Notes are kept with the call and visible to everyone who can see it.')} onClose={() => { if (!busy) onClose(); }}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSubmit(text.trim()); }}>
        <Field label={t('inbound.notes.label', 'Note')}><textarea autoFocus maxLength={2000} rows={4} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryClass} disabled={busy} onClick={onClose}>{t('inbound.common.cancel', 'Cancel')}</button>
          <button type="submit" className={primaryClass} disabled={busy || !text.trim()}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{t('inbound.notes.save', 'Save note')}</button>
        </div>
      </form>
    </AgentDialog>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
export function defaultDueLocal(hours = 2, now = new Date()): string {
  const d = new Date(now.getTime() + hours * 3_600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type LeadCandidate = { id: string; name: string | null; number: string | null };
export type FollowUpSubmit = { dueAt: string; note: string; action: RecommendationAction; leadId?: string; createLead?: boolean };

/**
 * Pick the lead a follow-up belongs to when the call has none yet: one of the leads the number
 * matched, or a new lead for this caller (only possible when the number was not withheld).
 */
export function LeadChooser({ t, candidates, canCreate, value, onChange }: { t: T; candidates: LeadCandidate[]; canCreate: boolean; value: LeadChoice; onChange: (v: LeadChoice) => void }) {
  const name = 'inbound-lead-choice';
  return (
    <fieldset className="space-y-2 rounded-xl border border-sky-400/25 bg-sky-400/5 p-3">
      <legend className="px-1 text-xs font-semibold text-foreground">{t('inbound.leadChooser.title', 'Link this call to a lead')}</legend>
      <p className="text-[11px] text-muted-foreground">{candidates.length ? t('inbound.leadChooser.hintMatches', 'The number matches these leads. Choose the right one — leads are never merged.') : t('inbound.leadChooser.hintNone', 'No lead is linked to this caller yet.')}</p>
      {candidates.map((c) => (
        <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
          <input type="radio" name={name} checked={value?.kind === 'lead' && value.leadId === c.id} onChange={() => onChange({ kind: 'lead', leadId: c.id })} />
          <span className="min-w-0 truncate">{c.name || c.number || c.id}{c.number && c.name ? <span className="text-muted-foreground"> · {c.number}</span> : null}</span>
        </label>
      ))}
      {canCreate ? (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
          <input type="radio" name={name} checked={value?.kind === 'create'} onChange={() => onChange({ kind: 'create' })} />
          <span>{candidates.length ? t('inbound.leadChooser.createNew', 'None of these — create a new lead for this caller') : t('inbound.leadChooser.create', 'Create a lead for this caller')}</span>
        </label>
      ) : !candidates.length ? <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">{t('inbound.leadChooser.withheld', 'The caller withheld their number, so no lead can be created from this call.')}</p> : null}
    </fieldset>
  );
}

/**
 * Schedule a follow-up (or execute a recommendation). When the call has no lead, the dialog first
 * asks which lead it belongs to (or to create one) and sends `leadId` / `createLead`.
 * `chooserOnly` = just link/create (REVIEW_CALLER_MATCH); `fixedAction` = executing that action.
 */
export function FollowUpDialog({ t, busy, hasLead, candidates = [], canCreate = true, onSubmit, onClose, title, fixedAction, chooserOnly = false }: {
  t: T; busy?: boolean; hasLead: boolean; candidates?: LeadCandidate[]; canCreate?: boolean; onSubmit: (v: FollowUpSubmit) => void; onClose: () => void;
  title?: string; fixedAction?: RecommendationAction; chooserOnly?: boolean;
}) {
  const [due, setDue] = useState(() => defaultDueLocal());
  const [note, setNote] = useState('');
  const [action, setAction] = useState<RecommendationAction>(fixedAction ?? 'ARRANGE_CALLBACK');
  const [choice, setChoice] = useState<LeadChoice>(() => (!hasLead && !candidates.length && canCreate ? { kind: 'create' } : null));
  const dueIso = (() => { const d = new Date(due); return Number.isNaN(d.getTime()) ? null : d.toISOString(); })();
  const leadReady = hasLead || Boolean(choice);
  const ready = leadReady && (chooserOnly || Boolean(dueIso));
  const submit = () => { if (ready) onSubmit({ dueAt: dueIso ?? new Date().toISOString(), note: note.trim(), action, ...(hasLead ? {} : leadTarget(choice)) }); };
  return (
    <AgentDialog title={title ?? t('inbound.followUp.title', 'Schedule a follow-up')} description={chooserOnly ? t('inbound.leadChooser.dialogHint', 'Choose the lead this caller belongs to. Nothing is sent to the caller.') : t('inbound.followUp.hint', 'Creates a follow-up task on the linked lead. Nothing is sent to the caller.')} onClose={() => { if (!busy) onClose(); }}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {!hasLead ? <LeadChooser t={t} candidates={candidates} canCreate={canCreate} value={choice} onChange={setChoice} /> : null}
        {chooserOnly ? null : <>
          {fixedAction ? <p className="text-sm font-medium">{enumLabel(t, 'recommendation', fixedAction)}</p> : (
            <Field label={t('inbound.followUp.type', 'Follow-up type')}>
              <select className={inputClass} value={action} onChange={(e) => setAction(e.target.value as RecommendationAction)}>
                {RECOMMENDATION_ACTIONS.filter((a) => a !== 'REVIEW_CALLER_MATCH').map((a) => <option key={a} value={a}>{enumLabel(t, 'recommendation', a)}</option>)}
              </select>
            </Field>
          )}
          <Field label={t('inbound.followUp.due', 'Due')}><input type="datetime-local" required className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          <Field label={t('inbound.followUp.note', 'Note (optional)')}><textarea rows={3} maxLength={2000} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </>}
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryClass} disabled={busy} onClick={onClose}>{t('inbound.common.cancel', 'Cancel')}</button>
          <button type="submit" className={primaryClass} disabled={busy || !ready}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}{chooserOnly ? t('inbound.leadChooser.confirm', 'Link call') : fixedAction ? t('inbound.rec.execute', 'Execute') : t('inbound.followUp.save', 'Schedule')}</button>
        </div>
      </form>
    </AgentDialog>
  );
}

export function WorkPill({ value, t, source }: { value: string | null | undefined; t: T; source?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Pill tone={workTone(value)} title={source === 'agent' ? t('inbound.work.byAgent', 'Set by AI agent') : undefined}>{enumLabel(t, 'work', value)}{source === 'agent' ? <span aria-hidden className="opacity-70">·AI</span> : null}</Pill>;
}

/** Horizontal bar list (no chart dependency), consistent with the AI calling analytics panel. */
export function BarList({ rows, empty, color = 'bg-gradient-to-r from-blue-600 to-cyan-500' }: { rows: Array<{ key: string; label: string; count: number; sub?: string }>; empty: string; color?: string }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-xs">
          <span className="w-36 shrink-0 truncate text-muted-foreground" title={r.label}>{r.label}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"><span className={cn('block h-full rounded-full', color)} style={{ width: `${(r.count / max) * 100}%` }} /></span>
          <span className="w-10 shrink-0 text-end font-medium tabular-nums">{r.count}</span>
          {r.sub ? <span className="hidden w-16 shrink-0 text-end text-[10px] text-muted-foreground sm:inline">{r.sub}</span> : null}
        </li>
      ))}
    </ul>
  );
}
