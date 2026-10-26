'use client';

import { useState } from 'react';
import { X, Loader2, CheckCircle2, Save, AlertTriangle, PhoneCall, HelpCircle } from 'lucide-react';
import { useCall, useReconcileCall, useReviewCall } from '../hooks/use-ai-calling';
import type { CallAnswer, CallRecord, ReconcileResolution } from '../types/ai-calling-types';
import { StatusPill } from './status-pill';

const VALIDATIONS = ['valid', 'invalid', 'unknown', 'unconfirmed'] as const;
const QUALIFICATIONS = ['qualified', 'unqualified', 'callback', 'review', 'do_not_contact', 'none'] as const;

type Edit = { normalizedValue: string; validation: string };

const RESOLUTIONS: Array<{ value: ReconcileResolution; label: string; hint: string }> = [
  { value: 'reached', label: 'The lead was reached', hint: 'The call connected (the phone’s call log shows talk time, or you spoke to them). Counted as reached; this campaign will not call again.' },
  { value: 'not_reached', label: 'Not reached · close', hint: 'The call never connected. Closed without calling again.' },
  { value: 'retry', label: 'Not reached · call again', hint: 'The call never connected. The lead goes back in the queue; calling hours, do-not-call and limits still apply.' },
];

function coerce(v: string): unknown {
  const t = v.trim();
  if (t === '') return null;
  if (t === 'true' || t === 'yes') return true;
  if (t === 'false' || t === 'no') return false;
  if (!Number.isNaN(Number(t)) && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return v;
}
const display = (v: unknown): string => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
};

/**
 * Human review + correction for a single call's extracted answers. This closes
 * the "requires review" loop: an AI call that produced uncertain answers never
 * silently qualifies a lead — a person confirms or corrects the values here, and
 * the backend records the correction (source: human_review) and clears the flag.
 */
