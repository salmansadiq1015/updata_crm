'use client';
import { ProviderCostComparisonPanel } from './provider-cost-comparison';

import { compareCallCosts } from '../cost-comparison';
import { createContext, useContext, useId, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Activity, ChevronDown, Clock3, Coins, Cpu, Download, FileText, Gauge, Info, Loader2, MessageSquareText, Phone, PhoneIncoming, Smile, Sparkles, TrendingUp, UserPlus, Users } from 'lucide-react';
import { downloadBlob } from '@/lib/api/download';
import { showError } from '@/lib/toast';
import { useAgentCallAnalytics } from '../hooks/use-calling-agents';
import { callingAgentApi } from '../services/calling-agent-api';
import type { AgentCallAnalytics, AnalyzedCall, AnalyzedLead, CallOutcomeProfile, LeadTone } from '../types/ai-calling-types';
import { CallDetailDrawer } from './call-detail-drawer';
import { StatusPill } from './status-pill';
import { AgentTabs, panelClass, secondaryClass } from './calling-agent-primitives';
import { useInboundCostAnalytics } from '@/modules/inboundCalls/hooks/use-inbound-calls';
import { inboundCallsApi } from '@/modules/inboundCalls/services/inbound-calls-api';
import { enumLabel, inboundCostSourceText, OUTCOME_ORDER } from '@/modules/inboundCalls/inbound-domain';
import { OutcomePill } from '@/modules/inboundCalls/ui/inbound-primitives';
import { useInboundLanguage } from '@/modules/inboundCalls/ui/use-inbound-language';

// The incoming-call drawer is only needed for inbound rows; load it on demand.
const InboundCallDrawer = dynamic(() => import('@/modules/inboundCalls/ui/call-detail-drawer').then((m) => m.CallDetailDrawer));

/**
 * Which calls to analyse. `agent` = one outbound agent's campaign calls (AI Calling); `inbound` =
 * incoming calls on the connected phones (all agents, or one). Both endpoints return the same shape.
 */
export type CallAnalyticsSource = { kind: 'agent'; agentId: string } | { kind: 'inbound'; agentId?: string | null };

type Vars = Record<string, string | number | null | undefined>;
type Tx = (key: string, en?: string, vars?: Vars) => string;
const fill = (en = '', vars?: Vars) => (vars ? en.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] != null ? String(vars[k]) : m)) : en);

// Cost components in fixed order (validated categorical palette on the dark surface).
const COMPONENTS = [
  { key: 'voice', label: 'AI voice (audio tokens)', color: '#3b82f6' },
  { key: 'telephony', label: 'Telephony minutes', color: '#d97706' },
  { key: 'text', label: 'AI text tokens', color: '#0891b2' },
  { key: 'platform', label: 'Platform minutes', color: '#db2777' },
  { key: 'other', label: 'Reported / unsplit cost', color: '#8b5cf6' },
] as const;
// Incoming-call palette: the same hues, with slate (not violet) for the unsplit remainder.
const INBOUND_COLORS: Record<string, string> = { other: '#64748b' };
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

/**
 * Copy + labels for the current source. Outbound renders the original English verbatim;
 * incoming calls go through the app dictionary (inbound.costs.*) so they are translated.
 */
interface AnalyticsCopy { inbound: boolean; tx: Tx; outcome: (key: string | null | undefined) => string; color: (key: string, fallback: string) => string }
const AGENT_COPY: AnalyticsCopy = {
  inbound: false, tx: (_key, en, vars) => fill(en, vars),
  outcome: (key) => (key ? OUTCOMES[key as CallOutcomeProfile] ?? key : ''), color: (_key, fallback) => fallback,
};
const CopyContext = createContext<AnalyticsCopy>(AGENT_COPY);
const useCopy = () => useContext(CopyContext);

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
export const estimateMoney = (data: AgentCallAnalytics, value: number | null | undefined, notRecorded = 'Not recorded') => value != null && data.totals.totalCost === 0 && (data.billing?.unpricedCalls || data.billing?.foreignCurrencyCalls)
  ? notRecorded : money(value, data.currency);
