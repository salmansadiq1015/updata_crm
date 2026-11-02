'use client';

import { useState, type ReactElement, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, HelpCircle, Loader2, MessageSquareText, RefreshCw, ShieldOff,
} from 'lucide-react';
import { downloadBlob } from '@/lib/api/download';
import { showError, showSuccess } from '@/lib/toast';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { linkAssistantApi } from '../services/link-assistant-api';
import type { LinkAnalytics, LinkSession, LinkSessionDetail, LinkSessionStatus } from '../types/ai-calling-types';
import { CallReviewDrawer } from './call-review-drawer';

// ConfirmDialog is an untyped .jsx; loosen its prop types for this .tsx module.
const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

const PAGE_SIZE = 25;

/**
 * Main path of the funnel; each step's share is of its `base`. Delivery reports are partial
 * (many phones/carriers never send one), so opens are measured against SMS sent, not delivered.
 */
const FUNNEL: { key: string; label: string; base?: string; hint?: string }[] = [
  { key: 'link_issued', label: 'Links issued' },
  { key: 'sms_sent', label: 'SMS sent', base: 'link_issued', hint: 'Sent from the phone (SIM accepted it, or the user confirmed sending)' },
  { key: 'delivered', label: 'Delivered', base: 'sms_sent', hint: 'Only counted when a carrier delivery report confirms it; many carriers never send one' },
  { key: 'link_opened', label: 'Opened', base: 'sms_sent', hint: 'Share of SMS sent' },
  { key: 'chat_started', label: 'Chat started', base: 'link_opened' },
  { key: 'completed', label: 'Completed', base: 'chat_started' },
];
const SIDE_OUTCOMES: { key: string; label: string }[] = [
  { key: 'opted_out', label: 'Opted out' },
  { key: 'abandoned', label: 'Abandoned' },
  { key: 'expired', label: 'Expired' },
];

