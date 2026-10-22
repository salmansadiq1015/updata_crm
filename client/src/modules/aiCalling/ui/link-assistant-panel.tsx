'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, MessageSquareText, RefreshCw, ShieldOff, X } from 'lucide-react';
import { downloadBlob } from '@/lib/api/download';
import { showError, showSuccess } from '@/lib/toast';
import { linkAssistantApi } from '../services/link-assistant-api';
import type { LinkSession, LinkSessionStatus } from '../types/ai-calling-types';
import { CallReviewDrawer } from './call-review-drawer';

const FUNNEL: { key: string; label: string }[] = [
  { key: 'link_issued', label: 'Links' },
  { key: 'sms_sent', label: 'SMS sent' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'link_opened', label: 'Opened' },
  { key: 'chat_started', label: 'Started' },
  { key: 'completed', label: 'Completed' },
  { key: 'opted_out', label: 'Opted out' },
];

const STATUS_STYLE: Record<LinkSessionStatus, string> = {
  issued: 'bg-muted text-muted-foreground',
  opened: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  active: 'bg-brand-500/10 text-brand-600',
  completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  abandoned: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  opted_out: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  expired: 'bg-muted text-muted-foreground',
  revoked: 'bg-muted text-muted-foreground',
};

const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
const fmtValue = (v: unknown) => (v === null || v === undefined ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));