const num = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat(undefined, { notation: value >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
const duration = (seconds: number) => seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.round(seconds % 3600 / 60)}m` : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const splitCost = (c: { modelDetail?: { audioIn: number; audioOut: number; textIn: number; textOut: number }; model: number; telephony: number; platform: number; other?: number }) => {
  const d = c.modelDetail;
  const voice = d ? d.audioIn + d.audioOut : 0;
  const text = d ? d.textIn + d.textOut : 0;
  return { voice, telephony: c.telephony, text, platform: c.platform, other: (c.other || 0) + (d ? 0 : c.model) };
};
const useComponents = () => {
  const { tx, color } = useCopy();
  return COMPONENTS.map((c) => ({ ...c, label: tx(`inbound.costs.comp.${c.key}`, c.label), color: color(c.key, c.color) }));
};
/** "Not recorded" in the current language. */
const useNotRecorded = () => useCopy().tx('inbound.costs.notRecorded', 'Not recorded');

export function AgentCallAnalytics({ agentId, source: sourceProp, onAgent }: { agentId?: string; source?: CallAnalyticsSource; onAgent?: (agentId: string) => void }) {
  const source: CallAnalyticsSource = sourceProp ?? { kind: 'agent', agentId: agentId ?? '' };
  const inbound = source.kind === 'inbound';
  const { t } = useInboundLanguage();
  const copy = useMemo<AnalyticsCopy>(() => (inbound ? {
    inbound: true, tx: (key, en, vars) => t(key, en, vars),
    outcome: (key) => enumLabel(t, 'outcome', key, ''), color: (key, fallback) => INBOUND_COLORS[key] ?? fallback,
  } : AGENT_COPY), [inbound, t]);
  const { tx } = copy;
  const [range, setRange] = useState('7');
  const [view, setView] = useState('calls');
  const [exporting, setExporting] = useState(false);
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const inboundParams = { ...rangeParams(range), ...(source.kind === 'inbound' && source.agentId ? { agentId: source.agentId } : {}) };
  const agentQuery = useAgentCallAnalytics(source.kind === 'agent' ? source.agentId : '', rangeParams(range), !inbound);
  const inboundQuery = useInboundCostAnalytics(inboundParams, inbound);
  const query = inbound ? inboundQuery : agentQuery;
  const data = query.data;

  const exportCsv = async () => {
    setExporting(true);
    try {
      if (source.kind === 'inbound') downloadBlob(await inboundCallsApi.costsCsv(inboundParams), `incoming-call-costs-${range}.csv`, 'text/csv;charset=utf-8');
      else downloadBlob(await callingAgentApi.callAnalyticsCsv(source.agentId, rangeParams(range)), `agent-call-analytics-${range}.csv`, 'text/csv;charset=utf-8');
    }
    catch (e) { showError(e); } finally { setExporting(false); }
  };

  return <CopyContext.Provider value={copy}><div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold tracking-tight">{inbound ? tx('inbound.costs.title', 'Call costs') : 'Call analytics'}</h2><p className="mt-1 text-xs text-muted-foreground">{inbound ? tx('inbound.costs.subtitle', 'Cost, duration, outcome and caller behaviour for every incoming call.') : 'Cost, duration, outcome and lead behavior for every call this agent placed.'}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label={tx('inbound.costs.dateRange', 'Date range')} className="flex rounded-xl border border-border bg-muted/40 p-1">
          {RANGES.map(r => <button key={r.value} role="radio" aria-checked={range === r.value} onClick={() => setRange(r.value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${range === r.value ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-foreground shadow-md shadow-blue-950/40' : 'text-muted-foreground hover:text-foreground'}`}>{tx(`inbound.costs.range.${r.value}`, r.label)}</button>)}
        </div>
        <button className={secondaryClass} disabled={exporting || !data?.totals.calls} onClick={() => void exportCsv()}>{exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}{tx('inbound.costs.export', 'Export CSV')}</button>
      </div>
    </div>

    {!data ? <div className={`${panelClass} flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground`}>{query.isError ? <span role="alert">{tx('inbound.costs.loadError', 'Analytics could not be loaded.')} <button className="font-semibold text-primary underline" onClick={() => void query.refetch()}>{tx('inbound.costs.retry', 'Try again')}</button></span> : <><Loader2 className="size-4 animate-spin" />{tx('inbound.costs.loading', 'Loading call analytics…')}</>}</div>
      : !data.totals.calls ? <EmptyState testing={data.testing} /> : <>
        <CostHero data={data} />
        <BillingComparison data={data} range={range} />
        <ProviderCostComparisonPanel data={data.providerComparison} />
        {!inbound && <OptimizationComparison calls={data.calls} />}
        <div className="grid min-w-0 gap-5 xl:grid-cols-5">
          <CostBreakdown data={data} />
          <CostTrend data={data} />
        </div>
        {inbound && !(source.kind === 'inbound' && source.agentId) && !!data.byAgent?.length && <ByAgentTable data={data} onAgent={onAgent} />}
        <BehaviorPanel data={data} />
        <AgentTabs label={tx('inbound.costs.detailTabs', 'Call analytics detail')} value={view} onChange={setView} items={[{ value: 'calls', label: tx('inbound.costs.tabCalls', 'Calls ({count})', { count: data.totals.calls }) }, { value: 'leads', label: inbound ? tx('inbound.costs.tabCallers', 'Callers ({count})', { count: data.totals.leads }) : `Per lead (${data.totals.leads})` }]}>
          {view === 'calls' ? <CallList calls={data.calls.filter(c => !c.isTest)} onOpen={setOpenCallId} /> : <LeadTable leads={data.leads} onOpen={setOpenCallId} />}
        </AgentTabs>
        {data.truncated && <p className="text-xs text-amber-300">{tx('inbound.costs.truncated', 'Showing the most recent calls. Export CSV for the complete history.')}</p>}
        <PricingNote data={data} />
      </>}
    {openCallId && (inbound ? <InboundCallDrawer callId={openCallId} onClose={() => setOpenCallId(null)} /> : <CallDetailDrawer callId={openCallId} onClose={() => setOpenCallId(null)} />)}
  </div></CopyContext.Provider>;
}

