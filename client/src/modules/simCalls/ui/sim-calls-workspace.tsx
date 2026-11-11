'use client';

import { useState, type ReactElement } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, PhoneCall, Plus, Radio, Search, Smartphone } from 'lucide-react';
import { useOptionalLanguage } from '@/lib/i18n/language-context';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import { cn } from '@/lib/utils';
import { EmptyState as EmptyStateRaw } from '@/shared/components/empty-state';
import { HeroStat } from '@/shared/components/hero-art';
import { HeroPill, PageHero, heroButton } from '@/shared/components/page-hero';
import { useSimCallbacks, useSimCallCampaigns, useSimCallStats } from '../hooks/use-sim-calls';
import { progress, STATUS_LABEL } from '../sim-call-domain';
import type { CampaignStatus } from '../types/sim-call-types';
import { SimCallCampaignForm } from './sim-call-campaign-form';
import { SimCallCampaignDetail } from './sim-call-campaign-detail';

// The shared empty state is untyped .jsx; loosen its prop types for this .tsx module.
const EmptyState = EmptyStateRaw as (props: { icon?: unknown; title?: string; description?: string }) => ReactElement;

type Vars = Record<string, string | number | null | undefined>;
type T = (key: string, fallback?: string, vars?: Vars) => string;
const interpolate = (text: string, vars?: Vars) => text.replace(/\{(\w+)\}/g, (m, k: string) => (vars?.[k] != null ? String(vars[k]) : m));

/** The app's language context when mounted; English fallbacks otherwise (tests, embeds). */
function useSimLanguage(): { t: T; locale: string } {
  const ctx = useOptionalLanguage() as { t: T; locale: string } | null;
  return ctx ?? { t: (key, fallback, vars) => interpolate(fallback ?? key, vars), locale: 'en' };
}

const STATUSES: (CampaignStatus | '')[] = ['', 'draft', 'running', 'paused', 'completed', 'cancelled'];
const STATUS_TONE: Record<CampaignStatus, string> = {
  draft: 'bg-muted text-muted-foreground ring-border',
  running: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300',
  paused: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300',
  completed: 'bg-sky-500/10 text-sky-700 ring-sky-500/25 dark:text-sky-300',
  cancelled: 'bg-rose-500/10 text-rose-700 ring-rose-500/25 dark:text-rose-300',
};
const fieldClass = 'h-10 rounded-xl border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * SIM call campaigns: AI-ASSISTED calling from the caller's own phone and SIM. The web shows
 * only server-persisted campaigns, progress and results; calls are placed by the Android app.
 */
