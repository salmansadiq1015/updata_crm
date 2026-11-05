'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Bot, CheckCheck, ChevronRight, Clock3, Coins, History, Inbox, PhoneIncoming, UserCheck, PhoneMissed, Radio, Target, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInboundCostAnalytics, useInboundList, useInboundLive, useInboundStats } from '../hooks/use-inbound-calls';
import { browserTimeZone, callerDisplay, filtersToQuery, formatCost, formatDateTime, formatDuration, formatRate, rangeFor, simLabel } from '../inbound-domain';
import { AiPill, CallerTypeBadge, CallStatusPill, EmptyState, ErrorState, OutcomePill, Section, SkeletonBlocks, cardClass } from './inbound-primitives';
import { useInboundLanguage } from './use-inbound-language';
import type { InboundFilters } from '../types/inbound-call-types';
import { incomingStyles as styles } from './incoming-calls-styles';

export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'all';
export const RANGE_PRESETS: RangePreset[] = ['today', '7d', '30d', '90d', 'all'];

export function RangePicker({ value, onChange, from, to, onCustom }: { value: RangePreset | 'custom'; onChange: (p: RangePreset) => void; from: string; to: string; onCustom: (from: string, to: string) => void }) {
  const { t } = useInboundLanguage();
  return (
    <div className={styles.rangePicker}>
      <div role="group" aria-label={t('inbound.range.label', 'Date range')} className={styles.presets}>
        {RANGE_PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)} className={styles.preset}>{t(`inbound.range.${p}`, p)}</button>
        ))}
      </div>
      <label className={styles.dateField}>{t('inbound.range.from', 'From')}<input type="date" value={from} onChange={(e) => onCustom(e.target.value, to)} className={styles.dateInput} /></label>
      <label className={styles.dateField}>{t('inbound.range.to', 'To')}<input type="date" value={to} onChange={(e) => onCustom(from, e.target.value)} className={styles.dateInput} /></label>
    </div>
  );
}

export function useRange(initial: RangePreset = '30d') {
  const [preset, setPreset] = useState<RangePreset | 'custom'>(initial);
  const [range, setRange] = useState(() => rangeFor(initial));
  return {
    preset, ...range,
    choose: (p: RangePreset) => { setPreset(p); setRange(rangeFor(p)); },
    custom: (from: string, to: string) => { setPreset('custom'); setRange({ from, to }); },
  };
}