function EmptyState({ testing }: { testing: AgentCallAnalytics['testing'] }) {
  const { inbound, tx } = useCopy();
  return <div className={`${panelClass} flex flex-col items-center gap-3 py-14 text-center`}>
    <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600/25 to-cyan-500/20 ring-1 ring-sky-400/20">{inbound ? <PhoneIncoming className="size-5 text-primary" /> : <TrendingUp className="size-5 text-primary" />}</span>
    {inbound ? <>
      <p className="font-medium">{tx('inbound.costs.emptyTitle', 'No incoming calls in this period')}</p>
      <p className="max-w-md text-xs text-muted-foreground">{tx('inbound.costs.emptyHint', 'Cost, duration, summary and caller behaviour for each call appear here once calls come in.')}{testing.calls ? ` ${tx('inbound.costs.emptyTests', '{count} test call(s) cost {cost} in this period.', { count: testing.calls, cost: money(testing.totalCost) })}` : ''}</p>
    </> : <>
      <p className="font-medium">No campaign calls in this period</p>
      <p className="max-w-md text-xs text-muted-foreground">Cost, duration, summary and behavior for each call appear here once this agent places calls.{testing.calls ? ` ${testing.calls} test call(s) cost ${money(testing.totalCost)} in this period.` : ''}</p>
    </>}
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
  const { inbound, tx } = useCopy();
  const notRecorded = useNotRecorded();
  const t = data.totals;
  const em = (v: number | null | undefined) => estimateMoney(data, v, notRecorded);
  // Incoming: the per-minute unit is AI talk time (a person's own calls cost nothing here).
  const talkSeconds = inbound ? t.aiSeconds ?? t.totalSeconds : t.totalSeconds;
  const minutes = talkSeconds / 60;
  return <div className="grid gap-3 lg:grid-cols-[1.2fr_2fr]">
    <div className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-card p-6 shadow-xl shadow-blue-950/30">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-cyan-400/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 start-10 size-48 rounded-full bg-blue-500/20 blur-3xl" />
      <p className="relative flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary/80"><Coins className="size-4" />{tx('inbound.costs.heroTotal', 'Estimated call total')}</p>
      <p className="relative mt-3 text-4xl font-semibold tabular-nums tracking-tight text-foreground">{em(t.totalCost)}</p>
      <p className="relative mt-2 text-xs text-primary/70">{inbound ? tx('inbound.costs.heroLine', '{calls} calls · {ai} answered by AI · {callers} callers', { calls: t.calls, ai: t.answeredByAi ?? 0, callers: t.leads }) : `${t.calls} calls · ${t.connected} connected · ${t.leads} lead${t.leads === 1 ? '' : 's'}`}</p>
      {/* Cost per minute of talk time — the headline unit rate the user watches. */}
      <div className="relative mt-4 flex items-end justify-between gap-3 rounded-xl border border-cyan-300/20 bg-cyan-400/[0.07] px-3.5 py-3">
        <div><p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary/80"><Gauge className="size-3.5" />{tx('inbound.costs.costPerMinute', 'Cost per minute')}</p><p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{em(t.costPerMinute)}</p></div>
        <p className="pb-1 text-[11px] text-primary/60">{inbound ? tx('inbound.costs.overAiTalk', 'over {amount} of AI talk', { amount: minutes >= 1 ? `${num(Math.round(minutes))} min` : `${talkSeconds}s` }) : `over ${minutes >= 1 ? `${num(Math.round(minutes))} min` : `${t.totalSeconds}s`} of talk`}</p>
      </div>
      <div className="relative mt-3 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
        <div><p className="text-primary/60">{inbound ? tx('inbound.costs.aiTalkTime', 'AI talk time') : 'Talk time'}</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{duration(talkSeconds)}</p></div>
        <div><p className="text-primary/60">{tx('inbound.costs.totalMinutes', 'Total minutes')}</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{num(Number(minutes.toFixed(minutes < 10 ? 1 : 0)))}</p></div>
        <div><p className="text-primary/60">{tx('inbound.costs.tokens', 'Tokens')}</p><p className="mt-0.5 font-semibold tabular-nums text-foreground">{num(t.tokens.total)}</p></div>
      </div>
    </div>
    {inbound ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi accent icon={<Phone className="size-3.5" />} label={tx('inbound.costs.kpi.avgCall', 'Avg / call')} value={em(t.avgCostPerCall)} hint={tx('inbound.costs.kpi.avgCallHint', 'All incoming calls')} />
      <Kpi accent icon={<PhoneIncoming className="size-3.5" />} label={tx('inbound.costs.kpi.avgAi', 'Avg / AI-answered call')} value={em(t.avgCostPerAiCall)} hint={tx('inbound.costs.kpi.avgAiHint', '{count} answered by AI', { count: t.answeredByAi ?? 0 })} />
      <Kpi accent icon={<Users className="size-3.5" />} label={tx('inbound.costs.kpi.perCaller', 'Cost / caller')} value={em(t.avgCostPerLead)} hint={tx('inbound.costs.kpi.perCallerHint', '{count} callers', { count: t.leads })} />
      <Kpi accent icon={<UserPlus className="size-3.5" />} label={tx('inbound.costs.kpi.perNewLead', 'Cost / new lead')} value={em(t.costPerNewLead)} hint={tx('inbound.costs.kpi.perNewLeadHint', '{count} leads created', { count: t.leadsCreated ?? 0 })} />
      <Kpi icon={<Sparkles className="size-3.5" />} label={tx('inbound.costs.kpi.perQualified', 'Cost / qualified')} value={em(t.costPerQualifiedLead)} hint={tx('inbound.costs.kpi.perQualifiedHint', '{count} qualified', { count: t.qualified })} />
      <Kpi icon={<Gauge className="size-3.5" />} label={tx('inbound.costs.kpi.perMinute', 'Cost / minute (AI talk time)')} value={em(t.costPerMinute)} hint={tx('inbound.costs.kpi.perMinuteHint', '{amount} of AI talk', { amount: duration(talkSeconds) })} />
      <Kpi icon={<Clock3 className="size-3.5" />} label={tx('inbound.costs.kpi.avgDuration', 'Avg duration')} value={t.avgDurationSeconds ? duration(t.avgDurationSeconds) : '—'} hint={tx('inbound.costs.kpi.avgDurationHint', 'Answered calls')} />
      <Kpi icon={<TrendingUp className="size-3.5" />} label={tx('inbound.costs.kpi.answerRate', 'Answer rate')} value={t.connectRate == null ? '—' : `${Math.round(t.connectRate * 100)}%`} hint={tx('inbound.costs.kpi.answerRateHint', '{count} missed', { count: t.missed ?? 0 })} />
    </div> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi accent icon={<Phone className="size-3.5" />} label="Avg / call" value={estimateMoney(data, t.avgCostPerCall)} hint="All attempts" />
      <Kpi accent icon={<Phone className="size-3.5" />} label="Avg / connected" value={estimateMoney(data, t.avgCostPerConnectedCall)} hint={`${t.connected} connected`} />
      <Kpi accent icon={<Users className="size-3.5" />} label="Cost / lead attempt" value={estimateMoney(data, t.avgCostPerCall)} hint={`${t.calls} call attempts`} />
      <Kpi accent icon={<Sparkles className="size-3.5" />} label="Cost / qualified" value={estimateMoney(data, t.costPerQualifiedLead)} hint={`${t.qualified} qualified`} />
      <Kpi icon={<Clock3 className="size-3.5" />} label="Avg duration" value={t.avgDurationSeconds ? duration(t.avgDurationSeconds) : '—'} hint="Connected calls" />
      <Kpi icon={<Gauge className="size-3.5" />} label="Cost / minute" value={estimateMoney(data, t.costPerMinute)} hint="Of talk time" />
      <Kpi icon={<Cpu className="size-3.5" />} label="Avg tokens / call" value={num(t.avgTokensPerCall)} hint={`${t.callsWithUsage} calls metered`} />
      <Kpi icon={<TrendingUp className="size-3.5" />} label="Connect rate" value={t.connectRate == null ? '—' : `${Math.round(t.connectRate * 100)}%`} hint={`${t.completed} completed`} />
    </div>}
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
  const { tx } = useCopy();
  const visible = parts.filter(p => p.value > 0);
  let offset = 25; // start at 12 o'clock (circumference 100, quarter = 25)
  return <div className="relative mx-auto size-40 shrink-0">
    <svg viewBox="0 0 42 42" className="size-full -rotate-90" role="img" aria-label={tx('inbound.costs.donutLabel', 'Cost breakdown donut, total {total}', { total: money(total, currency) })}>
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
        : <><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{tx('inbound.costs.total', 'Total')}</p><p className="text-lg font-semibold tabular-nums text-foreground">{money(total, currency)}</p></>; })()}
    </div>
  </div>;
}

