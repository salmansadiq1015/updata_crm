'use client';

import { useState, type ReactElement } from 'react';
import { Plus, Smartphone, PhoneCall, CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PremiumStatCard as PremiumStatCardRaw } from '@/shared/components/premium-stat-card';
import { EmptyState as EmptyStateRaw } from '@/shared/components/empty-state';
import { useSimCallbacks, useSimCallCampaigns } from '../hooks/use-sim-calls';
import { progress, STATUS_LABEL } from '../sim-call-domain';
import type { CampaignStatus } from '../types/sim-call-types';
import { SimCallCampaignForm } from './sim-call-campaign-form';
import { SimCallCampaignDetail } from './sim-call-campaign-detail';

// The shared cards are untyped .jsx; loosen their prop types for this .tsx module.
const PremiumStatCard = PremiumStatCardRaw as (props: { label: string; value: number | string; icon?: unknown; accent?: string }) => ReactElement;
const EmptyState = EmptyStateRaw as (props: { icon?: unknown; title?: string; description?: string }) => ReactElement;

const STATUSES: (CampaignStatus | '')[] = ['', 'draft', 'running', 'paused', 'completed', 'cancelled'];

/**
 * SIM call campaigns: AI-ASSISTED calling from the caller's own phone and SIM. The web shows
 * only server-persisted campaigns, progress and results; calls are placed by the Android app.
 */
export function SimCallsWorkspace() {
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useSimCallCampaigns({ status: status || undefined, q: q || undefined, page });
  const overdue = useSimCallbacks('overdue');
  const campaigns = data?.data ?? [];
  const agg = campaigns.reduce((a, c) => ({
    running: a.running + (c.status === 'running' ? 1 : 0),
    answered: a.answered + c.summary.answered,
    review: a.review + c.summary.needsReview + c.summary.syncFailed,
  }), { running: 0, answered: 0, review: 0 });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 ring-1 ring-brand-500/20"><Smartphone className="h-5 w-5 text-brand-500" /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">SIM call campaigns</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">Callers phone leads from their own SIM with the Updata Android app. The app guides them through the questions and records answers here. The AI does not speak or listen on SIM calls (Android does not allow it).</p>
          </div>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-theme-sm hover:bg-brand-600">
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PremiumStatCard label="Running (this page)" value={agg.running} icon={PhoneCall} />
        <PremiumStatCard label="Answered calls" value={agg.answered} icon={CheckCircle2} />
        <PremiumStatCard label="Callbacks overdue" value={overdue.data?.pagination.total ?? 0} icon={CalendarClock} />
        <PremiumStatCard label="Needs review" value={agg.review} icon={AlertTriangle} />
      </div>

      {(overdue.data?.data.length ?? 0) > 0 ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="mb-1 font-semibold text-destructive">Overdue callbacks</p>
          <ul className="space-y-0.5">
            {overdue.data!.data.slice(0, 5).map((t) => (
              <li key={t.id}><button type="button" className="hover:underline" onClick={() => t.campaign && setSelected(t.campaign.id)}>{t.lead?.name ?? '—'} · {t.campaign?.name}</button></li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <select aria-label="Filter by status" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value as CampaignStatus | ''); setPage(1); }}>
          {STATUSES.map((s) => <option key={s || 'all'} value={s}>{s ? STATUS_LABEL[s] : 'All statuses'}</option>)}
        </select>
        <input aria-label="Search campaigns" placeholder="Search campaigns…" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {isError ? <button type="button" className="text-sm text-brand-500" onClick={() => void refetch()}>Could not load campaigns. Retry</button> : null}
      {!isLoading && !isError && !campaigns.length ? <EmptyState icon={Smartphone} title="No SIM call campaigns" description="Create one, then start calling from the Android app." /> : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-3 py-2">Campaign</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Progress</th><th className="px-3 py-2">Answered</th><th className="px-3 py-2">Callbacks</th><th className="px-3 py-2">Review</th><th className="px-3 py-2">Last activity</th></tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const p = progress(c.summary);
              return (
                <tr key={c._id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => setSelected(c._id)}>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[c.status]}</td>
                  <td className="px-3 py-2">{p.closed}/{c.summary.total} ({p.percent}%)</td>
                  <td className="px-3 py-2">{c.summary.answered}</td>
                  <td className="px-3 py-2">{c.summary.callbacksDue ? <span className="text-destructive">{c.summary.callbacksDue} due</span> : c.summary.callbacks}</td>
                  <td className="px-3 py-2">{c.summary.needsReview + c.summary.syncFailed || ''}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.lastActivityAt ? new Date(c.lastActivityAt).toLocaleString() : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data && data.pagination.pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 disabled:opacity-40">Previous</button>
          <span>{page} / {data.pagination.pages}</span>
          <button type="button" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 disabled:opacity-40">Next</button>
        </div>
      ) : null}

      {creating ? <SimCallCampaignForm onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); setSelected(c._id); }} /> : null}
      {selected ? <SimCallCampaignDetail campaignId={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