/** SMS link assistant: funnel, per-question quality, live sessions with transcripts. */
export function LinkAssistantPanel({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const [openSession, setOpenSession] = useState<string | null>(null);
  const analytics = useQuery({
    queryKey: ['link-assistant', 'analytics', campaignId],
    queryFn: () => linkAssistantApi.analytics(campaignId),
    refetchInterval: 15_000,
  });
  const sessions = useQuery({
    queryKey: ['link-assistant', 'sessions', campaignId],
    queryFn: () => linkAssistantApi.sessions({ campaignId, limit: 50 }),
    refetchInterval: 10_000,
  });
  const preview = useMutation({
    mutationFn: () => linkAssistantApi.preview(campaignId),
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      void qc.invalidateQueries({ queryKey: ['link-assistant', 'sessions', campaignId] });
    },
    onError: () => showError('Could not open the preview'),
  });

  async function exportCsv() {
    try {
      downloadBlob(await linkAssistantApi.exportCsv(campaignId), `sms-link-campaign-${campaignId}.csv`, 'text/csv;charset=utf-8');
    } catch {
      showError('Export failed');
    }
  }

  const a = analytics.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => preview.mutate()} disabled={preview.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
          <ExternalLink className="h-4 w-4" /> Preview as customer
        </button>
        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
          <Download className="h-4 w-4" /> Export CSV
        </button>
        <button type="button" onClick={() => { void analytics.refetch(); void sessions.refetch(); }} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {a ? (
        <>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {FUNNEL.map((f) => (
              <div key={f.key} className="rounded-lg border border-border bg-background px-2 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</p>
                <p className="text-lg font-bold tabular-nums">{a.funnel[f.key] ?? 0}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Rate label="Open rate" value={`${a.rates.openRate}%`} />
            <Rate label="Completion rate" value={`${a.rates.completionRate}%`} />
            <Rate label="Avg. time to complete" value={a.averageCompletionSeconds != null ? `${Math.round(a.averageCompletionSeconds / 60 * 10) / 10} min` : '—'} />
            <Rate label="AI cost / completed" value={a.cost.perCompleted != null ? `$${a.cost.perCompleted.toFixed(4)}` : '—'} />
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">Question</th><th className="px-2 text-right">Answered</th><th className="px-2 text-right">Unknown</th><th className="px-2 text-right">Unknown %</th><th className="px-3 text-right">Drop-off</th></tr>
              </thead>
              <tbody>
                {a.perQuestion.map((q) => (
                  <tr key={q.fieldKey} className="border-t border-border/60">
                    <td className="px-3 py-1.5">{q.label}</td>
                    <td className="px-2 text-right tabular-nums">{q.answered}</td>
                    <td className="px-2 text-right tabular-nums">{q.unknown}</td>
                    <td className="px-2 text-right tabular-nums">{q.unknownRate}%</td>
                    <td className={`px-3 text-right tabular-nums ${q.dropOff ? 'font-semibold text-amber-600' : ''}`}>{q.dropOff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : analytics.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Conversations</h3>
        {(sessions.data?.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No links sent yet. Send them from the mobile app: Call Agent → “Text leads from your phone” → choose this campaign.
          </p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {(sessions.data?.data ?? []).map((s: LinkSession) => (
              <button key={s.id} type="button" onClick={() => setOpenSession(s.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50">
                <MessageSquareText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{s.leadName || 'Lead'}{s.isTest ? ' · preview' : ''}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[s.status]}`}>{s.status.replace('_', ' ')}</span>
                <span className="hidden w-36 text-right text-xs text-muted-foreground sm:inline">{fmtTime(s.lastActivityAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {openSession ? <SessionDialog sessionId={openSession} onClose={() => setOpenSession(null)} /> : null}
    </div>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function SessionDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [review, setReview] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['link-assistant', 'session', sessionId],
    queryFn: () => linkAssistantApi.session(sessionId),
    refetchInterval: 5_000,
  });
  const revoke = useMutation({
    mutationFn: () => linkAssistantApi.revoke(sessionId),
    onSuccess: () => {
      showSuccess('Link revoked');
      void qc.invalidateQueries({ queryKey: ['link-assistant'] });
    },
    onError: () => showError('Could not revoke the link'),
  });
  const closed = data ? ['completed', 'opted_out', 'expired', 'revoked', 'abandoned'].includes(data.status) : true;

  return (
    <div className="fixed inset-0 z-60 flex justify-end bg-black/40" onMouseDown={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-theme-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">{data?.leadName || 'Conversation'}</h3>
            <p className="text-xs text-muted-foreground">{data ? `${data.status.replace('_', ' ')} · ${data.language} · ${data.turns} turns` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {isLoading || !data ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Answers</h4>
              <div className="divide-y divide-border/60 rounded-lg border border-border">
                {data.answers.map((ans) => (
                  <div key={ans.fieldKey} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                    <span className="text-muted-foreground">{ans.label}</span>
                    <span className="text-right font-medium">
                      {ans.unknown ? <em className="text-muted-foreground">unknown</em> : fmtValue(ans.value)}
                      {ans.confirmed ? <span className="ml-1 text-[10px] text-emerald-600">confirmed</span> : null}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {data.qualification ? `Outcome: ${data.disposition} · ${data.qualification}` : 'Outcome is set when the conversation ends.'}
                {data.reviewRequired ? ' · needs human review' : ''}
              </p>
            </section>
            {data.openQuestions.length ? (
              <section>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Questions for the team</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm">{data.openQuestions.map((q) => <li key={q.at}>{q.text}</li>)}</ul>
              </section>
            ) : null}
            <section>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcript</h4>
              <div className="space-y-1.5">
                {data.transcript.length === 0 ? <p className="text-sm text-muted-foreground">No messages (or removed after the retention period).</p> : null}
                {data.transcript.map((t, i) => (
                  <div key={i} dir="auto" className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-1.5 text-sm ${t.role === 'customer' ? 'ml-auto bg-brand-500 text-white' : 'bg-muted'}`}>
                    {t.text}
                    {t.source === 'model' ? <span className="ml-1 text-[9px] opacity-60">AI</span> : null}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          {data?.reviewRequired ? (
            <button type="button" onClick={() => setReview(true)} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600">Review answers</button>
          ) : null}
          {!closed ? (
            <button type="button" onClick={() => revoke.mutate()} disabled={revoke.isPending} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-500/10 disabled:opacity-60">
              <ShieldOff className="h-4 w-4" /> Revoke link
            </button>
          ) : null}
        </div>
      </div>
      {review && data ? <CallReviewDrawer callId={data.callRecordId} onClose={() => setReview(false)} /> : null}
    </div>
  );
}