export const SESSION_STATUS: Record<LinkSessionStatus, { label: string; tone: string }> = {
  issued: { label: 'Not opened', tone: 'bg-muted text-muted-foreground' },
  opened: { label: 'Opened', tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  active: { label: 'In progress', tone: 'bg-brand-500/10 text-brand-700 dark:text-brand-300' },
  completed: { label: 'Completed', tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  abandoned: { label: 'Abandoned', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  opted_out: { label: 'Opted out', tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  expired: { label: 'Expired', tone: 'bg-muted text-muted-foreground' },
  revoked: { label: 'Revoked', tone: 'bg-muted text-muted-foreground' },
};
const CLOSED: LinkSessionStatus[] = ['completed', 'opted_out', 'expired', 'revoked', 'abandoned'];
const LANGUAGE_LABEL: Record<string, string> = { en: 'English', ur: 'Urdu', roman_ur: 'Roman Urdu' };

const nf = new Intl.NumberFormat();
const pctOf = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
function fmtWhen(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const fmtValue = (v: unknown) => (v === null || v === undefined ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));
const btn = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:cursor-not-allowed disabled:opacity-60';

export function SessionStatusPill({ status }: { status: LinkSessionStatus }) {
  const s = SESSION_STATUS[status] ?? { label: status, tone: 'bg-muted text-muted-foreground' };
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${s.tone}`}>{s.label}</span>;
}

/** SMS link assistant: funnel, per-question quality, conversations with transcripts. */
export function LinkAssistantPanel({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkSessionStatus | ''>('');
  const [page, setPage] = useState(1);
  const analytics = useQuery({
    queryKey: ['link-assistant', 'analytics', campaignId],
    queryFn: () => linkAssistantApi.analytics(campaignId),
    refetchInterval: 15_000,
  });
  const sessions = useQuery({
    queryKey: ['link-assistant', 'sessions', campaignId, status, page],
    queryFn: () => linkAssistantApi.sessions({ campaignId, status: status || undefined, page, limit: PAGE_SIZE }),
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });
  const preview = useMutation({
    mutationFn: () => linkAssistantApi.preview(campaignId),
    onSuccess: ({ url }) => {
      window.open(url, '_blank', 'noopener,noreferrer');
      void qc.invalidateQueries({ queryKey: ['link-assistant', 'sessions', campaignId] });
    },
    onError: () => showError('Could not open the preview. Check that the campaign has at least one question.'),
  });
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      downloadBlob(await linkAssistantApi.exportCsv(campaignId), `sms-link-campaign-${campaignId}.csv`, 'text/csv;charset=utf-8');
    } catch {
      showError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  const rows = sessions.data?.data ?? [];
  const pagination = sessions.data?.pagination;
  const refreshing = analytics.isFetching || sessions.isFetching;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => preview.mutate()} disabled={preview.isPending} className={`${btn} bg-brand-600 font-semibold text-white hover:bg-brand-700`}>
          {preview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Preview as customer
        </button>
        <button type="button" onClick={exportCsv} disabled={exporting} className={`${btn} border border-border hover:bg-muted`}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
        </button>
        <button
          type="button"
          onClick={() => { void analytics.refetch(); void sessions.refetch(); }}
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Refresh"
          title="Refresh (updates automatically)"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        </button>
      </div>

      <AnalyticsSection query={analytics} />

      <section aria-labelledby="link-conversations" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="link-conversations" className="text-sm font-semibold">Conversations</h3>
          {pagination ? <span className="text-xs text-muted-foreground tabular-nums">{nf.format(pagination.total)}</span> : null}
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Status
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as LinkSessionStatus | ''); setPage(1); }}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All</option>
              {(Object.keys(SESSION_STATUS) as LinkSessionStatus[]).map((s) => <option key={s} value={s}>{SESSION_STATUS[s].label}</option>)}
            </select>
          </label>
        </div>

        {sessions.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading conversations">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : sessions.isError ? (
          <InlineError message="Conversations could not be loaded." onRetry={() => void sessions.refetch()} />
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <MessageSquareText className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">{status ? `No ${SESSION_STATUS[status].label.toLowerCase()} conversations` : 'No links sent yet'}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {status
                ? 'Try another status filter.'
                : 'Start the campaign, then send links from the mobile app: Call Agent → “Text leads from your phone” → choose this campaign.'}
            </p>
          </div>
        ) : (
          <ul className={`divide-y divide-border overflow-hidden rounded-xl border border-border ${sessions.isPlaceholderData ? 'opacity-60' : ''}`}>
            {rows.map((s: LinkSession) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpenSession(s.id)}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 text-start text-sm hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:grid-cols-[1fr_auto_7rem]"
                >
                  <span className="min-w-0 truncate font-medium">
                    {s.leadName || 'Unnamed lead'}
                    {s.isTest ? <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-px text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">Preview</span> : null}
                    {s.voice?.calls ? <span className="ml-1.5 rounded bg-brand-500/10 px-1 py-px text-[10px] font-semibold uppercase text-brand-600 dark:text-brand-300">{s.voice.live ? 'On call' : 'Voice'}</span> : null}
                  </span>
                  <SessionStatusPill status={s.status} />
                  <span className="col-span-2 text-xs text-muted-foreground sm:col-span-1 sm:text-end">
                    <span className="sm:hidden">{LANGUAGE_LABEL[s.language] ?? s.language} · {s.turns} msgs · </span>
                    {fmtWhen(s.lastActivityAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {pagination && pagination.pages > 1 ? (
          <nav className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground" aria-label="Conversation pages">
            <span className="tabular-nums">Page {pagination.page} of {pagination.pages}</span>
            <div className="flex gap-1">
              <button type="button" className={`${btn} border border-border px-2 hover:bg-muted`} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" className={`${btn} border border-border px-2 hover:bg-muted`} disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </nav>
        ) : null}
      </section>

      <SessionSheet sessionId={openSession} onClose={() => setOpenSession(null)} />
    </div>
  );
}

function AnalyticsSection({ query }: { query: { data?: LinkAnalytics; isLoading: boolean; isError: boolean; refetch: () => unknown } }) {
  const a = query.data;
  if (query.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading results">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      </div>
    );
  }
  if (query.isError || !a) return <InlineError message="Results could not be loaded." onRetry={() => void query.refetch()} />;
  const top = a.funnel.link_issued || 0;
  return (
    <div className="space-y-4">
      <section aria-labelledby="link-funnel" className="rounded-xl border border-border bg-background p-3 sm:p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 id="link-funnel" className="text-sm font-semibold">Funnel</h3>
          <span className="text-xs text-muted-foreground">Real leads only · previews excluded</span>
        </div>
        {top === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No links issued yet. Numbers appear after the first SMS is sent.</p>
        ) : (
          <ol className="space-y-2">
            {FUNNEL.map((step) => {
              const value = a.funnel[step.key] ?? 0;
              const prev = step.base ? a.funnel[step.base] ?? 0 : null;
              const width = Math.max(top ? (value / top) * 100 : 0, value ? 2 : 0);
              return (
                <li key={step.key} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[8rem_1fr_6rem]">
                  <span className="flex items-center gap-1 text-muted-foreground" title={step.hint}>
                    {step.label}
                    {step.hint ? <HelpCircle className="h-3 w-3 shrink-0 opacity-60" aria-label={step.hint} /> : null}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span className="block h-full rounded-full bg-brand-500" style={{ width: `${width}%` }} />
                  </span>
                  <span className="text-end tabular-nums">
                    <b className="font-semibold">{nf.format(value)}</b>
                    {prev !== null ? <span className="ml-1.5 text-xs text-muted-foreground">{fmtPct(pctOf(value, prev))}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {SIDE_OUTCOMES.map((o) => <span key={o.key}>{o.label} <b className="font-semibold tabular-nums text-foreground">{nf.format(a.funnel[o.key] ?? 0)}</b></span>)}
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Kpi label="Open rate" value={`${a.rates.openRate}%`} hint="Opened ÷ SMS sent" />
        <Kpi label="Completion rate" value={`${a.rates.completionRate}%`} hint="Completed ÷ chat started" />
        <Kpi label="Opt-out rate" value={`${a.rates.optOutRate}%`} hint="Opted out ÷ opened" />
        <Kpi label="Avg. time to complete" value={a.averageCompletionSeconds != null ? `${Math.round((a.averageCompletionSeconds / 60) * 10) / 10} min` : '—'} />
        <Kpi label="AI cost (total)" value={`$${a.cost.total.toFixed(4)}`} />
        <Kpi label="AI cost / completed" value={a.cost.perCompleted != null ? `$${a.cost.perCompleted.toFixed(4)}` : '—'} />
      </dl>

      <section aria-labelledby="link-questions">
        <h3 id="link-questions" className="mb-2 text-sm font-semibold">Answers by question</h3>
        {a.perQuestion.length === 0 ? (
          <p className="text-sm text-muted-foreground">This campaign has no questions.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-104 text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">Question</th>
                  <th scope="col" className="px-2 py-2 text-end font-medium">Answered</th>
                  <th scope="col" className="px-2 py-2 text-end font-medium">Unknown</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium" title="Started chats that stopped at this question">Stopped here</th>
                </tr>
              </thead>
              <tbody>
                {a.perQuestion.map((q) => (
                  <tr key={q.fieldKey} className="border-t border-border/60">
                    <th scope="row" className="max-w-56 truncate px-3 py-2 text-start font-normal">{q.label}</th>
                    <td className="px-2 py-2 text-end tabular-nums">{nf.format(q.answered)}</td>
                    <td className="px-2 py-2 text-end tabular-nums">
                      {nf.format(q.unknown)} <span className={`text-xs ${q.unknownRate >= 30 ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>({q.unknownRate}%)</span>
                    </td>
                    <td className={`px-3 py-2 text-end tabular-nums ${q.dropOff ? 'font-semibold text-amber-700 dark:text-amber-400' : ''}`}>{nf.format(q.dropOff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5" title={hint}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onRetry} className={`${btn} border border-current/30 hover:bg-rose-500/10`}>Try again</button>
    </div>
  );
}

const TIMELINE: { key: string; label: string }[] = [
  { key: 'link_issued', label: 'Link issued' },
  { key: 'sms_sent', label: 'SMS sent' },
  { key: 'delivered', label: 'Delivered (carrier)' },
  { key: 'link_opened', label: 'Opened' },
  { key: 'chat_started', label: 'Chat started' },
  { key: 'completed', label: 'Completed' },
  { key: 'opted_out', label: 'Opted out' },
  { key: 'abandoned', label: 'Abandoned' },
  { key: 'expired', label: 'Expired' },
];

function SessionSheet({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [review, setReview] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['link-assistant', 'session', sessionId],
    queryFn: () => linkAssistantApi.session(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: 5_000,
  });
  const revoke = useMutation({
    mutationFn: () => linkAssistantApi.revoke(sessionId!),
    onSuccess: () => {
      setConfirmRevoke(false);
      showSuccess('Link revoked. The lead can no longer open it.');
      void qc.invalidateQueries({ queryKey: ['link-assistant'] });
    },
    onError: () => showError('Could not revoke the link. Please try again.'),
  });
  const closed = data ? CLOSED.includes(data.status) : true;

  return (
    <Sheet open={Boolean(sessionId)} onOpenChange={(open: boolean) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border pe-12">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
            {data?.leadName || 'Conversation'}
            {data ? <SessionStatusPill status={data.status} /> : null}
            {data?.isTest ? <span className="rounded bg-amber-500/15 px-1 py-px text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">Preview</span> : null}
          </SheetTitle>
          <SheetDescription className="">
            {data ? `${data.campaignName ? `${data.campaignName} · ` : ''}${LANGUAGE_LABEL[data.language] ?? data.language} · ${data.turns} messages${data.voice?.calls ? ` · ${data.voice.calls} voice call${data.voice.calls === 1 ? '' : 's'} (${Math.round(data.voice.seconds / 60)} min, $${data.voice.cost.toFixed(2)})` : ''}${data.voice?.live ? ' · on a call now' : ''} · link valid until ${fmtWhen(data.expiresAt)}` : 'Loading…'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : isError || !data ? (
            <InlineError message="This conversation could not be loaded." onRetry={() => void refetch()} />
          ) : (
            <SessionBody data={data} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          {data?.reviewRequired ? (
            <button type="button" onClick={() => setReview(true)} className={`${btn} bg-brand-600 font-semibold text-white hover:bg-brand-700`}>Review answers</button>
          ) : null}
          {data && !closed ? (
            <button type="button" onClick={() => setConfirmRevoke(true)} className={`${btn} ms-auto border border-border text-rose-600 hover:bg-rose-500/10`}>
              <ShieldOff className="h-4 w-4" /> Revoke link
            </button>
          ) : null}
        </div>
        <ConfirmDialog
          open={confirmRevoke}
          onOpenChange={setConfirmRevoke}
          title="Revoke this link?"
          description="The lead will no longer be able to open the chat. Answers given so far are kept and processed. This cannot be undone."
          confirmText="Revoke link"
          cancelText="Keep link"
          isLoading={revoke.isPending}
          onConfirm={() => revoke.mutate()}
        />
        {review && data ? <CallReviewDrawer callId={data.callRecordId} onClose={() => setReview(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SessionBody({ data }: { data: LinkSessionDetail }) {
  const reached = TIMELINE.filter((s) => data.funnel?.[s.key]);
  return (
    <>
      {data.reviewRequired ? (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Some answers need a human check before they are used.
        </p>
      ) : null}

      <Section title="Answers">
        <dl className="divide-y divide-border/60 rounded-lg border border-border">
          {data.answers.map((ans) => (
            <div key={ans.fieldKey} className="grid grid-cols-1 gap-0.5 px-3 py-2 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-3">
              <dt className="text-muted-foreground">{ans.label}</dt>
              <dd className="flex flex-wrap items-center gap-1.5 font-medium sm:justify-end sm:text-end" dir="auto">
                {ans.unknown ? <em className="font-normal text-muted-foreground">Lead doesn&apos;t know</em>
                  : ans.value === null || ans.value === undefined ? <span className="font-normal text-muted-foreground">Not answered</span>
                    : <span className="wrap-break-word">{fmtValue(ans.value)}</span>}
                {ans.confirmed ? <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> confirmed</span> : null}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {data.qualification ? `Outcome: ${data.disposition ?? '—'} · ${data.qualification}` : 'The outcome is set when the conversation ends.'}
        </p>
      </Section>

      {data.openQuestions.length ? (
        <Section title="Questions for the team">
          <ul className="space-y-1.5">
            {data.openQuestions.map((q) => <li key={q.at} dir="auto" className="rounded-lg bg-muted/60 px-3 py-2 text-sm">{q.text}</li>)}
          </ul>
        </Section>
      ) : null}

      <Section title="Link activity">
        {reached.length ? (
          <ol className="space-y-1 text-sm">
            {reached.map((s) => (
              <li key={s.key} className="flex justify-between gap-3">
                <span>{s.label}</span><span className="tabular-nums text-muted-foreground">{fmtWhen(data.funnel[s.key])}</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted-foreground">No activity yet.</p>}
      </Section>

      <Section title="Transcript">
        {data.transcript.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet (or removed after the retention period).</p> : (
          <ol className="space-y-2">
            {data.transcript.map((t, i) => {
              const mine = t.role === 'customer';
              return (
                <li key={i} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div dir="auto" className={`max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-2xl px-3 py-2 text-sm ${mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-muted'}`}>{t.text}</div>
                  <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                    {mine ? 'Lead' : t.role === 'system' ? 'System' : t.source === 'model' ? 'AI-written' : 'Assistant'}
                    {t.at && !Number.isNaN(new Date(t.at).getTime()) ? ` · ${fmtWhen(t.at)}` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