export function CallReviewDrawer({ callId, onClose }: { callId: string; onClose: () => void }) {
  const { data: call, isLoading, isError, refetch } = useCall(callId);
  return (
    <div className="fixed inset-0 z-60 flex justify-end bg-black/40" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-theme-lg" onMouseDown={(e) => e.stopPropagation()}>
        {isError && !call ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            This call could not be loaded.
            <button type="button" onClick={() => refetch()} className="font-semibold text-brand-500 hover:underline">Try again</button>
          </div>
        ) : isLoading || !call ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <ReviewForm callId={callId} call={call} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

/** Inner form: initializes its editable state from the loaded call on mount. */
function ReviewForm({ callId, call, onClose }: { callId: string; call: CallRecord; onClose: () => void }) {
  const review = useReviewCall();
  const [edits, setEdits] = useState<Record<string, Edit>>(() => {
    const map: Record<string, Edit> = {};
    for (const a of call.answers || []) {
      map[a.questionFieldKey] = { normalizedValue: display(a.normalizedValue), validation: a.validation };
    }
    return map;
  });
  const [qualification, setQualification] = useState<string>(call.qualification || '');

  function setEdit(key: string, patch: Partial<Edit>) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function save() {
    // Send only what the reviewer changed; the server re-validates each value
    // against its question, so untouched (possibly empty/invalid) answers stay as captured.
    const answers = (call.answers || []).flatMap((a) => {
      const edit = edits[a.questionFieldKey];
      if (!edit) return [];
      const valueChanged = (edit.normalizedValue ?? '') !== display(a.normalizedValue);
      const validationChanged = Boolean(edit.validation) && edit.validation !== a.validation;
      if (!valueChanged && !validationChanged) return [];
      const value = (edit.normalizedValue ?? '').trim();
      return [{
        questionFieldKey: a.questionFieldKey,
        ...(value ? { normalizedValue: coerce(value) } : {}),
        ...(edit.validation === 'unknown' ? { validation: 'unknown' } : {}),
      }];
    });
    try {
      await review.mutateAsync({ id: callId, answers, qualification: qualification || null });
      onClose();
    } catch {
      // useReviewCall already shows the server's message (e.g. an invalid value); keep the form open.
    }
  }

  return (
    <>
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="h-4 w-4 text-brand-500" />
                    <h2 className="truncate text-base font-bold">Review call answers</h2>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{typeof call.campaignId === 'object' ? call.campaignId?.name : 'Campaign'}</span>
                    <span>· attempt {call.attemptNumber}</span>
                    <span>· {Math.round(call.durationSeconds || 0)}s</span>
                    {call.disposition ? <StatusPill status={call.disposition} /> : null}
                    {call.reviewRequired ? <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle className="h-3 w-3" /> needs review</span> : null}
                  </div>
                </div>
                <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!call.answers?.length ? (
                <p className="p-4 text-center text-sm text-muted-foreground">This call captured no answers.</p>
              ) : (
                <div className="space-y-3">
                  {call.answers.map((a: CallAnswer) => (
                    <div key={a.questionFieldKey} className="rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{a.label || a.questionFieldKey}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.type}</span>
                      </div>
                      {a.rawAnswer ? <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{a.rawAnswer}&rdquo;</p> : null}
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                        <input
                          className="rounded-md border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-brand-500"
                          value={edits[a.questionFieldKey]?.normalizedValue ?? ''}
                          onChange={(e) => setEdit(a.questionFieldKey, { normalizedValue: e.target.value })}
                          placeholder="corrected value"
                        />
                        <select
                          className="rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                          value={edits[a.questionFieldKey]?.validation ?? a.validation}
                          onChange={(e) => setEdit(a.questionFieldKey, { validation: e.target.value })}
                        >
                          {VALIDATIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      {a.confirmed ? <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle2 className="h-3 w-3" /> confirmed by caller</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {call.state === 'needs_reconcile' && !call.reconciliation?.resolvedAt ? <ReconcilePanel call={call} callId={callId} onDone={onClose} /> : (
            <div className="border-t border-border px-5 py-3">
              <label className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground" title="Qualified / unqualified / do-not-contact / callback is applied to the lead (a status set by a person after the call is never overwritten)">Qualification</span>
                <select className="rounded-md border border-border bg-card px-2 py-1.5 text-sm" value={qualification} onChange={(e) => setQualification(e.target.value)}>
                  <option value="">(unchanged)</option>
                  {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <button type="button" onClick={save} disabled={review.isPending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
                <Save className="h-4 w-4" /> {review.isPending ? 'Saving…' : 'Save review & clear flag'}
              </button>
            </div>
            )}
    </>
  );
}

/**
 * A call whose outcome is unknown (the phone or gateway lost track of it). It is never redialed on
 * its own: the owner checks the phone's call log and records what happened here.
 */
function ReconcilePanel({ call, callId, onDone }: { call: CallRecord; callId: string; onDone: () => void }) {
  const reconcile = useReconcileCall();
  const [resolution, setResolution] = useState<ReconcileResolution | ''>('');
  const [qualification, setQualification] = useState('');
  const [note, setNote] = useState('');

  async function submit() {
    if (!resolution) return;
    try {
      await reconcile.mutateAsync({
        id: callId, resolution, note: note.trim(),
        ...(resolution === 'reached' ? { qualification: qualification || null } : {}),
      });
      onDone();
    } catch {
      // useReconcileCall shows the server's message (e.g. the phone still reports a call).
    }
  }

  return (
    <section aria-label="Resolve unknown outcome" className="max-h-[60%] overflow-y-auto border-t border-border px-5 py-3">
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-200">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong>Outcome unknown.</strong> {call.failureMessage || 'The call may or may not have reached the lead.'} It is never called
          again automatically. Check the phone&rsquo;s call log, then record what happened.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">What happened?</legend>
        {RESOLUTIONS.map((r) => (
          <label key={r.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${resolution === r.value ? 'border-brand-500 bg-brand-500/5' : 'border-border'}`}>
            <input
              type="radio" name="resolution" value={r.value} checked={resolution === r.value} onChange={() => setResolution(r.value)} className="mt-1"
              aria-label={r.label} aria-describedby={`reconcile-hint-${r.value}`}
            />
            <span>
              <span className="font-medium">{r.label}</span>
              <span id={`reconcile-hint-${r.value}`} className="mt-0.5 block text-xs text-muted-foreground">{r.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {resolution === 'reached' ? (
        <label className="mt-3 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Qualification (optional)</span>
          <select aria-label="Qualification" className="rounded-md border border-border bg-card px-2 py-1.5 text-sm" value={qualification} onChange={(e) => setQualification(e.target.value)}>
            <option value="">(review answers later)</option>
            {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      ) : null}
      <input
        aria-label="Note"
        className="mt-3 w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-brand-500"
        placeholder="Note (optional), e.g. call log shows 0:42"
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="button" onClick={submit} disabled={!resolution || reconcile.isPending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
        {reconcile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Resolve outcome
      </button>
    </section>
  );
}