function CostBreakdown({ data }: { data: AgentCallAnalytics }) {
  const { inbound, tx } = useCopy();
  const components = useComponents();
  const [hover, setHover] = useState<string | null>(null);
  const split = splitCost({ ...data.totals.components, modelDetail: data.totals.modelDetail });
  const parts = components.map(p => ({ ...p, value: split[p.key] }));
  const total = parts.reduce((s, p) => s + p.value, 0);
  const t = data.totals.tokens;
  const tokenRows: Array<[string, number]> = [
    [tx('inbound.costs.tok.inputAudio', 'Input audio'), t.inputAudio], [`  ${tx('inbound.costs.tok.cached', 'of which cached')}`, t.inputCachedAudio],
    [tx('inbound.costs.tok.inputText', 'Input text'), t.inputText], [`  ${tx('inbound.costs.tok.cached', 'of which cached')}`, t.inputCachedText],
    [tx('inbound.costs.tok.outputAudio', 'Output audio'), t.outputAudio], [tx('inbound.costs.tok.outputText', 'Output text'), t.outputText],
  ];
  return <section className={`${panelClass} min-w-0 xl:col-span-2`}>
    <h3 className="text-sm font-semibold">{tx('inbound.costs.whereMoney', 'Where the money goes')}</h3>
    <p className="mt-1 text-xs text-muted-foreground">{tx('inbound.costs.whereMoneyHint', 'Cost components across all calls in this period.')}</p>
    {total > 0 ? <div className="mt-4"><Donut parts={parts} total={total} currency={data.currency} hover={hover} onHover={setHover} /></div>
      : <p className="mt-6 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{tx('inbound.costs.noPriced', 'No priced calls yet. Costs require recorded usage, model identity and a known rate card.')}</p>}
    <ul className="mt-4 space-y-2.5 text-xs">{parts.filter(p => !inbound || p.key !== 'telephony' || p.value > 0).map(p => <li key={p.key} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)} className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition ${hover === p.key ? 'bg-muted/50' : ''}`}><span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} /><span className="flex-1 text-muted-foreground">{p.label}</span><span className="tabular-nums text-foreground">{money(p.value, data.currency)}</span><span className="w-10 text-end tabular-nums text-muted-foreground">{total ? `${Math.round(p.value / total * 100)}%` : '—'}</span></li>)}</ul>
    <div className="mt-5 border-t border-border pt-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{tx('inbound.costs.tokenUsage', 'Token usage')}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">{tokenRows.map(([label, value], i) => <div key={i} className="contents"><dt className={label.startsWith('  ') ? 'ps-3 text-muted-foreground' : 'text-muted-foreground'}>{label.trim()}</dt><dd className="text-end tabular-nums text-foreground">{num(value)}</dd></div>)}<dt className="font-medium text-foreground">{tx('inbound.costs.total', 'Total')}</dt><dd className="text-end font-semibold tabular-nums text-foreground">{num(t.total)}</dd></dl>
    </div>
  </section>;
}

type TrendDay = AgentCallAnalytics['byDay'][number];
type TrendMetric = { key: string; label: string; color: string; value: (d: TrendDay) => number; fmt: (v: number) => string; cumulative?: boolean };

// Single-series area+line over time; crosshair and tooltip on hover (dataviz interaction spec).
function TrendChart({ days, metric, currency }: { days: TrendDay[]; metric: TrendMetric; currency: string }) {
  const { inbound, tx } = useCopy();
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
  return <figure className="min-w-0" aria-label={tx('inbound.costs.chartLabel', '{metric} chart in {currency}, UTC', { metric: metric.label, currency })}>
    <div className="flex min-h-9 items-start justify-end text-end text-xs" aria-live="polite">
      {active ? <div><p className="font-medium text-foreground">{new Date(`${active.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {metric.fmt(series[hover!])}</p><p className="text-muted-foreground">{inbound ? tx('inbound.costs.dayLine', '{calls} calls · {answered} answered · {talk} talk', { calls: active.calls, answered: active.connected, talk: duration(active.seconds) }) : `${active.calls} call${active.calls === 1 ? '' : 's'} · ${active.connected} connected · ${duration(active.seconds)} talk`}</p></div> : <p className="text-muted-foreground">{tx('inbound.costs.hoverDay', 'Hover a day for details')}</p>}
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
  const { tx } = useCopy();
  const days = data.byDay;
  const metrics: TrendMetric[] = [
    { key: 'cost', label: tx('inbound.costs.trend.daily', 'Daily cost'), color: '#3b82f6', value: d => d.cost, fmt: v => money(v, data.currency) },
    { key: 'cumulative', label: tx('inbound.costs.trend.cumulative', 'Cumulative'), color: '#0891b2', value: d => d.cost, fmt: v => money(v, data.currency), cumulative: true },
    { key: 'perMinute', label: tx('inbound.costs.trend.perMinute', 'Cost / min'), color: '#db2777', value: d => d.seconds > 0 ? d.cost / (d.seconds / 60) : 0, fmt: v => money(v, data.currency) },
    { key: 'calls', label: tx('inbound.costs.trend.calls', 'Calls'), color: '#d97706', value: d => d.calls, fmt: v => num(Math.round(v)) },
  ];
  const [metricKey, setMetricKey] = useState('cost');
  const metric = metrics.find(m => m.key === metricKey)!;
  return <section className={`${panelClass} min-w-0 xl:col-span-3`} aria-label={tx('inbound.costs.trendLabel', 'Call cost trend')}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-primary" />{tx('inbound.costs.trendTitle', 'Cost over time')}</h3><p className="mt-1 text-xs text-muted-foreground">{tx('inbound.costs.trendHint', 'Spend trend across the selected period.')}</p></div>
      <div role="radiogroup" aria-label={tx('inbound.costs.trendMetric', 'Trend metric')} className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {metrics.map(m => <button key={m.key} role="radio" aria-checked={metricKey === m.key} onClick={() => setMetricKey(m.key)} className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${metricKey === m.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`} style={metricKey === m.key ? { background: m.color } : undefined}>{m.label}</button>)}
      </div>
    </div>
    {metricKey !== 'calls' && !data.totals.totalCost && !!data.billing?.unpricedCalls ? <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{tx('inbound.costs.trendUnpriced', 'Cost trend is unavailable until model identity and pricing details are recorded.')}</p>
      : days.length ? <TrendChart days={days} metric={metric} currency={data.currency} />
      : <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{tx('inbound.costs.trendEmpty', 'No calls in this period.')}</p>}
  </section>;
}

function BehaviorPanel({ data }: { data: AgentCallAnalytics }) {
  const { inbound, tx, outcome } = useCopy();
  const toneTotal = Object.values(data.tone).reduce((s, v) => s + v, 0);
  const outcomeKeys: string[] = inbound ? [...OUTCOME_ORDER, ...Object.keys(data.outcomes).filter(k => !OUTCOME_ORDER.includes(k))] : Object.keys(OUTCOMES);
  const outcomes = outcomeKeys.map(k => [k, (data.outcomes as Record<string, number | undefined>)[k] || 0] as const).filter(([, v]) => v > 0);
  const maxOutcome = Math.max(...outcomes.map(([, v]) => v), 1);
  return <div className="grid gap-5 lg:grid-cols-2">
    <section className={panelClass}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Smile className="size-4 text-primary" />{inbound ? tx('inbound.costs.callerTone', 'Caller tone') : 'Lead tone'}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{inbound ? tx('inbound.costs.callerToneHint', 'The AI receptionist’s reading of each caller it answered, from what they said.') : "The agent's reading of each connected lead, from what they said."}</p>
      <div className="mt-4 space-y-2.5">{TONES.map(t => { const v = data.tone[t.key] || 0; return <div key={t.key} className="flex items-center gap-3 text-xs">
        <span className={`flex w-24 shrink-0 items-center gap-2 ${t.className}`}><span className={`size-2 rounded-full ${t.dot}`} />{tx(`inbound.costs.tone.${t.key}`, t.label)}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50"><span className={`block h-full rounded-full ${t.dot}`} style={{ width: `${toneTotal ? v / toneTotal * 100 : 0}%` }} /></span>
        <span className="w-12 text-end tabular-nums text-muted-foreground">{v}</span>
      </div>; })}</div>
    </section>
    <section className={panelClass}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="size-4 text-primary" />{inbound ? tx('inbound.costs.outcomesTitle', 'How incoming calls ended') : 'How leads responded'}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{inbound ? tx('inbound.costs.outcomesHint', 'Recorded outcome of every incoming call.') : 'Recorded call outcomes, per attempt.'}</p>
      <div className="mt-4 space-y-2.5">{outcomes.map(([k, v]) => <div key={k} className="flex items-center gap-3 text-xs">
        <span className="w-40 shrink-0 text-muted-foreground">{outcome(k)}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50"><span className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${v / maxOutcome * 100}%` }} /></span>
        <span className="w-12 text-end tabular-nums text-muted-foreground">{v}</span>
      </div>)}</div>
    </section>
  </div>;
}

