'use client';
import { ProviderCostComparisonPanel } from './provider-cost-comparison';

import { compareCallCosts } from '../cost-comparison';
import { useId, useState, type ReactNode } from 'react';
import { Activity, ChevronDown, Clock3, Coins, Cpu, Download, FileText, Gauge, Info, Loader2, MessageSquareText, Phone, Smile, Sparkles, TrendingUp, Users } from 'lucide-react';
import { downloadBlob } from '@/lib/api/download';
import { showError } from '@/lib/toast';
import { useAgentCallAnalytics } from '../hooks/use-calling-agents';
import { callingAgentApi } from '../services/calling-agent-api';
import type { AgentCallAnalytics, AnalyzedCall, AnalyzedLead, CallOutcomeProfile, LeadTone } from '../types/ai-calling-types';
import { CallDetailDrawer } from './call-detail-drawer';
import { StatusPill } from './status-pill';
import { AgentTabs, panelClass, secondaryClass } from './calling-agent-primitives';

// Cost components in fixed order (validated categorical palette on the dark surface).
const COMPONENTS = [
  { key: 'voice', label: 'AI voice (audio tokens)', color: '#3b82f6' },
  { key: 'telephony', label: 'Telephony minutes', color: '#d97706' },
  { key: 'text', label: 'AI text tokens', color: '#0891b2' },
  { key: 'platform', label: 'Platform minutes', color: '#db2777' },
  { key: 'other', label: 'Reported / unsplit cost', color: '#8b5cf6' },
] as const;
const TONES: Array<{ key: LeadTone | 'unrecorded'; label: string; className: string; dot: string }> = [
  { key: 'positive', label: 'Positive', className: 'text-emerald-300', dot: 'bg-emerald-400' },
  { key: 'neutral', label: 'Neutral', className: 'text-muted-foreground', dot: 'bg-slate-400' },
  { key: 'hesitant', label: 'Hesitant', className: 'text-amber-300', dot: 'bg-amber-400' },
  { key: 'negative', label: 'Negative', className: 'text-rose-300', dot: 'bg-rose-400' },
  { key: 'unrecorded', label: 'Not recorded', className: 'text-muted-foreground', dot: 'bg-slate-600' },
];
const OUTCOMES: Record<CallOutcomeProfile, string> = {
  engaged: 'Answered every question', partially_engaged: 'Partially answered', callback_requested: 'Asked for a callback',
  declined: 'Declined', opted_out: 'Opted out', not_reached: 'Not reached',
};
const RANGES = [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }];

// Day-granular so the query key stays stable between renders.
export const rangeParams = (range: string, now = new Date()) => {
  if (range === 'all') return {};
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return { from: new Date(end - Number(range) * 86_400_000).toISOString(), to: new Date(end).toISOString() };
};
export const money = (value: number | null | undefined, currency = 'USD') => {
  if (value == null) return '—';
  const digits = value === 0 ? 2 : Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
};
export const estimateMoney = (data: AgentCallAnalytics, value: number | null | undefined) => value != null && data.totals.totalCost === 0 && (data.billing?.unpricedCalls || data.billing?.foreignCurrencyCalls)
  ? 'Not recorded' : money(value, data.currency);
const num = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat(undefined, { notation: value >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
const duration = (seconds: number) => seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.round(seconds % 3600 / 60)}m` : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const splitCost = (c: { modelDetail?: { audioIn: number; audioOut: number; textIn: number; textOut: number }; model: number; telephony: number; platform: number; other?: number }) => {
  const d = c.modelDetail;
  const voice = d ? d.audioIn + d.audioOut : 0;
  const text = d ? d.textIn + d.textOut : 0;
  return { voice, telephony: c.telephony, text, platform: c.platform, other: (c.other || 0) + (d ? 0 : c.model) };
};

export function AgentCallAnalytics({ agentId }: { agentId: string }) {
  const [range, setRange] = useState('7');
  const [view, setView] = useState('calls');
  const [exporting, setExporting] = useState(false);
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const query = useAgentCallAnalytics(agentId, rangeParams(range));
  const data = query.data;

  const exportCsv = async () => {
    setExporting(true);
    try { downloadBlob(await callingAgentApi.callAnalyticsCsv(agentId, rangeParams(range)), `agent-call-analytics-${range}.csv`, 'text/csv;charset=utf-8'); }
    catch (e) { showError(e); } finally { setExporting(false); }
  };

  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold tracking-tight">Call analytics</h2><p className="mt-1 text-xs text-muted-foreground">Cost, duration, outcome and lead behavior for every call this agent placed.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Date range" className="flex rounded-xl border border-border bg-muted/40 p-1">
          {RANGES.map(r => <button key={r.value} role="radio" aria-checked={range === r.value} onClick={() => setRange(r.value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${range === r.value ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-foreground shadow-md shadow-blue-950/40' : 'text-muted-foreground hover:text-foreground'}`}>{r.label}</button>)}
        </div>
        <button className={secondaryClass} disabled={exporting || !data?.totals.calls} onClick={() => void exportCsv()}>{exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Export CSV</button>
      </div>
    </div>

    {!data ? <div className={`${panelClass} flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground`}>{query.isError ? <span role="alert">Analytics could not be loaded. <button className="font-semibold text-primary underline" onClick={() => void query.refetch()}>Try again</button></span> : <><Loader2 className="size-4 animate-spin" />Loading call analytics…</>}</div>
      : !data.totals.calls ? <EmptyState testing={data.testing} /> : <>
        <CostHero data={data} />
        <BillingComparison data={data} range={range} />
        <ProviderCostComparisonPanel data={data.providerComparison} />
        <OptimizationComparison calls={data.calls} />
        <div className="grid min-w-0 gap-5 xl:grid-cols-5">
          <CostBreakdown data={data} />
          <CostTrend data={data} />
        </div>
        <BehaviorPanel data={data} />
        <AgentTabs label="Call analytics detail" value={view} onChange={setView} items={[{ value: 'calls', label: `Calls (${data.totals.calls})` }, { value: 'leads', label: `Per lead (${data.totals.leads})` }]}>
          {view === 'calls' ? <CallList calls={data.calls.filter(c => !c.isTest)} onOpen={setOpenCallId} /> : <LeadTable leads={data.leads} onOpen={setOpenCallId} />}
        </AgentTabs>
        {data.truncated && <p className="text-xs text-amber-300">Showing the most recent calls. Export CSV for the complete history.</p>}
        <PricingNote data={data} />
      </>}
    {openCallId && <CallDetailDrawer callId={openCallId} onClose={() => setOpenCallId(null)} />}
  </div>;
}

