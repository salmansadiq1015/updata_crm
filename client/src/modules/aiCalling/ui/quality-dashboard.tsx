'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, AudioLines, FileWarning, Gauge, Info, Loader2, MessageSquareOff, PhoneCall, Timer, Zap } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useFlaggedCalls, useQualitySummary } from '../hooks/use-calling-quality';
import type { QualityBreakdownRow, QualityFilters, QualityFlag, QualitySummary } from '../types/calling-quality-types';
import { CallDetailDrawer } from './call-detail-drawer';
import { AgentTabs, panelClass, secondaryClass } from './calling-agent-primitives';
import { languageName, ms, rangeFrom, when, type Translate } from './quality-format';

// Validated categorical pair on the dark surface (#3b82f6 / #d97706: see dataviz validator run in the report).
const P50 = '#3b82f6';
const P95 = '#d97706';
const FLAGS: QualityFlag[] = ['high_latency', 'missing_transcript', 'transcript_not_persisted', 'audio_failure', 'extraction_error'];
const RANGES = ['7', '30', '90', 'all'];
const selectClass = 'min-w-0 rounded-lg border border-white/12 bg-[#0c1425] px-3 py-2 text-xs text-slate-300 outline-none focus:border-sky-400';

export function QualityDashboard() {
  const { t } = useLanguage() as { t: Translate };
  const [range, setRange] = useState('30');
  const [agentId, setAgentId] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [language, setLanguage] = useState('');
  const [provider, setProvider] = useState('');
  const [threshold, setThreshold] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState<QualityFlag | ''>('');
  const [page, setPage] = useState(1);
  const [openCallId, setOpenCallId] = useState<string | null>(null);
  const filters: QualityFilters = useMemo(() => ({
    from: rangeFrom(range), agentId: agentId || undefined, campaignId: campaignId || undefined,
    language: language || undefined, provider: provider || undefined, latencyThresholdMs: threshold,
  }), [range, agentId, campaignId, language, provider, threshold]);
  const summary = useQualitySummary(filters);
  const flagged = useFlaggedCalls({ ...filters, reason: reason || undefined, page });
  const data = summary.data;
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold tracking-tight">{t('aiQuality.title')}</h2><p className="mt-1 max-w-2xl text-xs text-slate-400">{t('aiQuality.subtitle')}</p></div>
      <div role="radiogroup" aria-label={t('aiQuality.filters.range')} className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {RANGES.map(r => <button key={r} role="radio" aria-checked={range === r} onClick={() => reset(() => setRange(r))} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${range === r ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-950/40' : 'text-slate-400 hover:text-slate-100'}`}>{t(`aiQuality.range.${r}`)}</button>)}
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <select aria-label={t('aiQuality.filters.agent')} className={selectClass} value={agentId} onChange={e => reset(() => { setAgentId(e.target.value); setCampaignId(''); })}>
        <option value="">{t('aiQuality.filters.allAgents')}</option>{data?.facets.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select aria-label={t('aiQuality.filters.campaign')} className={selectClass} value={campaignId} onChange={e => reset(() => setCampaignId(e.target.value))}>
        <option value="">{t('aiQuality.filters.allCampaigns')}</option>{data?.facets.campaigns.filter(c => !agentId || c.agentId === agentId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select aria-label={t('aiQuality.filters.language')} className={selectClass} value={language} onChange={e => reset(() => setLanguage(e.target.value))}>
        <option value="">{t('aiQuality.filters.allLanguages')}</option>{data?.facets.languages.map(l => <option key={l} value={l}>{languageName(t, l)}</option>)}
      </select>
      <select aria-label={t('aiQuality.filters.provider')} className={selectClass} value={provider} onChange={e => reset(() => setProvider(e.target.value))}>
        <option value="">{t('aiQuality.filters.allProviders')}</option>{data?.facets.providers.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs text-slate-400">{t('aiQuality.filters.threshold')}
        <input type="number" min={100} max={60000} step={100} className={`${selectClass} w-24`} placeholder={String(data?.latencyThresholdMs ?? 2000)} value={threshold ?? ''}
          onChange={e => reset(() => setThreshold(e.target.value ? Math.max(100, Number(e.target.value)) : undefined))} />
      </label>
    </div>

    {!data ? <div className={`${panelClass} flex items-center justify-center gap-2 py-16 text-sm text-slate-400`}>{summary.isError
      ? <span role="alert">{t('aiQuality.loadError')} <button className="font-semibold text-sky-300 underline" onClick={() => void summary.refetch()}>{t('aiQuality.retry')}</button></span>
      : <><Loader2 className="size-4 animate-spin" />{t('aiQuality.loading')}</>}</div>
      : !data.totals.calls ? <div className={`${panelClass} py-14 text-center`}><Activity className="mx-auto size-8 text-sky-300/70" /><p className="mt-3 font-medium">{t('aiQuality.empty.title')}</p><p className="mx-auto mt-1 max-w-md text-xs text-slate-400">{t('aiQuality.empty.body')}</p></div>
        : <>
          <Kpis data={data} t={t} />
          <div className="grid gap-5 xl:grid-cols-5">
            <LatencyTrend data={data} t={t} />
            <FailureBreakdown data={data} t={t} active={reason} onPick={r => reset(() => setReason(reason === r ? '' : r))} />
          </div>
          <Breakdowns data={data} t={t} />
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t('aiQuality.flagged.title')}{flagged.data ? ` (${flagged.data.pagination.total})` : ''}</h3>
              <select aria-label={t('aiQuality.flagged.reason')} className={selectClass} value={reason} onChange={e => reset(() => setReason(e.target.value as QualityFlag | ''))}>
                <option value="">{t('aiQuality.flagged.anyReason')}</option>{FLAGS.map(f => <option key={f} value={f}>{t(`aiQuality.flag.${f}`)}</option>)}
              </select>
            </div>
            <FlaggedTable t={t} page={flagged.data} loading={flagged.isLoading} onOpen={setOpenCallId} />
            {flagged.data && flagged.data.pagination.pages > 1 && <div className="flex items-center justify-between text-xs text-slate-400">
              <button className={secondaryClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('aiQuality.previous')}</button>
              <span>{t('aiQuality.pageOf', { page, pages: flagged.data.pagination.pages })}</span>
              <button className={secondaryClass} disabled={page >= flagged.data.pagination.pages} onClick={() => setPage(p => p + 1)}>{t('aiQuality.next')}</button>
            </div>}
          </section>
          <Method data={data} t={t} />
        </>}
    {openCallId && <CallDetailDrawer callId={openCallId} onClose={() => setOpenCallId(null)} />}
  </div>;
}

function Tile({ icon, label, value, hint, warn = false }: { icon: ReactNode; label: string; value: string; hint?: string; warn?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${warn ? 'border-amber-400/25 bg-amber-400/[0.04]' : 'border-white/8 bg-[#0c1425]'}`}>
    <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-400"><span className="text-sky-300/80">{icon}</span>{label}</div>
    <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-50">{value}</p>
    {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
  </div>;
}

function Kpis({ data, t }: { data: QualitySummary; t: Translate }) {
  const x = data.totals;
  const nr = t('aiQuality.notRecorded');
  const of = (n: number, d: number) => t('aiQuality.ofRecorded', { n, d });
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
    <Tile icon={<PhoneCall className="size-3.5" />} label={t('aiQuality.kpi.calls')} value={String(x.calls)} hint={t('aiQuality.kpi.coverage', { recorded: x.withTelemetry, notRecorded: x.notRecorded })} />
    <Tile icon={<Timer className="size-3.5" />} label={t('aiQuality.kpi.p50')} value={ms(x.latency.p50Ms) ?? nr} hint={t('aiQuality.kpi.samples', { n: x.latency.samples })} />
    <Tile icon={<Gauge className="size-3.5" />} label={t('aiQuality.kpi.p95')} value={ms(x.latency.p95Ms) ?? nr} hint={x.latency.maxMs != null ? t('aiQuality.kpi.max', { value: ms(x.latency.maxMs)! }) : undefined} warn={(x.latency.p95Ms ?? 0) > data.latencyThresholdMs} />
    <Tile icon={<Zap className="size-3.5" />} label={t('aiQuality.kpi.highLatency')} value={x.withTelemetry ? String(x.latency.highLatencyCalls) : nr} hint={t('aiQuality.kpi.threshold', { value: ms(data.latencyThresholdMs)! })} warn={x.latency.highLatencyCalls > 0} />
    <Tile icon={<MessageSquareOff className="size-3.5" />} label={t('aiQuality.kpi.missingTranscripts')} value={x.transcripts.recorded ? `${x.transcripts.missing}` : nr} hint={x.transcripts.recorded ? `${of(x.transcripts.missing, x.transcripts.recorded)} · ${t('aiQuality.kpi.notPersisted', { n: x.transcripts.notPersisted })}` : undefined} warn={x.transcripts.missing > 0} />
    <Tile icon={<AudioLines className="size-3.5" />} label={t('aiQuality.kpi.audioFailures')} value={x.audio.recorded ? String(x.audio.callsWithFailures) : nr} hint={x.audio.recorded ? of(x.audio.callsWithFailures, x.audio.recorded) : undefined} warn={x.audio.callsWithFailures > 0} />
    <Tile icon={<FileWarning className="size-3.5" />} label={t('aiQuality.kpi.extractionErrors')} value={x.extraction.recorded ? String(x.extraction.errors) : nr} hint={x.extraction.recorded ? `${of(x.extraction.errors, x.extraction.recorded)} · ${t('aiQuality.kpi.extractionNotRecorded', { n: x.extraction.notRecorded })}` : undefined} warn={x.extraction.errors > 0} />
    <Tile icon={<Activity className="size-3.5" />} label={t('aiQuality.kpi.interruptions')} value={x.interruptions.perCall == null ? nr : x.interruptions.perCall.toFixed(1)} hint={x.silenceEvents.perCall == null ? undefined : t('aiQuality.kpi.silence', { value: x.silenceEvents.perCall.toFixed(1) })} />
  </div>;
}

/** p50/p95 response latency per day — one ms axis, two validated series, crosshair tooltip, threshold reference. */
function LatencyTrend({ data, t }: { data: QualitySummary; t: Translate }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = data.byDay.slice(-60);
  const values = days.flatMap(d => [d.p50Ms, d.p95Ms]).filter((v): v is number => v != null);
  const max = Math.max(...values, data.latencyThresholdMs, 1) * 1.1;
  const W = 600; const H = 180;
  const x = (i: number) => (days.length <= 1 ? W / 2 : (i / (days.length - 1)) * W);
  const y = (v: number) => H - (v / max) * H;
  const path = (k: 'p50Ms' | 'p95Ms') => {
    let d = ''; let pen = false;
    days.forEach((day, i) => { const v = day[k]; if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const active = hover != null ? days[hover] : null;
  const last = [...days].reverse().find(d => d.p50Ms != null);
  return <section className={`${panelClass} xl:col-span-3`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="text-sm font-semibold">{t('aiQuality.trend.title')}</h3><p className="mt-1 text-xs text-slate-500">{t('aiQuality.trend.subtitle')}</p></div>
      <ul className="flex gap-4 text-xs text-slate-300" aria-label={t('aiQuality.trend.legend')}>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: P50 }} />p50</li>
        <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: P95 }} />p95</li>
        <li className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-slate-400" />{t('aiQuality.trend.threshold')}</li>
      </ul>
    </div>
    {!values.length ? <p className="mt-6 rounded-xl border border-white/8 p-6 text-center text-xs text-slate-400">{t('aiQuality.trend.noSamples')}</p> : <>
      <div className="mt-2 min-h-9 text-end text-xs" aria-live="polite">{active
        ? <><p className="font-medium text-slate-100">{active.date} · p50 {ms(active.p50Ms) ?? t('aiQuality.notRecorded')} · p95 {ms(active.p95Ms) ?? t('aiQuality.notRecorded')}</p><p className="text-slate-400">{t('aiQuality.trend.day', { calls: active.calls, recorded: active.withTelemetry, samples: active.samples })}</p></>
        : <p className="text-slate-500">{t('aiQuality.trend.hover')}</p>}</div>
      <div className="relative mt-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full overflow-visible" role="img" aria-label={t('aiQuality.trend.aria')}>
          {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />)}
          <line x1={0} x2={W} y1={y(data.latencyThresholdMs)} y2={y(data.latencyThresholdMs)} stroke="#94a3b8" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="rgba(255,255,255,0.25)" vectorEffect="non-scaling-stroke" />}
          <path d={path('p95Ms')} fill="none" stroke={P95} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={path('p50Ms')} fill="none" stroke={P50} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="absolute -top-3 start-0 text-[10px] tabular-nums text-slate-500">{ms(max)}</p>
        <div className="absolute inset-0 flex" onMouseLeave={() => setHover(null)}>
          {days.map((d, i) => <button key={d.date} type="button" className="h-full flex-1 outline-none focus-visible:bg-white/5" aria-label={`${d.date}: p50 ${ms(d.p50Ms) ?? '—'}, p95 ${ms(d.p95Ms) ?? '—'}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />)}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{days[0]?.date}</span>{last && <span className="tabular-nums">{t('aiQuality.trend.latest', { p50: ms(last.p50Ms)!, p95: ms(last.p95Ms) ?? '—' })}</span>}<span>{days.at(-1)?.date}</span></div>
    </>}
  </section>;
}

function FailureBreakdown({ data, t, active, onPick }: { data: QualitySummary; t: Translate; active: QualityFlag | ''; onPick: (r: QualityFlag) => void }) {
  const max = Math.max(...data.failureTypes.map(f => f.calls), 1);
  return <section className={`${panelClass} xl:col-span-2`}>
    <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="size-4 text-sky-300" />{t('aiQuality.failures.title')}</h3>
    <p className="mt-1 text-xs text-slate-500">{t('aiQuality.failures.subtitle', { flagged: data.totals.flaggedCalls, calls: data.totals.calls })}</p>
    <div className="mt-4 space-y-2">{data.failureTypes.map(f => <button key={f.type} type="button" aria-pressed={active === f.type} onClick={() => onPick(f.type)} className={`flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-start text-xs transition hover:bg-white/[0.04] ${active === f.type ? 'bg-sky-400/[0.08] ring-1 ring-sky-400/30' : ''}`}>
      <span className="w-40 shrink-0 text-slate-300">{t(`aiQuality.flag.${f.type}`)}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5"><span className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${(f.calls / max) * 100}%` }} /></span>
      <span className="w-10 text-end tabular-nums text-slate-200">{f.calls}</span>
    </button>)}</div>
    {data.audioFailureTypes.length > 0 && <div className="mt-4 border-t border-white/8 pt-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{t('aiQuality.failures.audioTypes')}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">{data.audioFailureTypes.map(a => <li key={a.type} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-300">{a.type} · {a.count}</li>)}</ul>
    </div>}
  </section>;
}

function Breakdowns({ data, t }: { data: QualitySummary; t: Translate }) {
  const [view, setView] = useState('language');
  const rows: QualityBreakdownRow[] = view === 'language' ? data.breakdown.byLanguage : view === 'provider' ? data.breakdown.byProvider : data.breakdown.byAgent;
  const nr = t('aiQuality.notRecorded');
  return <AgentTabs label={t('aiQuality.breakdown.label')} value={view} onChange={setView} items={[{ value: 'language', label: t('aiQuality.breakdown.language') }, { value: 'provider', label: t('aiQuality.breakdown.provider') }, { value: 'agent', label: t('aiQuality.breakdown.agent') }]}>
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1425]">
      <table className="w-full min-w-[760px] text-sm">
        <thead><tr className="border-b border-white/8 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {['group', 'calls', 'recorded', 'p50', 'p95', 'missing', 'audio', 'extraction'].map((h, i) => <th key={h} className={`px-4 py-2.5 ${i ? 'text-end' : 'text-start'}`}>{t(`aiQuality.breakdown.col.${h}`)}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-white/[0.06]">{rows.map(r => <tr key={r.key}>
          <td className="px-4 py-2.5 text-slate-100">{view === 'language' ? languageName(t, r.key) : r.label}</td>
          <td className="px-4 py-2.5 text-end tabular-nums text-slate-300">{r.calls}</td>
          <td className="px-4 py-2.5 text-end tabular-nums text-slate-400">{r.withTelemetry}</td>
          <td className="px-4 py-2.5 text-end tabular-nums text-slate-200">{ms(r.p50Ms) ?? nr}</td>
          <td className="px-4 py-2.5 text-end tabular-nums text-slate-200">{ms(r.p95Ms) ?? nr}</td>
          <td className="px-4 py-2.5 text-end tabular-nums text-slate-300">{r.withTelemetry ? r.missingTranscripts : nr}</td>
          <td className="px-4 py-2.5 text-end tabular-nums text-slate-300">{r.withTelemetry ? r.audioFailureCalls : nr}</td>
          <td className="px-4 py-2.5 text-end tabular-nums text-slate-300">{r.extractionRecorded ? `${r.extractionErrors} / ${r.extractionRecorded}` : nr}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </AgentTabs>;
}

function FlaggedTable({ t, page, loading, onOpen }: { t: Translate; page?: { calls: import('../types/calling-quality-types').FlaggedCall[] }; loading: boolean; onOpen: (id: string) => void }) {
  if (loading) return <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" />{t('aiQuality.loading')}</p>;
  if (!page?.calls.length) return <p className={`${panelClass} text-center text-xs text-slate-400`}>{t('aiQuality.flagged.none')}</p>;
  return <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1425]">
    <table className="w-full min-w-[900px] text-sm">
      <thead><tr className="border-b border-white/8 text-start text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {['lead', 'when', 'agent', 'language', 'flags', 'p95', 'transcript', 'extraction'].map(h => <th key={h} className="px-4 py-2.5 text-start">{t(`aiQuality.flagged.col.${h}`)}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-white/[0.06]">{page.calls.map(c => <tr key={c.id} tabIndex={0} onClick={() => onOpen(c.id)} onKeyDown={e => { if (e.key === 'Enter') onOpen(c.id); }} className="cursor-pointer outline-none transition hover:bg-white/[0.03] focus-visible:bg-white/[0.05]">
        <td className="px-4 py-3"><p className="font-medium text-slate-100">{c.leadName}</p><p className="text-[11px] text-slate-500">{c.campaignName}</p></td>
        <td className="px-4 py-3 text-xs text-slate-400">{when(c.at)}</td>
        <td className="px-4 py-3 text-xs text-slate-300">{c.agentName || '—'}{c.experiment && <span className="ms-1 rounded-full bg-sky-400/10 px-1.5 text-[10px] text-sky-300">{c.experiment.arm}</span>}</td>
        <td className="px-4 py-3 text-xs text-slate-300">{languageName(t, c.language)}<span className="block text-[10px] text-slate-500">{t(`aiQuality.languageSource.${c.languageSource}`)}</span></td>
        <td className="px-4 py-3"><ul className="flex flex-wrap gap-1">{c.flags.map(f => <li key={f} className="rounded-full border border-amber-400/25 bg-amber-400/[0.06] px-2 py-0.5 text-[10px] text-amber-200">{t(`aiQuality.flag.${f}`)}</li>)}</ul>
          {c.audioFailures.length > 0 && <p className="mt-1 text-[10px] text-slate-500">{c.audioFailures.join(', ')}</p>}</td>
        <td className="px-4 py-3 text-xs tabular-nums text-slate-200">{c.latency ? ms(c.latency.p95Ms) ?? '—' : t('aiQuality.notRecorded')}</td>
        <td className="px-4 py-3 text-xs text-slate-300">{c.telemetry ? t('aiQuality.flagged.turns', { lead: c.transcript.leadTurns ?? 0, agent: c.transcript.agentTurns ?? 0, stored: c.transcript.persistedTurns }) : t('aiQuality.flagged.stored', { stored: c.transcript.persistedTurns })}</td>
        <td className="px-4 py-3 text-xs text-slate-300">{c.extraction ? `${c.extraction.status}${c.extraction.rejectedItems ? ` · ${t('aiQuality.flagged.rejected', { n: c.extraction.rejectedItems })}` : ''}` : t('aiQuality.notRecorded')}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function Method({ data, t }: { data: QualitySummary; t: Translate }) {
  const notes = [
    t('aiQuality.method.population'),
    data.totals.latency.vadSilenceMs != null ? t('aiQuality.method.latencyVad', { ms: data.totals.latency.vadSilenceMs }) : t('aiQuality.method.latency'),
    t('aiQuality.method.notRecorded'),
    t('aiQuality.method.extraction'),
    data.truncated ? t('aiQuality.method.truncated') : null,
  ].filter(Boolean) as string[];
  return <div className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-400"><Info className="mt-0.5 size-4 shrink-0 text-sky-300/70" /><ul className="space-y-1">{notes.map(n => <li key={n}>{n}</li>)}</ul></div>;
}
