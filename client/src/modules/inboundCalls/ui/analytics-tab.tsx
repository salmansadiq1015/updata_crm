'use client';

import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useInboundAnalytics } from '../hooks/use-inbound-calls';
import { browserTimeZone, enumLabel, filtersToQuery, formatDuration, formatRate, type T } from '../inbound-domain';
import type { CountRow, InboundAnalytics } from '../types/inbound-call-types';
import { BarList, EmptyState, ErrorState, Section, SkeletonBlocks, cardClass } from './inbound-primitives';
import { RangePicker, useRange } from './overview-tab';
import { useInboundLanguage } from './use-inbound-language';

export function AnalyticsTab() {
  const { t } = useInboundLanguage();
  const range = useRange('30d');
  const params = useMemo(() => filtersToQuery({ from: range.from, to: range.to }, { tz: browserTimeZone() }), [range.from, range.to]);
  const query = useInboundAnalytics(params);
  const a = query.data;
  return (
    <div className="space-y-5">
      <RangePicker value={range.preset} onChange={range.choose} from={range.from} to={range.to} onCustom={range.custom} />
      {query.isLoading && !a ? <SkeletonBlocks count={3} className="h-40" label={t('inbound.common.loading', 'Loading…')} />
        : query.isError && !a ? <div className={cardClass}><ErrorState t={t} onRetry={() => query.refetch()} /></div>
          : !a || !a.summary.total ? <div className={cardClass}><EmptyState icon={BarChart3} title={t('inbound.analytics.empty', 'No incoming calls in this period')} hint={t('inbound.analytics.emptyHint', 'Analytics are computed from recorded calls only — nothing is estimated.')} /></div>
            : <AnalyticsBody a={a} t={t} />}
    </div>
  );
}

function AnalyticsBody({ a, t }: { a: InboundAnalytics; t: T }) {
  const s = a.summary;
  const rows = (list: CountRow[], kind?: Parameters<typeof enumLabel>[1]) => list.map((r) => ({ key: String(r.key), label: r.label || (kind ? enumLabel(t, kind, String(r.key)) : String(r.key)), count: r.count }));
  const rates: Array<[string, string, number | null]> = [
    ['inbound.rate.answer', 'Answer rate', s.answerRate],
    ['inbound.rate.aiAnswer', 'Answered by AI', s.aiAnswerRate],
    ['inbound.rate.missed', 'Missed rate', s.missedRate],
    ['inbound.rate.aiSuccess', 'AI success rate', s.aiSuccessRate],
    ['inbound.rate.qualification', 'Qualification rate', s.qualificationRate],
    ['inbound.rate.callback', 'Callback rate', s.callbackRate],
    ['inbound.rate.escalation', 'Escalation rate', s.escalationRate],
  ];
  return (
    <>
      <Section id="inbound-analytics-volume" title={t('inbound.analytics.volume', 'Call volume')} description={t('inbound.analytics.volumeHint', '{total} calls · average duration {duration}', { total: s.total, duration: formatDuration(s.averageDurationSeconds) })}>
        <VolumeTrend series={a.series} t={t} />
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {rates.map(([key, fallback, value]) => <div key={key} className="min-w-0"><dt className="truncate text-[11px] text-muted-foreground">{t(key, fallback)}</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatRate(value)}</dd></div>)}
        </dl>
      </Section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section id="ia-inquiry" title={t('inbound.analytics.byInquiry', 'Inquiries')}><BarList rows={rows(a.byInquiry, 'inquiry')} empty={t('inbound.analytics.none', 'Nothing recorded.')} /></Section>
        <Section id="ia-outcome" title={t('inbound.analytics.byOutcome', 'Outcomes')}><BarList rows={rows(a.byOutcome, 'outcome')} empty={t('inbound.analytics.none', 'Nothing recorded.')} /></Section>
        <Section id="ia-qual" title={t('inbound.analytics.byQualification', 'Qualification')}><BarList rows={rows(a.byQualification, 'qualification')} empty={t('inbound.analytics.none', 'Nothing recorded.')} color="bg-emerald-500" /></Section>
        <Section id="ia-services" title={t('inbound.analytics.topServices', 'Most requested services')}><BarList rows={rows(a.topServices)} empty={t('inbound.analytics.none', 'Nothing recorded.')} /></Section>
        <Section id="ia-agent" title={t('inbound.analytics.byAgent', 'By agent')}><BarList rows={a.byAgent.map((r) => ({ key: String(r.key), label: r.label || String(r.key), count: r.count, sub: t('inbound.analytics.aiAnswered', '{count} by AI', { count: r.answered ?? 0 }) }))} empty={t('inbound.analytics.none', 'Nothing recorded.')} /></Section>
        <Section id="ia-device" title={t('inbound.analytics.byDevice', 'By phone')}><BarList rows={rows(a.byDevice)} empty={t('inbound.analytics.none', 'Nothing recorded.')} /></Section>
        <Section id="ia-sim" title={t('inbound.analytics.bySim', 'By SIM')}><BarList rows={rows(a.bySim)} empty={t('inbound.analytics.none', 'Nothing recorded.')} /></Section>
        <Section id="ia-lang" title={t('inbound.analytics.byLanguage', 'By language')}><BarList rows={a.byLanguage.map((r) => ({ key: String(r.key), label: String(r.key).toUpperCase(), count: r.count }))} empty={t('inbound.analytics.none', 'Nothing recorded.')} /></Section>
      </div>
      <Section id="ia-hour" title={t('inbound.analytics.byHour', 'Calls by hour of day')} description={t('inbound.analytics.byHourHint', 'In your browser time zone.')}><HourBars rows={a.byHour} t={t} /></Section>
    </>
  );
}