function EmptyState({ testing }: { testing: AgentCallAnalytics['testing'] }) {
  return <div className={`${panelClass} flex flex-col items-center gap-3 py-14 text-center`}>
    <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/25 to-cyan-500/20 ring-1 ring-sky-400/20"><TrendingUp className="size-5 text-primary" /></span>
    <p className="font-medium">No campaign calls in this period</p>
    <p className="max-w-md text-xs text-muted-foreground">Cost, duration, summary and behavior for each call appear here once this agent places calls.{testing.calls ? ` ${testing.calls} test call(s) cost ${money(testing.totalCost)} in this period.` : ''}</p>
  </div>;
}

function Kpi({ icon, label, value, hint, accent = false }: { icon: ReactNode; label: string; value: string; hint?: string; accent?: boolean }) {
  return <div className={`group relative overflow-hidden rounded-2xl border p-4 transition ${accent ? 'border-sky-400/25 bg-card' : 'border-border bg-card hover:border-border'}`}>
    <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"><span className="text-primary/80">{icon}</span>{label}</div>
    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
    {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
  </div>;
}

function CostHero({ data }: { data: AgentCallAnalytics }) {
  const t = data.totals;
  const minutes = t.totalSeconds / 60;
  return <div className="grid gap-3 lg:grid-cols-[1.2fr_2fr]">
    <div className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-card p-6 shadow-xl shadow-blue-950/30">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-cyan-400/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 start-10 size-48 rounded-full bg-blue-500/20 blur-3xl" />
      <p className="relative flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary/80"><Coins className="size-4" />Estimated call total</p>
      <p className="relative mt-3 text-4xl font-semibold tabular-nums tracking-tight text-foreground">{estimateMoney(data, t.totalCost)}</p>
      <p className="relative mt-2 text-xs text-primary/70">{t.calls} calls · {t.connected} connected · {t.leads} lead{t.leads === 1 ? '' : 's'}</p>
      {/* Cost per minute of talk time — the headline unit rate the user watches. */}
      <div className="relative mt-4 flex items-end justify-between gap-3 rounded-xl border border-cyan-300/20 bg-cyan-400/[0.07] px-3.5 py-3">
        <div><p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary/80"><Gauge className="size-3.5" />Cost per minute</p><p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{estimateMoney(data, t.costPerMinute)}</p></div>
        <p className="pb-1 text-[11px] text-primary/60">over {minutes >= 1 ? `${num(Math.round(minutes))} min` : `${t.totalSeconds}s`} of talk</p>
      </div>
      <div className="relative mt-3 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
        <div><p className="text-primary/60">Talk time</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{duration(t.totalSeconds)}</p></div>
        <div><p className="text-primary/60">Total minutes</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{num(Number(minutes.toFixed(minutes < 10 ? 1 : 0)))}</p></div>
        <div><p className="text-primary/60">Tokens</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{num(t.tokens.total)}</p></div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi accent icon={<Phone className="size-3.5" />} label="Avg / call" value={estimateMoney(data, t.avgCostPerCall)} hint="All attempts" />
      <Kpi accent icon={<Phone className="size-3.5" />} label="Avg / connected" value={estimateMoney(data, t.avgCostPerConnectedCall)} hint={`${t.connected} connected`} />
      <Kpi accent icon={<Users className="size-3.5" />} label="Cost / lead attempt" value={estimateMoney(data, t.avgCostPerCall)} hint={`${t.calls} call attempts`} />
      <Kpi accent icon={<Sparkles className="size-3.5" />} label="Cost / qualified" value={estimateMoney(data, t.costPerQualifiedLead)} hint={`${t.qualified} qualified`} />
      <Kpi icon={<Clock3 className="size-3.5" />} label="Avg duration" value={t.avgDurationSeconds ? duration(t.avgDurationSeconds) : '—'} hint="Connected calls" />
      <Kpi icon={<Gauge className="size-3.5" />} label="Cost / minute" value={estimateMoney(data, t.costPerMinute)} hint="Of talk time" />
      <Kpi icon={<Cpu className="size-3.5" />} label="Avg tokens / call" value={num(t.avgTokensPerCall)} hint={`${t.callsWithUsage} calls metered`} />
      <Kpi icon={<TrendingUp className="size-3.5" />} label="Connect rate" value={t.connectRate == null ? '—' : `${Math.round(t.connectRate * 100)}%`} hint={`${t.completed} completed`} />
    </div>
  </div>;
}

function StackedBar({ parts, label }: { parts: Array<{ key: string; label: string; color: string; value: number }>; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const visible = parts.filter(p => p.value > 0);
  return <div role="img" aria-label={label} className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-muted/50">
    {total > 0 && visible.map(p => <span key={p.key} title={`${p.label}: ${money(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} className="h-full first:rounded-s-full last:rounded-e-full" />)}
  </div>;
}

// Donut: each segment a 2px-gapped arc on circumference 100; a 2px surface ring separates fills.
function Donut({ parts, total, currency, hover, onHover }: { parts: Array<{ key: string; label: string; color: string; value: number }>; total: number; currency: string; hover: string | null; onHover: (key: string | null) => void }) {
  const visible = parts.filter(p => p.value > 0);
  let offset = 25; // start at 12 o'clock (circumference 100, quarter = 25)
  return <div className="relative mx-auto size-40 shrink-0">
    <svg viewBox="0 0 42 42" className="size-full -rotate-90" role="img" aria-label={`Cost breakdown donut, total ${money(total, currency)}`}>
      <circle cx="21" cy="21" r="15.915" fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="5" />
      {total > 0 && visible.map(p => {
        const pct = (p.value / total) * 100;
        const dash = Math.max(0, pct - (visible.length > 1 ? 1.5 : 0));
        const node = <circle key={p.key} cx="21" cy="21" r="15.915" fill="none" stroke={p.color} strokeWidth={hover === p.key ? 6.5 : 5}
          strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={offset} strokeLinecap="round"
          onMouseEnter={() => onHover(p.key)} onMouseLeave={() => onHover(null)}
          className="cursor-pointer transition-[stroke-width]" style={{ opacity: hover && hover !== p.key ? 0.45 : 1 }} />;
        offset -= pct;
        return node;
      })}
    </svg>
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
      {(() => { const sel = visible.find(p => p.key === hover); return sel
        ? <><p className="text-base font-semibold tabular-nums text-foreground">{Math.round(sel.value / total * 100)}%</p><p className="max-w-[5rem] text-[10px] leading-tight text-muted-foreground">{sel.label.split(' (')[0]}</p></>
        : <><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p><p className="text-lg font-semibold tabular-nums text-foreground">{money(total, currency)}</p></>; })()}
    </div>
  </div>;
}

function CostBreakdown({ data }: { data: AgentCallAnalytics }) {
  const [hover, setHover] = useState<string | null>(null);
  const split = splitCost({ ...data.totals.components, modelDetail: data.totals.modelDetail });
  const parts = COMPONENTS.map(p => ({ ...p, value: split[p.key] }));
  const total = parts.reduce((s, p) => s + p.value, 0);
  const t = data.totals.tokens;
  const tokenRows: Array<[string, number]> = [['Input audio', t.inputAudio], ['  of which cached', t.inputCachedAudio], ['Input text', t.inputText], ['  of which cached', t.inputCachedText], ['Output audio', t.outputAudio], ['Output text', t.outputText]];
  return <section className={`${panelClass} min-w-0 xl:col-span-2`}>
    <h3 className="text-sm font-semibold">Where the money goes</h3>
    <p className="mt-1 text-xs text-muted-foreground">Cost components across all calls in this period.</p>
    {total > 0 ? <div className="mt-4"><Donut parts={parts} total={total} currency={data.currency} hover={hover} onHover={setHover} /></div>
      : <p className="mt-6 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No priced calls yet. Costs require recorded usage, model identity and a known rate card.</p>}
    <ul className="mt-4 space-y-2.5 text-xs">{parts.map(p => <li key={p.key} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)} className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition ${hover === p.key ? 'bg-muted/50' : ''}`}><span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} /><span className="flex-1 text-muted-foreground">{p.label}</span><span className="tabular-nums text-foreground">{money(p.value, data.currency)}</span><span className="w-10 text-end tabular-nums text-muted-foreground">{total ? `${Math.round(p.value / total * 100)}%` : '—'}</span></li>)}</ul>
    <div className="mt-5 border-t border-border pt-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Token usage</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">{tokenRows.map(([label, value], i) => <div key={i} className="contents"><dt className={label.startsWith('  ') ? 'ps-3 text-muted-foreground' : 'text-muted-foreground'}>{label.trim()}</dt><dd className="text-end tabular-nums text-foreground">{num(value)}</dd></div>)}<dt className="font-medium text-foreground">Total</dt><dd className="text-end font-semibold tabular-nums text-foreground">{num(t.total)}</dd></dl>
    </div>
  </section>;
}

type TrendDay = AgentCallAnalytics['byDay'][number];
type TrendMetric = { key: string; label: string; color: string; value: (d: TrendDay) => number; fmt: (v: number) => string; cumulative?: boolean };

// Single-series area+line over time; crosshair and tooltip on hover (dataviz interaction spec).
function TrendChart({ days, metric, currency }: { days: TrendDay[]; metric: TrendMetric; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const raw = days.map(metric.value);
  const series = metric.cumulative ? raw.reduce<number[]>((a, v, i) => [...a, (a[i - 1] || 0) + v], []) : raw;
  const max = Math.max(...series, metric.key === 'calls' ? 1 : 0.0001);
  const n = series.length;
  const x = (i: number) => n <= 1 ? 500 : (i / (n - 1)) * 1000;
  const y = (v: number) => 100 - (v / max) * 92 - 4; // 4% headroom top and bottom
  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(2)}`).join(' ');
  const area = n > 1 ? `${line} L1000,100 L0,100 Z` : '';
  const active = hover != null ? days[hover] : null;
  const chartId = useId().replace(/:/g, '');
  const gid = `trend-${chartId}-${metric.key}`;
  return <figure className="min-w-0" aria-label={`${metric.label} chart in ${currency}, UTC`}>
    <div className="flex min-h-9 items-start justify-end text-end text-xs" aria-live="polite">
      {active ? <div><p className="font-medium text-foreground">{new Date(`${active.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {metric.fmt(series[hover!])}</p><p className="text-muted-foreground">{active.calls} call{active.calls === 1 ? '' : 's'} · {active.connected} connected · {duration(active.seconds)} talk</p></div> : <p className="text-muted-foreground">Hover a day for details</p>}
    </div>
    <div dir="ltr" className="relative mt-2 h-48 min-w-0 overflow-hidden">
      <div aria-hidden className="absolute inset-0 flex flex-col justify-between">{[1, 0.5, 0].map(f => <div key={f} className="flex items-center gap-2"><span className="w-12 shrink-0 text-end text-[10px] tabular-nums text-muted-foreground">{metric.key === 'calls' && !Number.isInteger(max * f) ? '' : metric.fmt(max * f)}</span><span className="h-px flex-1 bg-white/[0.06]" /></div>)}</div>
      <div data-testid="cost-trend-plot" className="absolute inset-y-0 start-14 end-0 min-w-0 overflow-hidden">
      <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none" className="block h-full w-full" aria-hidden>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={metric.color} stopOpacity="0.35" /><stop offset="100%" stopColor={metric.color} stopOpacity="0" /></linearGradient></defs>
        {area && <path d={area} fill={`url(#${gid})`} />}
        <path d={line} fill="none" stroke={metric.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {n === 1 && <circle cx="500" cy={y(series[0])} r="3" fill={metric.color} />}
      </svg>
      </div>
      {/* Hit targets + crosshair + active marker in an HTML overlay so the SVG can stretch freely. */}
      <div className="absolute inset-y-0 start-14 end-0 flex" onMouseLeave={() => setHover(null)}>
        {hover != null && <span aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-sky-300/40" style={{ left: `${n <= 1 ? 50 : (hover / (n - 1)) * 100}%` }} />}
        {hover != null && <span aria-hidden className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-sky-300 shadow" style={{ left: `${n <= 1 ? 50 : (hover / (n - 1)) * 100}%`, top: `${y(series[hover])}%` }} />}
        {days.map((d, i) => <button key={d.date} type="button" aria-label={`${d.date}: ${metric.fmt(series[i])}`} onClick={() => setHover(i)} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} style={{ flex: n > 1 && (i === 0 || i === n - 1) ? 0.5 : 1 }} className="h-full min-w-0 outline-none focus-visible:bg-sky-300/10" />)}
      </div>
    </div>
    <div dir="ltr" className="mt-2 flex justify-between ps-14 text-[10px] text-muted-foreground"><span>{days[0]?.date}</span><span>{days.at(-1)?.date}</span></div>
  </figure>;
}

function CostTrend({ data }: { data: AgentCallAnalytics }) {
  const days = data.byDay;
  const metrics: TrendMetric[] = [
    { key: 'cost', label: 'Daily cost', color: '#3b82f6', value: d => d.cost, fmt: v => money(v, data.currency) },
    { key: 'cumulative', label: 'Cumulative', color: '#0891b2', value: d => d.cost, fmt: v => money(v, data.currency), cumulative: true },
    { key: 'perMinute', label: 'Cost / min', color: '#db2777', value: d => d.seconds > 0 ? d.cost / (d.seconds / 60) : 0, fmt: v => money(v, data.currency) },
    { key: 'calls', label: 'Calls', color: '#d97706', value: d => d.calls, fmt: v => num(Math.round(v)) },
  ];
  const [metricKey, setMetricKey] = useState('cost');
  const metric = metrics.find(m => m.key === metricKey)!;
  return <section className={`${panelClass} min-w-0 xl:col-span-3`} aria-label="Call cost trend">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-primary" />Cost over time</h3><p className="mt-1 text-xs text-muted-foreground">Spend trend across the selected period.</p></div>
      <div role="radiogroup" aria-label="Trend metric" className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {metrics.map(m => <button key={m.key} role="radio" aria-checked={metricKey === m.key} onClick={() => setMetricKey(m.key)} className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${metricKey === m.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`} style={metricKey === m.key ? { background: m.color } : undefined}>{m.label}</button>)}
      </div>
    </div>
    {metricKey !== 'calls' && !data.totals.totalCost && !!data.billing?.unpricedCalls ? <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Cost trend is unavailable until model identity and pricing details are recorded.</p>
      : days.length ? <TrendChart days={days} metric={metric} currency={data.currency} />
      : <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No calls in this period.</p>}
  </section>;
}

function BehaviorPanel({ data }: { data: AgentCallAnalytics }) {
  const toneTotal = Object.values(data.tone).reduce((s, v) => s + v, 0);
  const outcomes = (Object.keys(OUTCOMES) as CallOutcomeProfile[]).map(k => [k, data.outcomes[k] || 0] as const).filter(([, v]) => v > 0);
  const maxOutcome = Math.max(...outcomes.map(([, v]) => v), 1);
  return <div className="grid gap-5 lg:grid-cols-2">
    <section className={panelClass}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Smile className="size-4 text-primary" />Lead tone</h3>
      <p className="mt-1 text-xs text-muted-foreground">The agent&apos;s reading of each connected lead, from what they said.</p>
      <div className="mt-4 space-y-2.5">{TONES.map(t => { const v = data.tone[t.key] || 0; return <div key={t.key} className="flex items-center gap-3 text-xs">
        <span className={`flex w-24 shrink-0 items-center gap-2 ${t.className}`}><span className={`size-2 rounded-full ${t.dot}`} />{t.label}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50"><span className={`block h-full rounded-full ${t.dot}`} style={{ width: `${toneTotal ? v / toneTotal * 100 : 0}%` }} /></span>
        <span className="w-12 text-end tabular-nums text-muted-foreground">{v}</span>
      </div>; })}</div>
    </section>
    <section className={panelClass}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="size-4 text-primary" />How leads responded</h3>
      <p className="mt-1 text-xs text-muted-foreground">Recorded call outcomes, per attempt.</p>
      <div className="mt-4 space-y-2.5">{outcomes.map(([k, v]) => <div key={k} className="flex items-center gap-3 text-xs">
        <span className="w-40 shrink-0 text-muted-foreground">{OUTCOMES[k]}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50"><span className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${v / maxOutcome * 100}%` }} /></span>
        <span className="w-12 text-end tabular-nums text-muted-foreground">{v}</span>
      </div>)}</div>
    </section>
  </div>;
}

function ToneBadge({ tone }: { tone: LeadTone | null }) {
  const t = TONES.find(x => x.key === (tone || 'unrecorded'))!;
  return <span className={`inline-flex items-center gap-1.5 text-xs ${t.className}`}><span className={`size-1.5 rounded-full ${t.dot}`} />{tone ? t.label : '—'}</span>;
}

function CallList({ calls, onOpen }: { calls: AnalyzedCall[]; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return <div className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="hidden grid-cols-[1.4fr_1fr_0.7fr_1fr_0.8fr_0.8fr_0.8fr_24px] gap-3 border-b border-border bg-white/[0.02] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
      <span>Lead</span><span>When</span><span>Duration</span><span>Outcome</span><span>Tone</span><span className="text-end">Tokens</span><span className="text-end">Cost</span><span />
    </div>
    <ul className="divide-y divide-white/[0.06]">{calls.map(call => { const open = expanded === call.id; return <li key={call.id}>
      <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : call.id)} className="grid w-full grid-cols-2 items-center gap-3 px-4 py-3 text-start text-sm transition hover:bg-muted/40 lg:grid-cols-[1.4fr_1fr_0.7fr_1fr_0.8fr_0.8fr_0.8fr_24px]">
        <span className="min-w-0"><span className="block truncate font-medium text-foreground">{call.leadName}</span><span className="block truncate text-[11px] text-muted-foreground">{call.leadPhone || call.campaignName}</span></span>
        <span className="text-xs text-muted-foreground max-lg:text-end">{when(call.at)}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{call.durationSeconds ? duration(call.durationSeconds) : '—'}</span>
        <span className="max-lg:text-end">{call.disposition ? <StatusPill status={call.disposition} /> : <span className="text-xs text-muted-foreground">{call.state}</span>}</span>
        <span><ToneBadge tone={call.behavior.tone} /></span>
        <span className="text-xs tabular-nums text-muted-foreground max-lg:text-end lg:text-end">{call.cost.tokens ? num(call.cost.tokens.total) : '—'}</span>
        <span className="font-semibold tabular-nums text-foreground lg:text-end">{callCostLabel(call)}</span>
        <ChevronDown className={`size-4 text-muted-foreground transition max-lg:justify-self-end ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <CallDetail call={call} onOpen={onOpen} />}
    </li>; })}</ul>
  </div>;
}

function CallDetail({ call, onOpen }: { call: AnalyzedCall; onOpen: (id: string) => void }) {
  const split = splitCost(call.cost.components);
  const parts = COMPONENTS.map(p => ({ ...p, value: split[p.key] }));
  const p = call.behavior.participation;
  const t = call.cost.tokens;
  return <div className="grid gap-4 border-t border-border bg-gradient-to-b from-blue-950/20 to-transparent px-4 py-5 lg:grid-cols-[1.5fr_1fr]">
    <div className="space-y-4">
      <div><p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"><FileText className="size-3.5" />Summary{call.notesSource === 'ai_agent' && <span className="rounded-full bg-sky-400/10 px-2 py-0.5 normal-case tracking-normal text-primary">written by agent</span>}</p>
        <p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">{call.summary || 'No summary was recorded for this call.'}</p>
        {call.description && call.description !== call.summary && <p className="mt-2 text-xs text-muted-foreground">{call.description}</p>}</div>
      {call.blockers.length > 0 && <div><p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Blockers</p><ul className="mt-2 list-disc space-y-1 ps-4 text-xs text-amber-200/90">{call.blockers.map(b => <li key={b}>{b}</li>)}</ul></div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Lead behavior" value={OUTCOMES[call.behavior.outcome]} />
        <Mini label="Tone" value={<ToneBadge tone={call.behavior.tone} />} />
        <Mini label="Turns (lead / agent)" value={`${p.leadTurns} / ${p.agentTurns}`} />
        <Mini label="Valid answers" value={`${call.behavior.answers.valid} / ${call.behavior.answers.total}`} />
      </div>
      {call.behavior.toneEvidence && <p className="rounded-xl border border-border bg-white/[0.02] p-3 text-xs italic text-muted-foreground">“{call.behavior.toneEvidence}”</p>}
      {p.interruptions > 0 && <p className="text-xs text-muted-foreground">The lead interrupted the agent {p.interruptions} time{p.interruptions === 1 ? '' : 's'}.</p>}
      {call.failure && <p className="text-xs text-rose-300">{call.failure.code}: {call.failure.message}</p>}
      <button type="button" className={secondaryClass} onClick={() => onOpen(call.id)}><MessageSquareText className="size-4" />Open conversation &amp; transcript</button>
    </div>
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between"><p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{call.cost.estimate ? 'Estimated call cost' : 'Recorded call cost'}</p><p className="text-xl font-semibold tabular-nums text-foreground">{callCostLabel(call)}</p></div>
      <div className="mt-3"><StackedBar parts={parts} label="Call cost breakdown" /></div>
      <dl className="mt-3 space-y-1.5 text-xs">{parts.filter(x => x.value > 0).map(x => <div key={x.key} className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: x.color }} /><dt className="flex-1 text-muted-foreground">{x.label}</dt><dd className="tabular-nums text-foreground">{money(x.value, call.cost.currency)}</dd></div>)}</dl>
      {t ? <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-xs">
        {([['Audio in', t.inputAudio], ['Audio out', t.outputAudio], ['Text in', t.inputText], ['Text out', t.outputText], ['Cached in', call.costDiagnostics?.cachedInputTokens ?? t.inputCachedAudio + t.inputCachedText], ['Total tokens', t.total]] as Array<[string, number]>).map(([l, v]) => <div key={l} className="contents"><dt className="text-muted-foreground">{l}</dt><dd className="text-end tabular-nums text-foreground">{num(v)}</dd></div>)}
      </dl> : <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">No token usage was reported for this call.</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{costSourceText(call)}</p>
      <CallCostDiagnostics call={call} />
    </div>
  </div>;
}

function CallCostDiagnostics({ call }: { call: AnalyzedCall }) {
  const d = call.costDiagnostics;
  return <section aria-label="Cost diagnostics" className="mt-4 space-y-3 border-t border-border pt-3 text-xs">
    <dl className="grid grid-cols-2 gap-2">
      {[
        ['Model', call.cost.model || 'Not recorded'],
        ['AI provider', call.aiVoice?.provider || call.cost.models?.[0]?.provider || 'Not recorded'],
        ['Provider fallback', call.aiVoice ? call.aiVoice.fallback ? 'Yes' : 'No' : 'Not recorded'],
        ['Estimated cost / minute', d?.estimatedCostPerMinute == null ? 'Not recorded' : money(d.estimatedCostPerMinute, call.cost.currency)],
        ['Cache hit', d?.cacheHitPercent == null ? 'Not recorded' : `${d.cacheHitPercent.toFixed(1)}%`],
        ['Estimated savings from caching', d?.estimatedCacheSavings == null ? 'Not recorded' : money(d.estimatedCacheSavings, call.cost.currency)],
        ['Provider responses (includes tools)', d?.responseCount == null ? 'Not recorded' : num(d.responseCount)],
        ['Average output tokens / response', d?.averageOutputTokens == null ? 'Not recorded' : d.averageOutputTokens.toFixed(1)],
      ].map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="text-end text-foreground">{value}</dd></div>)}
    </dl>
    {!!call.aiVoice?.attempts?.length && <details><summary className="cursor-pointer text-primary">Provider connection history</summary><ul className="mt-2 space-y-1">{call.aiVoice.attempts.map((attempt, index) => <li key={`${attempt.provider}:${index}`}>{attempt.provider} · {attempt.model} · {attempt.status}{attempt.reason ? ` · ${attempt.reason}` : ''} · {attempt.latencyMs} ms</li>)}</ul></details>}
    {!!d?.responses.length && <details><summary className="cursor-pointer text-primary">Per-response usage and estimated cost</summary>
      <div className="mt-2 max-h-72 overflow-auto"><table className="w-full text-end"><thead><tr>{['Response', 'Input', 'Output', 'Cache', 'TTFT ms', 'Est. cost'].map(h => <th key={h} className="p-1">{h}</th>)}</tr></thead>
        <tbody>{d.responses.map((r, i) => <tr key={r.responseId} title={`${r.responseId} · ${r.cacheObservation}${r.cancelled ? ' · cancelled' : ''}`}>
          <td className="p-1">{i + 1}{r.cancelled ? ' (cancelled)' : ''}</td><td>{num(r.tokens.input)}</td><td>{num(r.tokens.output)}</td><td>{num(r.inputCachedTokens ?? r.tokens.inputCachedAudio + r.tokens.inputCachedText)}</td><td>{r.ttftMs ?? '—'}</td><td>{r.estimatedCost == null ? 'Not recorded' : money(r.estimatedCost, call.cost.currency)}</td>
        </tr>)}</tbody></table></div>
      {!!d.droppedResponses && <p>{d.droppedResponses} additional responses are included in aggregate usage but exceed the detail retention limit.</p>}
    </details>}
    <p className="text-[11px] leading-relaxed text-muted-foreground">Token counts are provider usage via the SDK. Costs and cache savings use rate-card estimates. Before/after reductions and monthly projections require matched measured calls and a supplied monthly volume.</p>
  </section>;
}

function OptimizationComparison({ calls }: { calls: AnalyzedCall[] }) {
  const [beforeId, setBeforeId] = useState(''); const [afterId, setAfterId] = useState('');
  const [minutes, setMinutes] = useState('');
  const result = compareCallCosts(calls.find(c => c.id === beforeId), calls.find(c => c.id === afterId), Number(minutes));
  return <section aria-label="Cost optimization comparison" className={`${panelClass} space-y-3 text-xs`}>
    <h3 className="font-semibold">Cost optimization comparison</h3>
    <div className="flex flex-wrap gap-3">{[
      { label: 'Previous call', value: beforeId, set: setBeforeId }, { label: 'Current call', value: afterId, set: setAfterId },
    ].map(({ label, value, set }) => <label key={label} className="flex flex-col gap-1">{label}<select value={value} onChange={e => set(e.target.value)} className="rounded border border-border bg-card p-2"><option value="">Select recorded call</option>{calls.map(c => <option key={c.id} value={c.id}>{c.leadName} · {new Date(c.at).toLocaleString()}</option>)}</select></label>)}
      <label className="flex flex-col gap-1">Monthly connected minutes<input type="number" min="0" value={minutes} onChange={e => setMinutes(e.target.value)} className="rounded border border-border bg-card p-2" /></label>
    </div>
    {result ? <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[
      ['Previous cost / min', money(result.previous)], ['Current cost / min', money(result.current)],
      ['Reduction / min', money(result.reduction)], ['Reduction', result.percent == null ? 'Unavailable' : `${result.percent.toFixed(1)}%`],
      ['Projected monthly savings', result.monthly == null ? 'Enter monthly minutes' : money(result.monthly)],
    ].map(([l, v]) => <div key={l}><dt className="text-muted-foreground">{l}</dt><dd className="mt-1 text-foreground">{v}</dd></div>)}</dl>
      : <p className="text-muted-foreground">Select two completed calls with matching lead, model, provider, questionnaire, audio settings and qualification results. Older calls without configuration evidence cannot establish a matched comparison.</p>}
    <p className="text-muted-foreground">Observed usage priced at recorded rates. These estimates compare two calls; they do not establish a causal saving or reconcile provider billing. Monthly projections use only the volume you enter.</p>
  </section>;
}

const costSourceText = (call: AnalyzedCall) => {
  const c = call.cost;
  if (c.source === 'token_usage') return c.unpriced ? 'Cost is incomplete: some model, provider or token details could not be priced. Recorded usage is preserved; this is not a zero-cost call.' : `Estimated from ${c.model || 'model'} token usage at list prices${c.pricedAs && c.pricedAs !== c.model ? ` (priced as ${c.pricedAs})` : ''}. Input caching is discounted. This is not a provider invoice amount.`;
  if (c.source === 'per_minute_estimate') return `Estimated from the configured blended per-minute rate${c.billedMinutes ? ` · ${c.billedMinutes} billed min` : ''}.`;
  if (c.source === 'provider_reported') return 'Reported by the provider.';
  return call.durationSeconds ? 'No usage was reported for this call, so no cost was recorded.' : 'The call did not connect, so nothing was consumed.';
};

const callCostLabel = (call: AnalyzedCall) => (call.cost.unpriced && !call.cost.amount) || (call.cost.source === 'none' && call.durationSeconds > 0)
  ? 'Not recorded' : `${money(call.cost.amount, call.cost.currency)}${call.cost.unpriced ? ' (partial)' : ''}`;

function BillingComparison({ data, range }: { data: AgentCallAnalytics; range: string }) {
  const model = data.billing?.modelEstimate ?? data.totals.components.model;
  const additional = data.billing?.additionalEstimate ?? data.totals.components.telephony + data.totals.components.platform;
  const window = rangeParams(range);
  return <section aria-label="Billing comparison" className="min-w-0 rounded-2xl border border-sky-400/20 bg-sky-950/20 p-4 text-xs leading-relaxed text-muted-foreground">
    <p className="font-semibold text-foreground">Usage estimate · not reconciled with provider billing</p>
    <p className="mt-1">This agent’s Realtime model estimate: <strong>{model === 0 && data.billing?.unpricedCalls ? 'Not recorded' : money(model, data.currency)}</strong>. Additional carrier/platform estimates: <strong>{money(additional, data.currency)}</strong>.</p>
    <p className="mt-1">{window.from ? `${window.from.slice(0, 10)} through ${new Date(new Date(window.to!).getTime() - 1).toISOString().slice(0, 10)}` : 'All recorded dates'} · UTC · campaign calls only. Test calls are listed separately.</p>
    <p className="mt-1">Compare the same provider, project, API key and UTC dates, including Live / Realtime audio usage. Input transcription on OpenAI and post-call analysis are separate services and are excluded from this estimate. Gemini uses its Live transcription.</p>
    {!!data.billing?.unpricedCalls && <p className="mt-1 text-amber-300">{data.billing.unpricedCalls} call(s) have incomplete pricing; the total includes only the portions that can be priced.</p>}
    {!!data.billing?.foreignCurrencyCalls && <p className="mt-1 text-amber-300">{data.billing.foreignCurrencyCalls} call(s) in another currency are excluded from USD totals. Their original amounts remain in the call details.</p>}
    <a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-primary underline">Open OpenAI usage</a>
    <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer" className="ms-4 mt-2 inline-block font-medium text-primary underline">Gemini pricing</a>
  </section>;
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl border border-border bg-white/[0.02] p-2.5"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><div className="mt-1 text-xs font-medium text-foreground">{value}</div></div>;
}

function LeadTable({ leads, onOpen }: { leads: AnalyzedLead[]; onOpen: (id: string) => void }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card">
    <table className="w-full min-w-[920px] text-sm">
      <thead><tr className="border-b border-border bg-white/[0.02] text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {['Lead', 'Calls', 'Talk time', 'Tokens', 'Total cost', 'Avg / call', 'Last outcome', 'Tone', 'Latest summary'].map((h, i) => <th key={h} className={`px-4 py-2.5 font-semibold ${i >= 1 && i <= 5 ? 'text-end' : 'text-start'}`}>{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-white/[0.06]">{leads.map(l => <tr key={l.leadId} tabIndex={0} onClick={() => onOpen(l.lastCallId)} onKeyDown={e => { if (e.key === 'Enter') onOpen(l.lastCallId); }} className="cursor-pointer outline-none transition hover:bg-muted/40 focus-visible:bg-muted/50">
        <td className="px-4 py-3"><p className="font-medium text-foreground">{l.name}</p><p className="text-[11px] text-muted-foreground">{l.phone || '—'}</p></td>
        <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{l.calls}<span className="text-muted-foreground"> · {l.connected} conn.</span></td>
        <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{duration(l.seconds)}</td>
        <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{num(l.tokens)}</td>
        <td className="px-4 py-3 text-end font-semibold tabular-nums text-foreground">{l.pricingIncomplete && !l.cost ? 'Not recorded' : money(l.cost)}</td>
        <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{l.pricingIncomplete && !l.cost ? 'Not recorded' : money(l.avgCostPerCall)}</td>
        <td className="px-4 py-3">{l.lastDisposition ? <StatusPill status={l.lastDisposition} /> : '—'}</td>
        <td className="px-4 py-3"><ToneBadge tone={l.lastTone} /></td>
        <td className="max-w-xs px-4 py-3"><p className="line-clamp-2 text-xs text-muted-foreground">{l.lastSummary || '—'}</p></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function PricingNote({ data }: { data: AgentCallAnalytics }) {
  const notes = [
    `AI model cost is estimated from reported ${data.pricing.model || 'model'} usage at list prices, with cached input discounted; your provider invoice is authoritative.`,
    data.pricing.telephonyRatePerMinute ? `Telephony is included at ${money(data.pricing.telephonyRatePerMinute)}/min on carrier calls.` : 'Telephony minutes are not included because no carrier rate is configured.',
    data.pricing.platformRatePerMinute ? `Platform minutes are included at ${money(data.pricing.platformRatePerMinute)}/min.` : null,
    data.totals.callsWithoutCost ? `${data.totals.callsWithoutCost} connected call(s) lack complete pricing evidence; their cost is not recorded.` : null,
    data.testing.calls ? `${data.testing.calls} test call(s) (${money(data.testing.totalCost)}) are excluded from these figures.` : null,
  ].filter(Boolean);
  return <div className="flex gap-3 rounded-2xl border border-border bg-white/[0.02] p-4 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-primary/70" /><ul className="space-y-1">{notes.map(n => <li key={n}>{n}</li>)}</ul></div>;
}
