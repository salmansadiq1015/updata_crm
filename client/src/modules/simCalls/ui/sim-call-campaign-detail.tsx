'use client';

import { useState } from 'react';
import { X, Play, Pause, XCircle, RotateCcw, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { useSimCallCampaign, useSimCallEvents, useSimCallMutations, useSimCallTasks } from '../hooks/use-sim-calls';
import { campaignActions, OUTCOME_LABEL, progress, STATUS_LABEL, TASK_LABEL, zonedLocalToIso } from '../sim-call-domain';
import type { SimCallQuestion, SimCallTask, TaskState } from '../types/sim-call-types';
import { ContactLimitSkips } from '@/modules/smsOps/ui/contact-limit-skips';

const STATES: (TaskState | '')[] = ['', 'pending', 'scheduled', 'needs_review', 'completed', 'skipped', 'ineligible', 'cancelled'];
const fmt = (iso: string | null | undefined, timeZone?: string) =>
  iso ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(iso)) : '—';

export function SimCallCampaignDetail({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const { data: c, isLoading, isError, refetch } = useSimCallCampaign(campaignId);
  const [state, setState] = useState<TaskState | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'leads' | 'callbacks' | 'activity'>('leads');
  const tasks = useSimCallTasks(campaignId, { state: state || undefined, q: q || undefined, page });
  const callbacks = useSimCallTasks(campaignId, { state: 'scheduled' });
  const events = useSimCallEvents(campaignId);
  const m = useSimCallMutations();
  const [confirmCancel, setConfirmCancel] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="SIM call campaign">
      <div className="flex h-full w-full max-w-4xl flex-col bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{c?.name ?? 'Campaign'}</h2>
            {c ? <p className="text-xs text-muted-foreground">{STATUS_LABEL[c.status]} · timezone {c.settings.timezone} · calling {c.settings.callWindow.start}–{c.settings.callWindow.end}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        {isLoading ? <p className="p-5 text-sm text-muted-foreground">Loading…</p> : null}
        {isError ? <button type="button" className="m-5 text-sm text-brand-500" onClick={() => void refetch()}>Could not load. Retry</button> : null}
        {c ? (
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {(() => {
              const p = progress(c.summary);
              return (
                <div className="space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent}>
                    <div className="h-2 rounded-full bg-brand-500" style={{ width: `${p.percent}%` }} />
                  </div>
                  <p className="text-sm text-muted-foreground">{p.closed} of {c.summary.total} done · {p.remaining} left · {c.summary.attempts} call attempt(s)</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {[
                      ['Answered', c.summary.answered], ['No answer / busy', c.summary.noAnswer + c.summary.busy], ['Refused', c.summary.rejected],
                      ['Callbacks', c.summary.callbacks], ['Needs review', c.summary.needsReview], ['Cannot call', c.summary.ineligible],
                    ].map(([label, value]) => (
                      <div key={label as string} className="rounded-lg bg-muted/60 px-3 py-2">
                        <div className="text-lg font-semibold tabular-nums">{value}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <ContactLimitSkips source="sim_call" campaignId={c._id} />
            {c.summary.syncFailed ? (
              <p className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4" /> CRM sync failed for {c.summary.syncFailed} call(s); it is retried automatically, or retry per lead below.</p>
            ) : null}
            {c.summary.needsReview ? (
              <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">{c.summary.needsReview} call(s) were dialled without a recorded outcome. The caller must record them in the app; they are never redialled automatically.</p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {campaignActions(c.status).includes('start') ? <ActionButton icon={Play} label="Start" onClick={() => m.action.mutate({ id: c._id, action: 'start' })} /> : null}
              {campaignActions(c.status).includes('resume') ? <ActionButton icon={Play} label="Resume" onClick={() => m.action.mutate({ id: c._id, action: 'resume' })} /> : null}
              {campaignActions(c.status).includes('pause') ? <ActionButton icon={Pause} label="Pause" onClick={() => m.action.mutate({ id: c._id, action: 'pause' })} /> : null}
              {campaignActions(c.status).includes('retry') ? <ActionButton icon={RotateCcw} label="Retry unreached" onClick={() => m.retry.mutate({ id: c._id })} /> : null}
              {campaignActions(c.status).includes('cancel') ? <ActionButton icon={XCircle} label="Cancel" tone="danger" onClick={() => setConfirmCancel(true)} /> : null}
            </div>
            {c.status === 'running' ? <p className="text-xs text-muted-foreground">Calls are placed from the Updata Android app (Call Agent → Call campaigns → Open caller).</p> : null}

            <div className="flex gap-1 border-b border-border">
              {(['leads', 'callbacks', 'activity'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-brand-500 font-semibold' : 'text-muted-foreground'}`}>
                  {t === 'leads' ? 'Leads' : t === 'callbacks' ? `Callbacks (${c.summary.callbacks})` : 'Activity'}
                </button>
              ))}
            </div>

            {tab === 'leads' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <select aria-label="Filter by state" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={state} onChange={(e) => { setState(e.target.value as TaskState | ''); setPage(1); }}>
                    {STATES.map((s) => <option key={s || 'all'} value={s}>{s ? TASK_LABEL[s] : 'All states'}</option>)}
                  </select>
                  <input aria-label="Search leads" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Search lead…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
                </div>
                {tasks.data?.data.map((t) => <TaskRow key={t.id} task={t} questions={c.questionnaire.questions} onRetrySync={() => m.retrySync.mutate(t.id)} />)}
                {tasks.data && !tasks.data.data.length ? <p className="text-sm text-muted-foreground">No leads match.</p> : null}
                {tasks.data && tasks.data.pagination.pages > 1 ? (
                  <div className="flex items-center justify-end gap-2 text-sm">
                    <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 disabled:opacity-40">Previous</button>
                    <span>{page} / {tasks.data.pagination.pages}</span>
                    <button type="button" disabled={page >= tasks.data.pagination.pages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 disabled:opacity-40">Next</button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === 'callbacks' ? (
              <div className="space-y-2">
                {callbacks.data?.data.map((t) => <CallbackRow key={t.id} task={t} fallbackZone={c.settings.timezone} />)}
                {callbacks.data && !callbacks.data.data.length ? <p className="text-sm text-muted-foreground">No pending callbacks.</p> : null}
              </div>
            ) : null}

            {tab === 'activity' ? (
              <ul className="space-y-1 text-sm">
                {events.data?.data.map((e) => (
                  <li key={e._id} className="text-muted-foreground">{fmt(e.at)} · {e.type.replace('.', ': ').replace(/_/g, ' ')}{e.leadId?.name ? ` · ${e.leadId.name}` : ''}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      {confirmCancel ? (
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this campaign?"
        description="No further leads will be called. A call in progress can still be recorded."
        confirmText="Cancel campaign"
        cancelText="Back"
        loading={m.action.isPending}
        onConfirm={async () => { if (c) await m.action.mutateAsync({ id: c._id, action: 'cancel' }); setConfirmCancel(false); }}
      />
      ) : null}
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, tone }: { icon: typeof Play; label: string; onClick: () => void; tone?: 'danger' }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${tone === 'danger' ? 'text-destructive hover:bg-destructive/10' : 'bg-muted hover:bg-muted/70'}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function TaskRow({ task, questions, onRetrySync }: { task: SimCallTask; questions: SimCallQuestion[]; onRetrySync: () => void }) {
  const [open, setOpen] = useState(false);
  const labels = new Map(questions.map((q) => [q.fieldKey, q.label]));
  const syncFailed = task.attempts?.some((a) => a.sync?.status === 'failed');
  return (
    <div className="rounded-lg border border-border">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="flex-1 truncate font-medium">{task.lead?.name ?? '—'}</span>
        <span className="text-xs text-muted-foreground">{task.outcome ? OUTCOME_LABEL[task.outcome] : ''}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{TASK_LABEL[task.state]}</span>
        {syncFailed ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Not in CRM</span> : null}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border px-3 py-2 text-sm">
          {task.eligibility && !task.eligibility.eligible ? <p className="text-destructive">Cannot call: {task.eligibility.reasons.join(', ')}</p> : null}
          {task.answers.length ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              {task.answers.map((a) => (
                <div key={a.fieldKey} className="contents">
                  <dt className="text-muted-foreground">{labels.get(a.fieldKey) ?? a.fieldKey}</dt>
                  <dd>{a.status === 'answered' ? String(Array.isArray(a.value) ? a.value.join(', ') : a.value) : a.status === 'unknown' ? "Doesn't know" : 'Skipped'}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="text-muted-foreground">No answers yet.</p>}
          {task.attempts?.filter((a) => a.completedAt).map((a) => (
            <div key={a.attemptId} className="rounded bg-muted/50 p-2 text-xs">
              <p>{fmt(a.dialedAt ?? a.completedAt)} · {a.outcome ? OUTCOME_LABEL[a.outcome] : '—'}{a.offhookDurationSec != null ? ` · ${a.offhookDurationSec}s off-hook (not talk time)` : ''} · evidence: {a.evidence}</p>
              {a.notes ? <p>Notes: {a.notes}</p> : null}
              {a.transcript ? <p>Voice note (transcribed, reviewed by caller): {a.transcript}</p> : null}
              <p>CRM sync: {a.sync.status}{a.sync.error ? ` — ${a.sync.error}` : ''}</p>
            </div>
          ))}
          {syncFailed ? <button type="button" onClick={onRetrySync} className="text-brand-500">Retry CRM sync</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function CallbackRow({ task, fallbackZone }: { task: SimCallTask; fallbackZone: string }) {
  const m = useSimCallMutations();
  const zone = task.callback?.timezone ?? fallbackZone;
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState('');
  const [tz, setTz] = useState(zone);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const at = zonedLocalToIso(local, tz);
    if (!at) return setError('Pick a date and time (and a valid timezone).');
    if (Date.parse(at) < Date.now()) return setError('That time is in the past.');
    await m.reschedule.mutateAsync({ taskId: task.id, at, timezone: tz });
    setEditing(false);
  };
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium">{task.lead?.name ?? '—'}</span>
        <span className={task.overdue ? 'text-destructive' : 'text-muted-foreground'}>{fmt(task.callback?.at, zone)} ({zone}){task.overdue ? ' · overdue' : ''}</span>
      </div>
      {task.callback?.reason ? <p className="text-muted-foreground">{task.callback.reason}</p> : null}
      {editing ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1"><span className="text-xs">Local time in the timezone</span><input type="datetime-local" className="block rounded-lg border border-border bg-background px-2 py-1" value={local} onChange={(e) => setLocal(e.target.value)} /></label>
          <label className="space-y-1"><span className="text-xs">Timezone</span><input className="block rounded-lg border border-border bg-background px-2 py-1" value={tz} onChange={(e) => setTz(e.target.value)} /></label>
          <button type="button" onClick={() => void save()} className="rounded-lg bg-brand-500 px-3 py-1.5 text-white">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5">Cancel</button>
          {error ? <span className="text-destructive">{error}</span> : null}
        </div>
      ) : (
        <div className="flex gap-3">
          <button type="button" onClick={() => setEditing(true)} className="text-brand-500">Reschedule</button>
          <button type="button" onClick={() => m.cancelCallback.mutate(task.id)} className="text-destructive">Cancel callback</button>
        </div>
      )}
    </div>
  );
}
