'use client';

import { useDeferredValue, useState } from 'react';
import {
  AlertTriangle, ChevronLeft, ChevronRight, Clock3, Filter, Loader2, PhoneCall,
  Search, ShieldAlert,
} from 'lucide-react';
import { useCalls } from '../hooks/use-ai-calling';
import type { CallRecord } from '../types/ai-calling-types';
import { CallReviewDrawer } from './call-review-drawer';
import { StatusPill } from './status-pill';

const OUTCOMES = [
  'answered_completed', 'answered_partial', 'callback_requested', 'declined',
  'do_not_contact', 'no_answer', 'busy', 'voicemail', 'failed', 'needs_review', 'interrupted', 'cancelled',
];

const STATES = [
  'queued', 'initiating', 'ringing', 'in_progress', 'processing_results', 'completed',
  'no_answer', 'busy', 'voicemail', 'failed', 'cancelled', 'needs_reconcile',
];

function entityName(value: CallRecord['leadId'] | CallRecord['campaignId'], fallback: string): string {
  if (!value || typeof value === 'string') return fallback;
  return value.name || fallback;
}

function leadNumber(value: CallRecord['leadId']): string {
  if (!value || typeof value === 'string') return '';
  return value.leadNumber || '';
}

function when(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function duration(seconds = 0): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** Searchable, owner-scoped history backed by GET /ai-calling/calls. */
export function CallHistoryPanel() {
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [outcome, setOutcome] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const query = useCalls({
    page,
    limit: 10,
    ...(deferredSearch ? { search: deferredSearch } : {}),
    ...(state ? { state } : {}),
    ...(outcome ? { disposition: outcome } : {}),
    ...(reviewOnly ? { reviewRequired: true } : {}),
  });
  const rows = query.data?.data ?? [];
  const pagination = query.data?.pagination;

  function resetPage() { setPage(1); }

  return (
    <section aria-labelledby="call-history-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_42px_rgba(2,6,23,.18)]">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-400/10 text-primary"><PhoneCall className="h-4 w-4" /></span>
            <div>
              <h2 id="call-history-title" className="text-sm font-semibold text-foreground">Call history</h2>
              <p className="text-[11px] text-muted-foreground">Production call attempts only · open a row for answers and diagnostics</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[190px] flex-1 lg:flex-none">
            <span className="sr-only">Search call history</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); resetPage(); }}
              placeholder="Lead, campaign or call ID"
              className="h-9 w-full rounded-lg border border-border bg-card ps-9 pe-3 text-xs text-foreground outline-none placeholder:text-slate-600 focus:border-blue-400/45 focus:ring-2 focus:ring-blue-400/10 lg:w-64"
            />
          </label>
          <FilterSelect label="State" value={state} values={STATES} onChange={(value) => { setState(value); resetPage(); }} />
          <FilterSelect label="Outcome" value={outcome} values={OUTCOMES} onChange={(value) => { setOutcome(value); resetPage(); }} />
          <button
            type="button"
            aria-pressed={reviewOnly}
            onClick={() => { setReviewOnly((value) => !value); resetPage(); }}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${reviewOnly ? 'border-rose-400/35 bg-rose-400/10 text-rose-200' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Review only
          </button>
        </div>
      </header>

      {query.isLoading && !query.data ? (
        <div className="grid gap-2 p-4" role="status" aria-label="Loading call history">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-white/4" />)}
        </div>
      ) : query.isError && !query.data ? (
        <div className="flex flex-col items-center gap-2 p-10 text-center text-xs text-muted-foreground">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          Call history could not be loaded.
          <button type="button" onClick={() => query.refetch()} className="font-semibold text-primary hover:text-blue-200">Try again</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <Clock3 className="h-6 w-6 text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">No matching calls</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            {search || state || outcome || reviewOnly ? 'Change or clear the filters to see other attempts.' : 'Production calls will appear here after a campaign begins dialling.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-start text-xs">
            <thead>
              <tr className="border-b border-border bg-white/[.018] text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground">
                <th className="px-4 py-2.5">Lead</th>
                <th className="px-4 py-2.5">Campaign</th>
                <th className="px-4 py-2.5">Started</th>
                <th className="px-4 py-2.5">State</th>
                <th className="px-4 py-2.5">Outcome</th>
                <th className="px-4 py-2.5 text-end">Duration</th>
                <th className="px-4 py-2.5">Attention</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((call) => (
                <tr
                  key={call._id}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open call details for ${entityName(call.leadId, 'lead')}`}
                  onClick={() => setDetailId(call._id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetailId(call._id); } }}
                  className="cursor-pointer border-b border-border text-muted-foreground outline-none transition last:border-0 hover:bg-blue-400/[.045] focus-visible:bg-blue-400/[.065]"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{entityName(call.leadId, 'Unknown lead')}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{leadNumber(call.leadId) || call.internalCallId}</p>
                  </td>
                  <td className="max-w-[210px] truncate px-4 py-3 text-muted-foreground">{entityName(call.campaignId, 'Campaign')}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{when(call.initiatedAt || call.createdAt)}</td>
                  <td className="px-4 py-3"><StatusPill status={call.state} /></td>
                  <td className="px-4 py-3">{call.disposition ? <StatusPill status={call.disposition} /> : <span className="text-slate-600">—</span>}</td>
                  <td className="px-4 py-3 text-end font-mono tabular-nums text-muted-foreground">{duration(call.durationSeconds)}</td>
                  <td className="px-4 py-3">
                    {call.state === 'needs_reconcile' ? <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /> Resolve outcome</span>
                      : call.reviewRequired ? <span className="inline-flex items-center gap-1 text-rose-300"><ShieldAlert className="h-3.5 w-3.5" /> Review answers</span>
                        : call.failureCode ? <span title={call.failureMessage || call.failureCode} className="inline-flex max-w-40 items-center gap-1 truncate text-rose-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{call.failureCode}</span>
                          : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.total > 0 ? (
        <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          <span>{pagination.total} call{pagination.total === 1 ? '' : 's'} · page {pagination.page} of {Math.max(1, pagination.pages)}{query.isFetching ? ' · updating…' : ''}</span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous call history page" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Next call history page" disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/50 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </footer>
      ) : null}

      {detailId ? <CallReviewDrawer callId={detailId} onClose={() => setDetailId(null)} /> : null}
    </section>
  );
}

function FilterSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return (
    <label className="relative">
      <span className="sr-only">Filter by {label.toLowerCase()}</span>
      <Filter className="pointer-events-none absolute start-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 appearance-none rounded-lg border border-border bg-card ps-7 pe-7 text-xs font-medium text-muted-foreground outline-none focus:border-blue-400/45">
        <option value="">All {label.toLowerCase()}s</option>
        {values.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
      </select>
    </label>
  );
}