/** Inline-SVG daily volume (no chart dependency), like the AI calling analytics panel. */
function VolumeTrend({ series, t }: { series: InboundAnalytics['series']; t: T }) {
  if (series.length < 2) return <p className="text-xs text-muted-foreground">{t('inbound.analytics.trendShort', 'A trend line appears once calls span at least two days.')}</p>;
  const w = 600; const h = 120; const max = Math.max(1, ...series.map((d) => d.total));
  const step = w / (series.length - 1);
  const pts = (key: 'total' | 'ai' | 'missed') => series.map((d, i) => `${(i * step).toFixed(1)},${(h - (d[key] / max) * (h - 6) - 3).toFixed(1)}`).join(' ');
  const legend: Array<[string, string, string]> = [['bg-sky-500', 'inbound.analytics.total', 'All calls'], ['bg-cyan-400', 'inbound.analytics.ai', 'Answered by AI'], ['bg-amber-500', 'inbound.analytics.missed', 'Missed']];
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" role="img" aria-label={t('inbound.analytics.volume', 'Call volume')} preserveAspectRatio="none">
        <polyline points={pts('total')} fill="none" stroke="currentColor" strokeWidth="2" className="text-sky-500" vectorEffect="non-scaling-stroke" />
        <polyline points={pts('ai')} fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400" vectorEffect="non-scaling-stroke" />
        <polyline points={pts('missed')} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" className="text-amber-500" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{series[0].date}</span>
        <span className="flex flex-wrap gap-3">{legend.map(([c, k, f]) => <span key={k} className="flex items-center gap-1"><span className={`inline-block h-1.5 w-3 rounded ${c}`} />{t(k, f)}</span>)}</span>
        <span>{series[series.length - 1].date}</span>
      </div>
    </div>
  );
}

function HourBars({ rows, t }: { rows: CountRow[]; t: T }) {
  const counts = Array.from({ length: 24 }, (_, h) => rows.find((r) => Number(r.key) === h)?.count ?? 0);
  const max = Math.max(1, ...counts);
  if (!counts.some(Boolean)) return <p className="text-xs text-muted-foreground">{t('inbound.analytics.none', 'Nothing recorded.')}</p>;
  return (
    <div className="flex h-28 items-end gap-0.5" role="img" aria-label={t('inbound.analytics.byHour', 'Calls by hour of day')}>
      {counts.map((c, h) => (
        <div key={h} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${String(h).padStart(2, '0')}:00 · ${c}`}>
          <div className="w-full rounded-t bg-gradient-to-t from-blue-600 to-cyan-400" style={{ height: `${(c / max) * 100}%`, minHeight: c ? 2 : 0 }} />
          {h % 3 === 0 ? <span className="text-[9px] tabular-nums text-muted-foreground">{String(h).padStart(2, '0')}</span> : <span className="text-[9px]">&nbsp;</span>}
        </div>
      ))}
    </div>
  );
}
