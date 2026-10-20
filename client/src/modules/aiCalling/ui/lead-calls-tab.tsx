'use client';

import { useState } from 'react';
import { PhoneCall, Loader2, Clock, CheckCircle2, AlertTriangle, ShieldCheck, PhoneOff } from 'lucide-react';
import { useCallConsent, useLeadCallHistory } from '../hooks/use-ai-calling';
import type { CallRecord, LeadTransition } from '../types/ai-calling-types';

const CONSENT_LABEL: Record<string, string> = {
  granted: 'granted', expired: 'expired', revoked: 'revoked / denied', missing: 'not recorded',
};
import { StatusPill } from './status-pill';
import { CallReviewDrawer } from './call-review-drawer';

/**
 * AI call history for one lead. Drop into the lead detail drawer as an
 * "AI Calls" tab: <LeadCallsTab leadId={lead._id} />.
 */
export function LeadCallsTab({ leadId }: { leadId: string }) {
  const { data, isLoading, isError, refetch } = useLeadCallHistory(leadId);
  const consent = useCallConsent(leadId);
  const [reviewCallId, setReviewCallId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState('');
  const [confirmDnc, setConfirmDnc] = useState(false);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const calls = data?.data ?? [];
  const transitions: LeadTransition[] = data?.transitions ?? [];
  const consentStatus = consent.data?.status ?? (consent.data?.consent ? consent.data.consent.status : 'missing');
  const consentBusy = consent.update.isPending || consent.suppress.isPending;

  return (
    <div className="space-y-3 p-1">
      <div className="rounded-xl border border-border bg-card p-4">
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
      </div>

      {isError && !data ? (
        <p className="p-4 text-center text-sm text-muted-foreground">
          AI call history could not be loaded. <button type="button" onClick={() => refetch()} className="font-semibold text-brand-500 hover:underline">Try again</button>
        </p>
      ) : null}
      {!calls.length && !isError && <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground"><PhoneCall className="h-8 w-8 opacity-40" /><p>No AI calls for this lead yet.</p></div>}
      {transitions.length ? (
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
          className="block w-full rounded-lg border border-border bg-card p-3 text-left transition hover:border-brand-500/50 hover:bg-muted/40"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <PhoneCall className="h-4 w-4 text-brand-500" />
              {typeof call.campaignId === 'object' ? call.campaignId?.name : 'Call'}
              <span className="text-xs text-muted-foreground">attempt {call.attemptNumber}</span>
            </div>
            <div className="flex items-center gap-2">
              {call.qualification ? <StatusPill status={call.qualification} /> : null}
              {call.disposition ? <StatusPill status={call.disposition} /> : null}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{call.createdAt ? new Date(call.createdAt).toLocaleString() : ''}</span>
            <span>· {Math.round((call.durationSeconds || 0))}s</span>
            {call.reviewRequired ? <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle className="h-3 w-3" /> needs review</span> : null}
          </div>

          {call.answers?.length ? (
            <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
              {call.answers.map((a) => (
                <div key={a.questionFieldKey} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{a.label}</span>
                  <span className="flex items-center gap-1.5 text-right font-medium">
                    {a.validation === 'valid' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : null}
                    {formatValue(a.normalizedValue) || <em className="text-muted-foreground">{a.validation}</em>}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-brand-500">Click to review / correct answers →</p>
        </button>
      ))}

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