export function OverviewTab({ onOpenCall, onTab }: { onOpenCall: (id: string) => void; onTab: (tab: string, filters?: Partial<InboundFilters>) => void }) {
  const { t, intlLocale } = useInboundLanguage();
  const range = useRange('30d');
  const params = useMemo(() => filtersToQuery({ from: range.from, to: range.to }, { tz: browserTimeZone() }), [range.from, range.to]);
  const stats = useInboundStats(params);
  const live = useInboundLive();
  const recent = useInboundList(useMemo(() => ({ ...params, page: 1, limit: 8 }), [params]));
  // Work queue counts (all time): only the list total is used.
  const openCalls = useInboundList(useMemo(() => ({ workStatus: 'open', page: 1, limit: 1 }), []));
  const mine = useInboundList(useMemo(() => ({ workStatus: 'open', assignedTo: 'me', page: 1, limit: 1 }), []));
  // AI spend for the same window (the Costs tab has the full breakdown).
  const costs = useInboundCostAnalytics(useMemo(() => ({ ...(params.from ? { from: String(params.from) } : {}), ...(params.to ? { to: String(params.to) } : {}) }), [params]));
  const s = stats.data;
  const c = costs.data;
  const v = (n: number | undefined) => (s ? (n ?? 0).toLocaleString(intlLocale) : '—');

  return (
    <div className={styles.overview}>
      <div className={styles.toolbar}><h2 className={styles.toolbarTitle}>{t('inbound.tabs.overview', 'Overview')}<span>{t('inbound.overview.keyFigures', 'Key figures')}</span></h2>
      <RangePicker value={range.preset} onChange={range.choose} from={range.from} to={range.to} onCustom={range.custom} /></div>

      {stats.isError && !s ? <div className={cardClass}><ErrorState t={t} onRetry={() => stats.refetch()} /></div> : (
        <section aria-label={t('inbound.overview.keyFigures', 'Key figures')} className={cn(styles.metrics, 'xl:grid-cols-5')}>
            <OverviewMetric icon={PhoneIncoming} label={t('inbound.stats.total', 'Total calls')} value={v(s?.total)} hint={s ? t('inbound.stats.answerRate', 'Answer rate {rate}', { rate: formatRate(s.answerRate) }) : undefined} />
            <OverviewMetric icon={Bot} label={t('inbound.stats.answeredByAi', 'Answered by AI')} value={v(s?.answeredByAi)} tone="live" hint={s ? t('inbound.stats.aiSuccess', 'AI success rate {rate}', { rate: formatRate(s.aiSuccessRate) }) : undefined} />
            <OverviewMetric icon={PhoneMissed} label={t('inbound.stats.missed', 'Missed')} value={v(s?.missed)} tone={s?.missed ? 'warning' : undefined} hint={s ? t('inbound.stats.missedRate', 'Missed rate {rate}', { rate: formatRate(s.missedRate) }) : undefined} />
            <OverviewMetric icon={Target} label={t('inbound.stats.qualified', 'Qualified')} value={v(s?.qualified)} tone={s?.qualified ? 'success' : undefined} hint={s ? t('inbound.stats.qualRate', 'Of AI calls {rate}', { rate: formatRate(s.qualificationRate) }) : undefined} />
            <OverviewMetric icon={Coins} label={t('inbound.overview.aiCost', 'AI cost (period)')} value={c ? formatCost(c.totals.totalCost, c.currency, intlLocale) : '—'} tone="live"
              hint={c ? t('inbound.overview.aiCostHint', '{perMinute}/min · estimate', { perMinute: formatCost(c.totals.costPerMinute, c.currency, intlLocale) }) : undefined}
              onClick={() => onTab('costs')} actionLabel={t('inbound.overview.openCosts', 'Open the cost breakdown')} />
        </section>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('inbound.overview.workQueue', 'Work queue')}>
        <QueueChip icon={Inbox} label={t('inbound.overview.openCalls', 'Open calls')} count={openCalls.data?.pagination.total} onClick={() => onTab('history', { workStatus: 'open' })} />
        <QueueChip icon={UserCheck} label={t('inbound.overview.assignedToMe', 'Assigned to me')} count={mine.data?.pagination.total} onClick={() => onTab('history', { workStatus: 'open', assignedTo: 'me' })} />
      </div>

      <div className={styles.activityGrid}>
      <Section className={styles.recentPanel} id="inbound-recent" title={t('inbound.overview.recent', 'Recent calls')} actions={<button type="button" className={styles.textButton} onClick={() => onTab('history')}><History className="size-4" />{t('inbound.overview.openHistory', 'All calls')}<ArrowRight className="size-3.5 rtl:rotate-180" /></button>}>
        {recent.isLoading ? <SkeletonBlocks count={4} className="h-11" label={t('inbound.common.loading', 'Loading…')} />
          : recent.isError ? <ErrorState t={t} onRetry={() => recent.refetch()} />
            : !recent.data?.data.length ? <EmptyState icon={PhoneIncoming} title={t('inbound.overview.noCalls', 'No incoming calls in this period')} hint={t('inbound.overview.noCallsHint', 'Calls to your connected phone appear here, whether the AI or a person answered — or nobody did.')} />
              : (
                <ul className={styles.callList}>
                  {recent.data.data.map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => onOpenCall(c.id)} className={styles.callRow}>
                        <span className={styles.callerIcon} aria-hidden="true"><PhoneIncoming className="size-4" /></span>
                        <span className={styles.callerIdentity}><span className="block truncate text-sm font-medium">{callerDisplay(c, t)}</span><span className="block truncate text-[11px] text-muted-foreground">{c.caller.number || '—'} · {formatDateTime(c.detectedAt, intlLocale)}</span></span>
                        <span className={styles.callBadges}><CallerTypeBadge type={c.callerType} t={t} />
                        <OutcomePill value={c.outcome} t={t} />
                        {!c.outcome ? <CallStatusPill status={c.status} t={t} /> : null}</span>
                        <span className={styles.duration}><Clock3 aria-hidden="true" className="size-3.5" />{formatDuration(c.durationSeconds)}</span><ChevronRight aria-hidden="true" className={styles.rowArrow} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
      </Section>

      <Section className={styles.livePanel} id="inbound-live-strip" title={t('inbound.overview.liveNow', 'Live now')} actions={<button type="button" className={styles.textButton} onClick={() => onTab('live')}><Radio className="size-4" />{t('inbound.overview.openLive', 'Open live monitor')}</button>}>
        {live.isLoading ? <SkeletonBlocks count={1} className="h-12" label={t('inbound.common.loading', 'Loading…')} />
          : live.isError ? <ErrorState t={t} onRetry={() => live.refetch()} />
          : !live.data?.length ? <div className={styles.liveEmpty}>
            <div className={styles.signalOrbit} aria-hidden="true"><span /><span /><Radio /></div>
            <p className="text-sm font-semibold">{t('inbound.live.empty', 'No calls in progress')}</p>
            <p className={styles.liveHint}>{t('inbound.overview.noLive', 'No calls in progress. New calls appear here the moment the phone rings.')}</p>
          </div>
            : (
              <ul className="grid min-w-0 gap-3">
                {live.data.map((c) => (
                  <li key={c.id} className="min-w-0">
                    <button type="button" onClick={() => onOpenCall(c.id)} className="w-full rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3 text-start transition hover:border-cyan-400/50">
                      <p className="truncate text-sm font-semibold">{callerDisplay(c, t)}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{c.caller.number || '—'} · {c.device?.name || '—'} · {simLabel(c.sim.slot, c.sim.label)}</p>
                      <div className="mt-2 flex flex-wrap gap-1"><CallStatusPill status={c.status} t={t} /><AiPill status={c.aiStatus} t={t} /></div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
      </Section>
      </div>
      {s ? <section className={styles.breakdown} aria-label={t('inbound.tabs.analytics', 'Analytics')}>
        <div className={styles.breakdownHeader}><span><CheckCheck aria-hidden="true" className="size-4" />{t('inbound.tabs.analytics', 'Analytics')}</span><button type="button" className={styles.textButton} onClick={() => onTab('analytics')}>{t('inbound.tabs.analytics', 'Analytics')}<ArrowRight aria-hidden="true" className="size-3.5 rtl:rotate-180" /></button></div>
          <dl className={styles.detailGrid}>
            {([
              ['inbound.stats.answeredByHuman', 'Answered by a person', v(s?.answeredByHuman)],
              ['inbound.stats.completed', 'Completed', v(s?.completed)],
              ['inbound.stats.active', 'Active now', v(s?.active)],
              ['inbound.stats.failed', 'Failed or interrupted', v(s?.failed)],
              ['inbound.stats.newLeads', 'New leads', v(s?.newLeads)],
              ['inbound.stats.existingLeads', 'Existing leads', v(s?.existingLeads)],
              ['inbound.stats.callbacks', 'Callbacks requested', v(s?.callbacks)],
              ['inbound.stats.escalations', 'Asked for a person', v(s?.escalations)],
              ['inbound.stats.avgDuration', 'Average duration', s ? formatDuration(s.averageDurationSeconds) : '—'],
              ['inbound.stats.aiSuccessRate', 'AI success rate', s ? formatRate(s.aiSuccessRate) : '—'],
            ] as const).map(([key, fallback, value]) => (
              <div key={key} className="min-w-0"><dt className="text-xs leading-relaxed text-muted-foreground">{t(key, fallback)}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd></div>
            ))}
          </dl>
      </section> : null}
    </div>
  );
}


function QueueChip({ icon: Icon, label, count, onClick }: { icon: LucideIcon; label: string; count: number | undefined; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] px-3.5 py-2 text-sm font-medium transition hover:border-sky-400/50 focus-visible:outline-2 focus-visible:outline-ring">
    <Icon aria-hidden className="size-4 text-primary" />{label}<span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">{count ?? '—'}</span>
  </button>;
}

function OverviewMetric({ label, value, hint, tone, icon: Icon, onClick, actionLabel }: { label: string; value: string; hint?: string; tone?: string; icon: LucideIcon; onClick?: () => void; actionLabel?: string }) {
  const body = <>
    <div className={styles.metricTop}><p>{label}</p><span className={styles.metricIcon}><Icon aria-hidden="true" className="size-4" /></span></div>
    <p className={styles.metricValue}>{value}</p>
    <div className={styles.metricFooter}><span className={styles.metricDot} aria-hidden="true" /><p>{hint || '—'}</p></div>
  </>;
  if (onClick) return <button type="button" onClick={onClick} title={actionLabel} aria-label={`${label}: ${value}. ${actionLabel ?? ''}`} className={cn(styles.metric, 'col-span-2 text-start transition hover:ring-2 hover:ring-sky-400/30 focus-visible:outline-2 focus-visible:outline-ring xl:col-span-1')} data-tone={tone || 'neutral'}>{body}</button>;
  return <div className={styles.metric} data-tone={tone || 'neutral'}>
    <div className={styles.metricTop}><p>{label}</p><span className={styles.metricIcon}><Icon aria-hidden="true" className="size-4" /></span></div>
    <p className={styles.metricValue}>{value}</p>
    <div className={styles.metricFooter}><span className={styles.metricDot} aria-hidden="true" /><p>{hint || '—'}</p></div>
  </div>;
}