function ToneBadge({ tone }: { tone: LeadTone | null }) {
  const { tx } = useCopy();
  const t = TONES.find(x => x.key === (tone || 'unrecorded'))!;
  return <span className={`inline-flex items-center gap-1.5 text-xs ${t.className}`}><span className={`size-1.5 rounded-full ${t.dot}`} />{tone ? tx(`inbound.costs.tone.${t.key}`, t.label) : '—'}</span>;
}

function CallList({ calls, onOpen }: { calls: AnalyzedCall[]; onOpen: (id: string) => void }) {
  const { inbound, tx } = useCopy();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { t } = useInboundLanguage();
  return <div className="overflow-hidden rounded-2xl border border-border bg-card">
    <div className="hidden grid-cols-[1.4fr_1fr_0.7fr_1fr_0.8fr_0.8fr_0.8fr_24px] gap-3 border-b border-border bg-white/[0.02] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
      {inbound
        ? <><span>{tx('inbound.costs.col.caller', 'Caller')}</span><span>{tx('inbound.costs.col.when', 'When')}</span><span>{tx('inbound.costs.col.duration', 'Duration')}</span><span>{tx('inbound.costs.col.outcome', 'Outcome')}</span><span>{tx('inbound.costs.col.agentSim', 'Agent · SIM')}</span><span className="text-end">{tx('inbound.costs.col.tokens', 'Tokens')}</span><span className="text-end">{tx('inbound.costs.col.cost', 'Cost')}</span><span /></>
        : <><span>Lead</span><span>When</span><span>Duration</span><span>Outcome</span><span>Tone</span><span className="text-end">Tokens</span><span className="text-end">Cost</span><span /></>}
    </div>
    <ul className="divide-y divide-white/[0.06]">{calls.map(call => { const open = expanded === call.id; return <li key={call.id}>
      <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? null : call.id)} className="grid w-full grid-cols-2 items-center gap-3 px-4 py-3 text-start text-sm transition hover:bg-muted/40 lg:grid-cols-[1.4fr_1fr_0.7fr_1fr_0.8fr_0.8fr_0.8fr_24px]">
        <span className="min-w-0"><span className="block truncate font-medium text-foreground">{call.leadName}</span><span className="block truncate text-[11px] text-muted-foreground">{inbound ? [call.leadPhone, call.inquiry ? enumLabel(t, 'inquiry', call.inquiry) : null].filter(Boolean).join(' · ') || '—' : call.leadPhone || call.campaignName}</span></span>
        <span className="text-xs text-muted-foreground max-lg:text-end">{when(call.at)}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{call.durationSeconds ? duration(call.durationSeconds) : '—'}</span>
        <span className="max-lg:text-end">{inbound ? <OutcomePill value={call.disposition} t={t} /> : call.disposition ? <StatusPill status={call.disposition} /> : <span className="text-xs text-muted-foreground">{call.state}</span>}</span>
        <span className="min-w-0">{inbound ? <span className="block truncate text-xs text-muted-foreground" title={[call.agentName, call.device, call.sim].filter(Boolean).join(' · ')}>{call.agentName || tx('inbound.costs.noAgent', 'No AI agent')}{call.sim ? ` · ${call.sim}` : ''}</span> : <ToneBadge tone={call.behavior.tone} />}</span>
        <span className="text-xs tabular-nums text-muted-foreground max-lg:text-end lg:text-end">{call.cost.tokens ? num(call.cost.tokens.total) : '—'}</span>
        <span className="font-semibold tabular-nums text-foreground lg:text-end"><CallCostLabel call={call} /></span>
        <ChevronDown className={`size-4 text-muted-foreground transition max-lg:justify-self-end ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <CallDetail call={call} onOpen={onOpen} />}
    </li>; })}</ul>
  </div>;
}

function CallDetail({ call, onOpen }: { call: AnalyzedCall; onOpen: (id: string) => void }) {
  const { inbound, tx, outcome } = useCopy();
  const { t: lt } = useInboundLanguage();
  const components = useComponents();
  const split = splitCost(call.cost.components);
  const parts = components.map(p => ({ ...p, value: split[p.key] }));
  const p = call.behavior.participation;
  const t = call.cost.tokens;
  return <div className="grid gap-4 border-t border-border bg-gradient-to-b from-blue-950/20 to-transparent px-4 py-5 lg:grid-cols-[1.5fr_1fr]">
    <div className="space-y-4">
      <div><p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"><FileText className="size-3.5" />{tx('inbound.costs.summary', 'Summary')}{call.notesSource === 'ai_agent' && <span className="rounded-full bg-sky-400/10 px-2 py-0.5 normal-case tracking-normal text-primary">{tx('inbound.costs.byAgent', 'written by agent')}</span>}</p>
        <p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">{call.summary || tx('inbound.costs.noSummary', 'No summary was recorded for this call.')}</p>
        {call.description && call.description !== call.summary && <p className="mt-2 text-xs text-muted-foreground">{call.description}</p>}</div>
      {call.blockers.length > 0 && <div><p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{inbound ? tx('inbound.costs.objections', 'Objections') : 'Blockers'}</p><ul className="mt-2 list-disc space-y-1 ps-4 text-xs text-amber-200/90">{call.blockers.map(b => <li key={b}>{b}</li>)}</ul></div>}
      {inbound ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label={tx('inbound.costs.col.outcome', 'Outcome')} value={outcome(call.outcome ?? call.disposition) || '—'} />
        <Mini label={tx('inbound.costs.tone', 'Tone')} value={<ToneBadge tone={call.behavior.tone} />} />
        <Mini label={tx('inbound.costs.turns', 'Turns (caller / agent)')} value={`${p.leadTurns} / ${p.agentTurns}`} />
        <Mini label={tx('inbound.costs.collected', 'Details collected')} value={String(call.behavior.answers.valid)} />
        <Mini label={tx('inbound.costs.inquiry', 'Inquiry')} value={call.inquiry ? enumLabel(lt, 'inquiry', call.inquiry) : '—'} />
        <Mini label={tx('inbound.costs.qualification', 'Qualification')} value={call.qualificationResult ? enumLabel(lt, 'qualification', call.qualificationResult) : '—'} />
        <Mini label={tx('inbound.costs.callerQuestions', 'Caller questions')} value={String(call.behavior.questions ?? 0)} />
        <Mini label={tx('inbound.costs.where', 'Phone · SIM')} value={[call.device, call.sim].filter(Boolean).join(' · ') || '—'} />
      </div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Lead behavior" value={OUTCOMES[call.behavior.outcome]} />
        <Mini label="Tone" value={<ToneBadge tone={call.behavior.tone} />} />
        <Mini label="Turns (lead / agent)" value={`${p.leadTurns} / ${p.agentTurns}`} />
        <Mini label="Valid answers" value={`${call.behavior.answers.valid} / ${call.behavior.answers.total}`} />
      </div>}
      {inbound && (call.behavior.callbackRequested || call.behavior.humanRequested || call.leadCreated) && <p className="flex flex-wrap gap-2 text-xs">
        {call.leadCreated && <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-cyan-700 dark:text-cyan-300">{tx('inbound.costs.leadCreated', 'Lead created from this call')}</span>}
        {call.behavior.callbackRequested && <span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-sky-700 dark:text-sky-300">{tx('inbound.costs.callback', 'Callback requested')}</span>}
        {call.behavior.humanRequested && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">{tx('inbound.costs.human', 'Asked for a person')}</span>}
      </p>}
      {call.behavior.toneEvidence && <p className="rounded-xl border border-border bg-white/[0.02] p-3 text-xs italic text-muted-foreground">“{call.behavior.toneEvidence}”</p>}
      {p.interruptions > 0 && <p className="text-xs text-muted-foreground">{inbound ? tx('inbound.costs.interruptions', 'The caller interrupted the agent {count} time(s).', { count: p.interruptions }) : `The lead interrupted the agent ${p.interruptions} time${p.interruptions === 1 ? '' : 's'}.`}</p>}
      {call.failure && <p className="text-xs text-rose-300">{call.failure.code}: {call.failure.message}</p>}
      <button type="button" className={secondaryClass} onClick={() => onOpen(call.id)}><MessageSquareText className="size-4" />{inbound ? tx('inbound.costs.openCall', 'Open call details & transcript') : 'Open conversation & transcript'}</button>
    </div>
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between"><p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{call.cost.estimate ? tx('inbound.costs.estimated', 'Estimated call cost') : tx('inbound.costs.recorded', 'Recorded call cost')}</p><p className="text-xl font-semibold tabular-nums text-foreground"><CallCostLabel call={call} /></p></div>
      <div className="mt-3"><StackedBar parts={parts} label={tx('inbound.costs.breakdownLabel', 'Call cost breakdown')} /></div>
      <dl className="mt-3 space-y-1.5 text-xs">{parts.filter(x => x.value > 0).map(x => <div key={x.key} className="flex items-center gap-2"><span className="size-2 rounded-sm" style={{ background: x.color }} /><dt className="flex-1 text-muted-foreground">{x.label}</dt><dd className="tabular-nums text-foreground">{money(x.value, call.cost.currency)}</dd></div>)}</dl>
      {t ? <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-xs">
        {([[tx('inbound.costs.tok.audioIn', 'Audio in'), t.inputAudio], [tx('inbound.costs.tok.audioOut', 'Audio out'), t.outputAudio], [tx('inbound.costs.tok.textIn', 'Text in'), t.inputText], [tx('inbound.costs.tok.textOut', 'Text out'), t.outputText], [tx('inbound.costs.tok.cachedIn', 'Cached in'), call.costDiagnostics?.cachedInputTokens ?? t.inputCachedAudio + t.inputCachedText], [tx('inbound.costs.tok.total', 'Total tokens'), t.total]] as Array<[string, number]>).map(([l, v]) => <div key={l} className="contents"><dt className="text-muted-foreground">{l}</dt><dd className="text-end tabular-nums text-foreground">{num(v)}</dd></div>)}
      </dl> : <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{tx('inbound.costs.noTokens', 'No token usage was reported for this call.')}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{inbound ? inboundCostSourceText(call, tx) : costSourceText(call)}</p>
      <CallCostDiagnostics call={call} />
    </div>
  </div>;
}

function CallCostDiagnostics({ call }: { call: AnalyzedCall }) {
  const { tx } = useCopy();
  const nr = useNotRecorded();
  const d = call.costDiagnostics;
  return <section aria-label={tx('inbound.costs.diagnostics', 'Cost diagnostics')} className="mt-4 space-y-3 border-t border-border pt-3 text-xs">
    <dl className="grid grid-cols-2 gap-2">
      {[
        [tx('inbound.costs.diag.model', 'Model'), call.cost.model || nr],
        [tx('inbound.costs.diag.provider', 'AI provider'), call.aiVoice?.provider || call.cost.models?.[0]?.provider || nr],
        [tx('inbound.costs.diag.fallback', 'Provider fallback'), call.aiVoice ? call.aiVoice.fallback ? tx('inbound.costs.yes', 'Yes') : tx('inbound.costs.no', 'No') : nr],
        [tx('inbound.costs.diag.perMinute', 'Estimated cost / minute'), d?.estimatedCostPerMinute == null ? nr : money(d.estimatedCostPerMinute, call.cost.currency)],
        [tx('inbound.costs.diag.cacheHit', 'Cache hit'), d?.cacheHitPercent == null ? nr : `${d.cacheHitPercent.toFixed(1)}%`],
        [tx('inbound.costs.diag.cacheSavings', 'Estimated savings from caching'), d?.estimatedCacheSavings == null ? nr : money(d.estimatedCacheSavings, call.cost.currency)],
        [tx('inbound.costs.diag.responses', 'Provider responses (includes tools)'), d?.responseCount == null ? nr : num(d.responseCount)],
        [tx('inbound.costs.diag.avgOutput', 'Average output tokens / response'), d?.averageOutputTokens == null ? nr : d.averageOutputTokens.toFixed(1)],
      ].map(([label, value]) => <div key={label} className="contents"><dt className="text-muted-foreground">{label}</dt><dd className="text-end text-foreground">{value}</dd></div>)}
    </dl>
    {!!call.aiVoice?.attempts?.length && <details><summary className="cursor-pointer text-primary">{tx('inbound.costs.diag.history', 'Provider connection history')}</summary><ul className="mt-2 space-y-1">{call.aiVoice.attempts.map((attempt, index) => <li key={`${attempt.provider}:${index}`}>{attempt.provider} · {attempt.model} · {attempt.status}{attempt.reason ? ` · ${attempt.reason}` : ''} · {attempt.latencyMs} ms</li>)}</ul></details>}
    {!!d?.responses.length && <details><summary className="cursor-pointer text-primary">{tx('inbound.costs.diag.perResponse', 'Per-response usage and estimated cost')}</summary>
      <div className="mt-2 max-h-72 overflow-auto"><table className="w-full text-end"><thead><tr>{[tx('inbound.costs.diag.response', 'Response'), tx('inbound.costs.diag.input', 'Input'), tx('inbound.costs.diag.output', 'Output'), tx('inbound.costs.diag.cache', 'Cache'), 'TTFT ms', tx('inbound.costs.diag.estCost', 'Est. cost')].map(h => <th key={h} className="p-1">{h}</th>)}</tr></thead>
        <tbody>{d.responses.map((r, i) => <tr key={r.responseId} title={`${r.responseId} · ${r.cacheObservation}${r.cancelled ? ' · cancelled' : ''}`}>
          <td className="p-1">{i + 1}{r.cancelled ? ` (${tx('inbound.costs.diag.cancelled', 'cancelled')})` : ''}</td><td>{num(r.tokens.input)}</td><td>{num(r.tokens.output)}</td><td>{num(r.inputCachedTokens ?? r.tokens.inputCachedAudio + r.tokens.inputCachedText)}</td><td>{r.ttftMs ?? '—'}</td><td>{r.estimatedCost == null ? nr : money(r.estimatedCost, call.cost.currency)}</td>
        </tr>)}</tbody></table></div>
      {!!d.droppedResponses && <p>{tx('inbound.costs.diag.dropped', '{count} additional responses are included in aggregate usage but exceed the detail retention limit.', { count: d.droppedResponses })}</p>}
    </details>}
    <p className="text-[11px] leading-relaxed text-muted-foreground">{tx('inbound.costs.diag.note', 'Token counts are provider usage via the SDK. Costs and cache savings use rate-card estimates. Before/after reductions and monthly projections require matched measured calls and a supplied monthly volume.')}</p>
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

function CallCostLabel({ call }: { call: AnalyzedCall }) {
  const { tx } = useCopy();
  if ((call.cost.unpriced && !call.cost.amount) || (call.cost.source === 'none' && call.durationSeconds > 0 && call.answeredBy !== 'human')) return <>{tx('inbound.costs.notRecorded', 'Not recorded')}</>;
  return <>{`${money(call.cost.amount, call.cost.currency)}${call.cost.unpriced ? ` ${tx('inbound.costs.partial', '(partial)')}` : ''}`}</>;
}

function BillingComparison({ data, range }: { data: AgentCallAnalytics; range: string }) {
  const { inbound, tx } = useCopy();
  const model = data.billing?.modelEstimate ?? data.totals.components.model;
  const additional = data.billing?.additionalEstimate ?? data.totals.components.telephony + data.totals.components.platform;
  const window = rangeParams(range);
  const dates = window.from ? `${window.from.slice(0, 10)} – ${new Date(new Date(window.to!).getTime() - 1).toISOString().slice(0, 10)}` : null;
  if (inbound) return <section aria-label={tx('inbound.costs.billingLabel', 'Billing comparison')} className="min-w-0 rounded-2xl border border-sky-400/20 bg-sky-950/20 p-4 text-xs leading-relaxed text-muted-foreground">
    <p className="font-semibold text-foreground">{tx('inbound.costs.billingTitle', 'Usage estimate · not reconciled with provider billing')}</p>
    <p className="mt-1">{tx('inbound.costs.billingModel', 'Realtime model estimate for incoming calls: {model}. Platform estimate: {platform}.', { model: model === 0 && data.billing?.unpricedCalls ? tx('inbound.costs.notRecorded', 'Not recorded') : money(model, data.currency), platform: money(additional, data.currency) })}</p>
    <p className="mt-1 font-medium text-foreground">{tx('inbound.costs.billingSim', 'SIM airtime is not included: incoming calls use your own phone plan, billed by your carrier.')}</p>
    <p className="mt-1">{dates ? tx('inbound.costs.billingDates', '{dates} · UTC · incoming calls only. Test calls are listed separately.', { dates }) : tx('inbound.costs.billingAllDates', 'All recorded dates · UTC · incoming calls only. Test calls are listed separately.')}</p>
    <p className="mt-1">{tx('inbound.costs.billingExcludes', 'Input transcription and post-call analysis are separate services and are excluded from this estimate. Compare with your provider for the same project, API key and UTC dates.')}</p>
    {!!data.billing?.unpricedCalls && <p className="mt-1 text-amber-300">{tx('inbound.costs.billingUnpriced', '{count} call(s) have incomplete pricing; the total includes only the portions that can be priced.', { count: data.billing.unpricedCalls })}</p>}
    {!!data.billing?.foreignCurrencyCalls && <p className="mt-1 text-amber-300">{tx('inbound.costs.billingForeign', '{count} call(s) in another currency are excluded from USD totals.', { count: data.billing.foreignCurrencyCalls })}</p>}
    <a href="https://platform.openai.com/usage" target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-primary underline">{tx('inbound.costs.openaiUsage', 'Open OpenAI usage')}</a>
    <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer" className="ms-4 mt-2 inline-block font-medium text-primary underline">{tx('inbound.costs.geminiPricing', 'Gemini pricing')}</a>
  </section>;
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

/** Incoming calls: spend per receptionist agent (AI-answered calls). */
function ByAgentTable({ data, onAgent }: { data: AgentCallAnalytics; onAgent?: (agentId: string) => void }) {
  const { tx } = useCopy();
  const rows = data.byAgent ?? [];
  const max = Math.max(...rows.map(r => r.cost), 0.000001);
  return <section aria-label={tx('inbound.costs.byAgentTitle', 'Cost by agent')} className={`${panelClass} min-w-0`}>
    <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-primary" />{tx('inbound.costs.byAgentTitle', 'Cost by agent')}</h3>
    <p className="mt-1 text-xs text-muted-foreground">{tx('inbound.costs.byAgentHint', 'AI-answered calls per receptionist agent in this period.')}</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
      <thead><tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {[tx('inbound.costs.col.agent', 'Agent'), tx('inbound.costs.col.calls', 'Calls'), tx('inbound.costs.col.talk', 'Talk time'), tx('inbound.costs.col.tokens', 'Tokens'), tx('inbound.costs.col.avgCall', 'Avg / call'), tx('inbound.costs.col.totalCost', 'Total cost')].map((h, i) => <th key={h} className={`py-2 font-semibold ${i ? 'text-end' : 'text-start'}`}>{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-white/[0.06]">{rows.map(r => <tr key={r.agentId ?? r.name}>
        <td className="py-2.5 pe-3">{r.agentId && onAgent ? <button type="button" className="font-medium text-foreground hover:text-primary hover:underline" onClick={() => onAgent(r.agentId!)}>{r.name}</button> : <span className="font-medium">{r.name}</span>}
          <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted/50"><span className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${(r.cost / max) * 100}%` }} /></span></td>
        <td className="py-2.5 text-end tabular-nums text-muted-foreground">{r.calls}</td>
        <td className="py-2.5 text-end tabular-nums text-muted-foreground">{duration(r.seconds)}</td>
        <td className="py-2.5 text-end tabular-nums text-muted-foreground">{num(r.tokens)}</td>
        <td className="py-2.5 text-end tabular-nums text-muted-foreground">{money(r.avgCostPerCall, data.currency)}</td>
        <td className="py-2.5 text-end font-semibold tabular-nums">{money(r.cost, data.currency)}</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return <div className="rounded-xl border border-border bg-white/[0.02] p-2.5"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><div className="mt-1 text-xs font-medium text-foreground">{value}</div></div>;
}