export function SimCallsWorkspace() {
  const { t, locale } = useSimLanguage();
  const intl = intlLocaleFor(locale);
  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useSimCallCampaigns({ status: status || undefined, q: q || undefined, page });
  const stats = useSimCallStats();
  const overdue = useSimCallbacks('overdue');
  const campaigns = data?.data ?? [];
  const s = stats.data;
  const num = (v: number | undefined) => (v == null ? '—' : v.toLocaleString(intl));
  const statusLabel = (value: CampaignStatus) => t(`simCalls.status.${value}`, STATUS_LABEL[value]);
  const overdueCount = s?.callbacksOverdue ?? overdue.data?.pagination.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHero
        id="sim-calls-title"
        art="/hero/simcalls"
        icon={Smartphone}
        eyebrow={t('simCalls.title', 'SIM call campaigns')}
        title={t('hero.sim.title', 'Your team’s phones, guided by AI.')}
        subtitle={t('simCalls.subtitle', 'Callers phone leads from their own SIM with the Updata Android app. The app guides them through the questions and records answers here. The AI does not speak or listen on SIM calls (Android does not allow it).')}
        status={s ? (
          <HeroPill tone={s.byStatus.running ? 'ok' : 'off'}>
            {s.byStatus.running ? t('hero.sim.running', '{count} running now', { count: s.byStatus.running }) : t('hero.sim.idle', 'No campaign running')}
          </HeroPill>
        ) : null}
        actions={<button type="button" onClick={() => setCreating(true)} className={heroButton.primary}><Plus aria-hidden="true" />{t('simCalls.new', 'New campaign')}</button>}
        stats={<>
          <HeroStat icon={Radio} label={t('hero.sim.campaigns', 'Campaigns')} value={num(s?.campaigns)} hint={s ? t('hero.sim.byStatus', '{running} running · {paused} paused', { running: s.byStatus.running, paused: s.byStatus.paused }) : undefined} loading={stats.isLoading} />
          <HeroStat icon={PhoneCall} tone="text-cyan-300" label={t('hero.sim.leadsCalled', 'Leads reached')} value={s ? `${num(s.tasks.closed)} / ${num(s.tasks.total)}` : '—'} hint={t('hero.sim.progressHint', 'Closed of all leads in campaigns')} loading={stats.isLoading} />
          <HeroStat icon={CheckCircle2} tone="text-emerald-300" label={t('simCalls.answered', 'Answered calls')} value={num(s?.tasks.answered)} hint={t('hero.sim.answerRate', 'Answer rate {rate}', { rate: s?.answerRate == null ? '—' : `${Math.round(s.answerRate * 100)}%` })} loading={stats.isLoading} />
          <HeroStat icon={CalendarClock} tone={overdueCount ? 'text-amber-300' : 'text-sky-200'} label={t('simCalls.callbacksOverdue', 'Callbacks overdue')} value={num(stats.isLoading ? undefined : overdueCount)} hint={t('hero.sim.callbacksDue', '{count} callbacks due', { count: num(s?.tasks.callbacksDue) })} loading={stats.isLoading} />
          <div className="col-span-2 lg:col-span-1">
            <HeroStat icon={AlertTriangle} tone="text-amber-300" label={t('simCalls.needsReview', 'Needs review')} value={num(s ? s.tasks.needsReview + s.tasks.syncFailed : undefined)} hint={t('hero.sim.reviewHint', '{count} failed to sync', { count: num(s?.tasks.syncFailed) })} loading={stats.isLoading} />
          </div>
        </>}
      />

      {(overdue.data?.data.length ?? 0) > 0 ? (
        <div role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300"><CalendarClock className="size-4" aria-hidden="true" />{t('simCalls.overdueTitle', 'Overdue callbacks')}</p>
          <ul className="flex flex-wrap gap-2">
            {overdue.data!.data.slice(0, 5).map((task) => (
              <li key={task.id}>
                <button type="button" className="rounded-full border border-amber-500/25 bg-background px-3 py-1 text-xs font-medium transition hover:border-amber-500/50" onClick={() => task.campaign && setSelected(task.campaign.id)}>
                  {task.lead?.name ?? '—'} · {task.campaign?.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_30px_-18px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:px-5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" aria-hidden="true" />
            <input aria-label={t('simCalls.search', 'Search campaigns')} placeholder={t('simCalls.searchPlaceholder', 'Search campaigns…')} className={cn(fieldClass, 'w-full ps-9')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <select aria-label={t('simCalls.filterStatus', 'Filter by status')} className={cn(fieldClass, 'sm:w-48')} value={status} onChange={(e) => { setStatus(e.target.value as CampaignStatus | ''); setPage(1); }}>
            {STATUSES.map((value) => <option key={value || 'all'} value={value}>{value ? statusLabel(value) : t('simCalls.allStatuses', 'All statuses')}</option>)}
          </select>
        </div>

        {isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-5 py-14 text-center">
            <p className="text-sm text-destructive">{t('simCalls.loadError', 'Campaigns could not be loaded.')}</p>
            <button type="button" className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-muted" onClick={() => void refetch()}>{t('common.retry', 'Retry')}</button>
          </div>
        ) : isLoading ? (
          <div role="status" aria-busy="true" className="space-y-3 p-5">
            <span className="sr-only">{t('common.loading', 'Loading…')}</span>
            {[0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="skeleton-shimmer h-14 rounded-xl bg-muted" />)}
          </div>
        ) : !campaigns.length ? (
          <div className="py-6"><EmptyState icon={Smartphone} title={t('simCalls.emptyTitle', 'No SIM call campaigns')} description={t('simCalls.emptyHint', 'Create one, then start calling from the Android app.')} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-start text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-start font-medium">{t('simCalls.col.campaign', 'Campaign')}</th>
                  <th className="px-3 py-3 text-start font-medium">{t('simCalls.col.status', 'Status')}</th>
                  <th className="px-3 py-3 text-start font-medium">{t('simCalls.col.progress', 'Progress')}</th>
                  <th className="px-3 py-3 text-end font-medium">{t('simCalls.col.answered', 'Answered')}</th>
                  <th className="px-3 py-3 text-end font-medium">{t('simCalls.col.callbacks', 'Callbacks')}</th>
                  <th className="px-3 py-3 text-end font-medium">{t('simCalls.col.review', 'Review')}</th>
                  <th className="px-5 py-3 text-end font-medium">{t('simCalls.col.lastActivity', 'Last activity')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((c) => {
                  const p = progress(c.summary);
                  const review = c.summary.needsReview + c.summary.syncFailed;
                  return (
                    <tr key={c._id} tabIndex={0} className="cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none" onClick={() => setSelected(c._id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(c._id); } }}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-500/15 to-cyan-400/15 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-300"><Smartphone className="size-4" aria-hidden="true" /></span>
                          <span className="font-medium text-foreground">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5"><span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', STATUS_TONE[c.status])}>{c.status === 'running' ? <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" /> : null}{statusLabel(c.status)}</span></td>
                      <td className="px-3 py-3.5">
                        <div className="flex min-w-40 items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" style={{ width: `${p.percent}%` }} /></div>
                          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{p.closed}/{c.summary.total} ({p.percent}%)</span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-end tabular-nums">{c.summary.answered}</td>
                      <td className="px-3 py-3.5 text-end tabular-nums">{c.summary.callbacksDue ? <span className="font-medium text-destructive">{t('simCalls.due', '{count} due', { count: c.summary.callbacksDue })}</span> : c.summary.callbacks}</td>
                      <td className="px-3 py-3.5 text-end tabular-nums">{review ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{review}</span> : ''}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-end text-xs text-muted-foreground">{c.lastActivityAt ? new Date(c.lastActivityAt).toLocaleString(intl, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pagination.pages > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-sm">
            <span className="text-xs text-muted-foreground">{t('simCalls.total', '{count} campaigns', { count: data.pagination.total })}</span>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={t('common.previous', 'Previous')} disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="grid size-8 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" /></button>
              <span className="px-2 tabular-nums">{page} / {data.pagination.pages}</span>
              <button type="button" aria-label={t('common.next', 'Next')} disabled={page >= data.pagination.pages} onClick={() => setPage((value) => value + 1)} className="grid size-8 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" /></button>
            </div>
          </div>
        ) : null}
      </section>

      {creating ? <SimCallCampaignForm onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); setSelected(c._id); }} /> : null}
      {selected ? <SimCallCampaignDetail campaignId={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
