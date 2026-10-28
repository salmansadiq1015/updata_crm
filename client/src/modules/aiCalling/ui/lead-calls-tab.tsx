'use client';

import { useState } from 'react';
import { PhoneCall, Loader2, Clock, CheckCircle2, AlertTriangle, ShieldCheck, PhoneOff, ArrowRight } from 'lucide-react';
import { useCallConsent, useLeadCallHistory } from '../hooks/use-ai-calling';
import type { CallRecord, LeadTransition } from '../types/ai-calling-types';

const CONSENT_LABEL: Record<string, string> = {
  granted: 'granted', expired: 'expired', revoked: 'revoked / denied', missing: 'not recorded',
};
import { StatusPill } from './status-pill';
import { CallReviewDrawer } from './call-review-drawer';
import { CallNotes } from './call-notes';

/**
 * AI call history for one lead. Drop into the lead detail drawer as an
 * "AI Calls" tab: <LeadCallsTab leadId={lead._id} />.
 */
export function LeadCallsTab({ leadId, view = 'calls' }: { leadId: string; view?: 'calls' | 'responses' | 'consent' }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useLeadCallHistory(view === 'consent' ? null : leadId, page);
  const consent = useCallConsent(view === 'consent' ? leadId : null);
  const [reviewCallId, setReviewCallId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState('');
  const [confirmDnc, setConfirmDnc] = useState(false);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const calls = (data?.data ?? []).filter(call => view !== 'responses' || call.answers?.some(a => a.rawAnswer || a.normalizedValue != null));
  const transitions: LeadTransition[] = data?.transitions ?? [];
  const consentStatus = consent.data?.status ?? (consent.data?.consent ? consent.data.consent.status : 'missing');
  const consentBusy = consent.update.isPending || consent.suppress.isPending;

  return (
    <div className="min-w-0 space-y-3">
      {view === 'consent' && <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold">AI calling consent</p>
              <p className="text-xs text-muted-foreground">A public phone number is not permission to call. Consent is shared company-wide and re-checked immediately before every dial.</p>
            </div>
          </div>
          <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize">
            {consent.isError ? 'unknown' : CONSENT_LABEL[consentStatus] ?? consentStatus}
          </span>
        </div>
        {consent.isError ? (
          <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700">
            Consent status could not be loaded. <button type="button" onClick={() => consent.refetch()} className="font-semibold underline">Try again</button>
          </p>
        ) : consent.data && !consent.data.destinationAvailable ? (
          <p className="mt-3 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-700">Add a valid lead phone number before recording consent.</p>
        ) : null}
        <textarea aria-label="Consent evidence" className="mt-3 min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Describe when, where, and how consent was obtained (or refused)…" />
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium text-rose-600 disabled:opacity-50" disabled={consentBusy || !consent.data?.destinationAvailable} onClick={() => setConfirmDnc(true)}>
            <PhoneOff className="h-3.5 w-3.5" /> Do not call
          </button>
          {consentStatus === 'missing' ? (
            <button type="button" className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50" disabled={consentBusy || !consent.data?.destinationAvailable} onClick={() => consent.update.mutate({ status: 'denied', evidence: evidence.trim() })}>Record refusal</button>
          ) : (
            <button type="button" className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50" disabled={consentBusy || consentStatus === 'revoked'} onClick={() => consent.update.mutate({ status: 'revoked', evidence: evidence.trim() })}>Revoke</button>
          )}
          <button type="button" className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={consentBusy || !consent.data?.destinationAvailable || evidence.trim().length < 10} onClick={() => consent.update.mutate({ status: 'granted', evidence: evidence.trim(), confirmation: true })}>Record verified consent</button>
        </div>
        {confirmDnc ? (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
            <p className="text-rose-700">Add this lead&apos;s number to the do-not-call list? It will never be dialled by any AI campaign again (pending calls are suppressed).</p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className="rounded border px-2 py-1 font-medium" onClick={() => setConfirmDnc(false)}>Keep</button>
              <button
                type="button"
                className="rounded bg-rose-600 px-2 py-1 font-semibold text-white disabled:opacity-50"
                disabled={consent.suppress.isPending}
                onClick={() => consent.suppress.mutate({ note: evidence.trim() || undefined }, { onSettled: () => setConfirmDnc(false) })}
              >
                {consent.suppress.isPending ? 'Saving…' : 'Add to do-not-call'}
              </button>
            </div>
          </div>
        ) : null}
      </div>}

      {isError && !data ? (
        <p className="p-4 text-center text-sm text-muted-foreground">
          AI call history could not be loaded. <button type="button" onClick={() => refetch()} className="font-semibold text-brand-500 hover:underline">Try again</button>
        </p>
      ) : null}
      {view !== 'consent' && !calls.length && !isError && <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"><PhoneCall className="h-8 w-8 opacity-40" /><p>{view === 'responses' ? 'No lead responses captured on this page of calls.' : 'No AI calls for this lead yet.'}</p></div>}
      {view === 'calls' && transitions.length ? (
        <div className="rounded-lg border border-border bg-background p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status history</p>
          <ul className="space-y-1 text-xs">
            {transitions.slice(0, 5).map((t) => (
              <li key={t._id} className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="font-medium text-foreground">{t.previousStatus} → {t.newStatus}</span>
                <span>· {t.actorType === 'user' ? 'human review' : t.reason}</span>
                <span className="ml-auto">{new Date(t.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {calls.map((call: CallRecord) => (
        <button
          type="button"
          key={call._id}
          onClick={() => setReviewCallId(call._id)}
          className="group block w-full min-w-0 rounded-xl border border-border bg-card p-4 text-start transition hover:border-brand-500/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
              <PhoneCall className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1 pt-1 text-sm font-medium leading-5 [overflow-wrap:anywhere]">
              {typeof call.campaignId === 'object' ? call.campaignId?.name || 'Call' : 'Call'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {call.disposition ? <StatusPill status={call.disposition} /> : <StatusPill status={call.state} />}
            {call.qualification && call.qualification !== 'none' ? <StatusPill status={call.qualification} /> : null}
            <span className="ms-auto shrink-0 whitespace-nowrap rounded-md bg-muted/60 px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground">Attempt {call.attemptNumber}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
            {call.createdAt && <span className="inline-flex items-center gap-1.5"><Clock className="size-3 shrink-0" aria-hidden="true" /><span>{new Date(call.createdAt).toLocaleString()}</span></span>}
            <span className="whitespace-nowrap tabular-nums">{Math.round((call.durationSeconds || 0))}s duration</span>
            {call.reviewRequired ? <span className="inline-flex items-center gap-1 whitespace-nowrap text-rose-600"><AlertTriangle className="size-3 shrink-0" aria-hidden="true" /> Needs review</span> : null}
          </div>

          {view === 'calls' && <CallNotes call={call} />}
          {view === 'responses' && call.answers?.length ? (
            <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
              {call.answers.map((a) => (
                <div key={a.questionFieldKey} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start gap-3 py-1 text-xs leading-5">
                  <span className="min-w-0 break-words text-muted-foreground">{a.label}</span>
                  <span className="flex min-w-0 items-start justify-end gap-1.5 text-end font-medium">
                    {a.validation === 'valid' ? <CheckCircle2 className="mt-1 size-3 shrink-0 text-emerald-500" /> : null}
                    <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{a.rawAnswer || formatValue(a.normalizedValue) || <em className="text-muted-foreground">{a.validation}</em>}{a.validation !== 'valid' && (a.rawAnswer || a.normalizedValue != null) ? ` (${a.validation})` : ''}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <span className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs font-medium text-brand-500">
            Review call &amp; answers
            <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden="true" />
          </span>
        </button>
      ))}

      {view !== 'consent' && (data?.pagination?.pages ?? 0) > 1 && <div className="flex items-center justify-between text-xs"><button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous calls</button><span>Page {page} of {data?.pagination?.pages}</span><button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={page >= (data?.pagination?.pages ?? 1)} onClick={() => setPage(p => p + 1)}>Next calls</button></div>}

      {reviewCallId ? <CallReviewDrawer callId={reviewCallId} onClose={() => setReviewCallId(null)} /> : null}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}