function LeadTable({ leads, onOpen }: { leads: AnalyzedLead[]; onOpen: (id: string) => void }) {
  const { inbound, tx } = useCopy();
  const nr = useNotRecorded();
  const { t } = useInboundLanguage();
  const headers = inbound
    ? [tx('inbound.costs.col.caller', 'Caller'), tx('inbound.costs.col.calls', 'Calls'), tx('inbound.costs.col.talk', 'Talk time'), tx('inbound.costs.col.tokens', 'Tokens'), tx('inbound.costs.col.totalCost', 'Total cost'), tx('inbound.costs.col.avgCall', 'Avg / call'), tx('inbound.costs.col.lastOutcome', 'Last outcome'), tx('inbound.costs.tone', 'Tone'), tx('inbound.costs.col.latestSummary', 'Latest summary')]
    : ['Lead', 'Calls', 'Talk time', 'Tokens', 'Total cost', 'Avg / call', 'Last outcome', 'Tone', 'Latest summary'];
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card">
    <table className="w-full min-w-[920px] text-sm">
      <thead><tr className="border-b border-border bg-white/[0.02] text-start text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {headers.map((h, i) => <th key={h} className={`px-4 py-2.5 font-semibold ${i >= 1 && i <= 5 ? 'text-end' : 'text-start'}`}>{h}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-white/[0.06]">{leads.map(l => <tr key={l.callerKey ?? l.leadId} tabIndex={0} onClick={() => onOpen(l.lastCallId)} onKeyDown={e => { if (e.key === 'Enter') onOpen(l.lastCallId); }} className="cursor-pointer outline-none transition hover:bg-muted/40 focus-visible:bg-muted/50">
        <td className="px-4 py-3"><p className="font-medium text-foreground">{inbound && l.leadId ? <Link href={`/leads?detail=${encodeURIComponent(l.leadId)}`} onClick={e => e.stopPropagation()} className="hover:text-primary hover:underline">{l.name}</Link> : l.name}</p><p className="text-[11px] text-muted-foreground">{l.phone || '—'}{inbound && !l.leadId ? ` · ${tx('inbound.costs.noLead', 'no lead')}` : ''}</p></td>
        <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{l.calls}<span className="text-muted-foreground"> · {l.connected} {inbound ? tx('inbound.costs.answeredShort', 'ans.') : 'conn.'}</span></td>
        <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{duration(l.seconds)}</td>
        <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{num(l.tokens)}</td>
        <td className="px-4 py-3 text-end font-semibold tabular-nums text-foreground">{l.pricingIncomplete && !l.cost ? nr : money(l.cost)}</td>
        <td className="px-4 py-3 text-end tabular-nums text-muted-foreground">{l.pricingIncomplete && !l.cost ? nr : money(l.avgCostPerCall)}</td>
        <td className="px-4 py-3">{inbound ? <OutcomePill value={l.lastDisposition} t={t} /> : l.lastDisposition ? <StatusPill status={l.lastDisposition} /> : '—'}</td>
        <td className="px-4 py-3"><ToneBadge tone={l.lastTone} /></td>
        <td className="max-w-xs px-4 py-3"><p className="line-clamp-2 text-xs text-muted-foreground">{l.lastSummary || '—'}</p></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function PricingNote({ data }: { data: AgentCallAnalytics }) {
  const { inbound, tx } = useCopy();
  const notes = inbound ? [
    tx('inbound.costs.note.model', 'AI model cost is estimated from reported {model} usage at list prices, with cached input discounted; your provider invoice is authoritative.', { model: data.pricing.model || 'model' }),
    tx('inbound.costs.note.sim', 'SIM airtime is not included: incoming calls ride on your own phone plan, so there is no carrier charge through Updata.'),
    data.pricing.platformRatePerMinute ? tx('inbound.costs.note.platform', 'Platform minutes are included at {rate}/min.', { rate: money(data.pricing.platformRatePerMinute) }) : null,
    tx('inbound.costs.note.human', 'Calls answered by a person on the phone use no AI and cost nothing here.'),
    data.totals.callsWithoutCost ? tx('inbound.costs.note.unpriced', '{count} AI-answered call(s) lack complete pricing evidence; their cost is not recorded.', { count: data.totals.callsWithoutCost }) : null,
    data.testing.calls ? tx('inbound.costs.note.tests', '{count} test call(s) ({cost}) are excluded from these figures.', { count: data.testing.calls, cost: money(data.testing.totalCost) }) : null,
  ].filter(Boolean) : [
    `AI model cost is estimated from reported ${data.pricing.model || 'model'} usage at list prices, with cached input discounted; your provider invoice is authoritative.`,
    data.pricing.telephonyRatePerMinute ? `Telephony is included at ${money(data.pricing.telephonyRatePerMinute)}/min on carrier calls.` : 'Telephony minutes are not included because no carrier rate is configured.',
    data.pricing.platformRatePerMinute ? `Platform minutes are included at ${money(data.pricing.platformRatePerMinute)}/min.` : null,
    data.totals.callsWithoutCost ? `${data.totals.callsWithoutCost} connected call(s) lack complete pricing evidence; their cost is not recorded.` : null,
    data.testing.calls ? `${data.testing.calls} test call(s) (${money(data.testing.totalCost)}) are excluded from these figures.` : null,
  ].filter(Boolean);
  return <div className="flex gap-3 rounded-2xl border border-border bg-white/[0.02] p-4 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 size-4 shrink-0 text-primary/70" /><ul className="space-y-1">{notes.map(n => <li key={n}>{n}</li>)}</ul></div>;
}
