'use client';
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, BadgeCheck, Camera, Loader2, Pause, Play, Plus, RotateCcw, ShieldCheck, Trophy } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useCampaigns } from '../hooks/use-ai-calling';
import { useExperiment, useExperiments, useQualityMutation, useScriptState, useScriptVersions } from '../hooks/use-calling-quality';
import { callingQualityApi } from '../services/calling-quality-api';
import type { ArmStats, Experiment, Guardrails, ProportionTest, ScriptAgentConfig, ScriptVersion } from '../types/calling-quality-types';
import { AgentDialog, AgentField, inputClass, panelClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';
import { ms, pct, when, type Translate } from './quality-format';

const useT = () => (useLanguage() as { t: Translate }).t;
const STYLES = ['professional', 'friendly', 'concise', 'formal', 'custom'];
const VARIABLE_FIELDS: Array<keyof ScriptAgentConfig> = ['objective', 'speakingStyle', 'customStyle', 'disclosure', 'voice', 'language'];
const DEFAULT_GUARDRAILS: Guardrails = { minCallsPerArm: 30, maxFailureRateIncrease: 0.1, maxOptOutRateIncrease: 0.05, maxMissingTranscriptRateIncrease: 0.1, maxAudioFailureRateIncrease: 0.1, maxP95LatencyIncreaseMs: 750 };
const STATUS_CLASS: Record<string, string> = { draft: 'bg-white/5 text-slate-300', running: 'bg-sky-400/10 text-sky-300', paused: 'bg-amber-400/10 text-amber-200', completed: 'bg-emerald-400/10 text-emerald-300' };

function useRoles() {
  const { isAdmin, hasPermission } = usePermissions();
  return { canWrite: isAdmin || ['ai-calling:write', 'crm:write', 'crm:admin'].some(hasPermission), canAdmin: isAdmin || ['ai-calling:admin', 'crm:admin'].some(hasPermission) };
}

export function ScriptExperiments({ agentId }: { agentId: string }) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const experiments = useExperiments(agentId);
  const { canWrite } = useRoles();
  if (openId) return <ExperimentDetail id={openId} onBack={() => setOpenId(null)} />;
  return <div className="space-y-5">
    <ScriptVersionsPanel agentId={agentId} />
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-sm font-semibold">{t('aiExp.title')}</h2><p className="mt-1 max-w-2xl text-xs text-slate-400">{t('aiExp.subtitle')}</p></div>
        <button className={primaryClass} disabled={!canWrite} onClick={() => setCreating(true)}><Plus className="size-4" />{t('aiExp.new')}</button>
      </div>
      {experiments.data && !experiments.data.length && <p className={`${panelClass} text-center text-xs text-slate-400`}>{t('aiExp.none')}</p>}
      <ul className="space-y-2">{experiments.data?.map(e => <li key={e._id}><button type="button" onClick={() => setOpenId(e._id)} className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#0c1425] p-4 text-start transition hover:border-sky-400/30">
        <span className="min-w-0 flex-1"><span className="block font-medium text-slate-100">{e.name}</span><span className="block truncate text-xs text-slate-500">{e.hypothesis || t('aiExp.noHypothesis')}</span></span>
        <span className="text-xs text-slate-400">{e.arms.map(a => `${t(`aiExp.arm.${a.key.startsWith('variant') ? 'variant' : 'control'}`)} ${a.weight}%`).join(' · ')}</span>
        <GuardrailBadge e={e} t={t} />
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[e.status]}`}>{t(`aiExp.status.${e.status}`)}</span>
      </button></li>)}</ul>
    </section>
    {creating && <ExperimentWizard agentId={agentId} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenId(id); }} />}
  </div>;
}

function GuardrailBadge({ e, t }: { e: Experiment; t: Translate }) {
  const state = e.guardrailStatus?.state || 'not_checked';
  const cls = state === 'breached' ? 'text-rose-300' : state === 'ok' ? 'text-emerald-300' : 'text-slate-400';
  return <span className={`inline-flex items-center gap-1 text-[11px] ${cls}`}>{state === 'breached' ? <AlertTriangle className="size-3.5" /> : <ShieldCheck className="size-3.5" />}{t(`aiExp.guardrail.${state}`)}</span>;
}

function ScriptVersionsPanel({ agentId }: { agentId: string }) {
  const t = useT();
  const { canWrite, canAdmin } = useRoles();
  const state = useScriptState(agentId).data;
  const versions = useScriptVersions(agentId).data;
  const [rollingBack, setRollingBack] = useState(false);
  const snapshot = useQualityMutation(() => callingQualityApi.snapshot(agentId));
  return <section className={panelClass}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-sm font-semibold">{t('aiExp.versions.title')}</h2>
        <p className="mt-1 text-xs text-slate-400">{state?.activeVersion ? t('aiExp.versions.active', { n: state.activeVersion.number, label: state.activeVersion.label || '' }) : t('aiExp.versions.noneActive')}</p>
        {state?.liveMatchesActive === false && <p className="mt-1 text-xs text-amber-200">{t('aiExp.versions.drift')}</p>}</div>
      <div className="flex flex-wrap gap-2">
        <button className={secondaryClass} disabled={!canWrite || snapshot.isPending} onClick={() => snapshot.mutate(undefined)}><Camera className="size-4" />{t('aiExp.versions.snapshot')}</button>
        <button className={secondaryClass} disabled={!canAdmin || !state?.canRollback} onClick={() => setRollingBack(true)}><RotateCcw className="size-4" />{t('aiExp.versions.rollback')}</button>
      </div>
    </div>
    {versions && versions.length > 0 && <ul className="mt-4 divide-y divide-white/[0.06] text-xs">{versions.map(v => <li key={v._id} className="flex flex-wrap items-center gap-3 py-2">
      <span className="font-semibold text-slate-100">v{v.number}</span><span className="text-slate-300">{v.label || '—'}</span>
      <span className="text-slate-500">{t(`aiExp.versions.source.${v.source}`)} · {when(v.createdAt)}</span>
      {v.active && <span className="rounded-full bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">{t('aiExp.active')}</span>}
      <span className="ms-auto text-slate-400">{v.latestBenchmark ? t('aiExp.versions.benchmark', { value: pct(v.latestBenchmark.overall?.fieldAccuracy, 1) ?? t('aiBench.noScore'), cases: v.latestBenchmark.overall?.cases ?? 0 }) : t('aiExp.versions.noBenchmark')}</span>
    </li>)}</ul>}
    {state && state.activations.length > 0 && <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">{t('aiExp.versions.history')}</summary>
      <ul className="mt-2 space-y-1">{state.activations.map(a => <li key={a._id}>{when(a.createdAt)} · {t(`aiExp.activation.${a.action}`)} · v{versions?.find(v => v._id === a.versionId)?.number ?? '?'}{a.campaignsUpdated ? ` · ${t('aiExp.campaignsUpdated', { n: a.campaignsUpdated })}` : ''}{a.reason ? ` · ${a.reason}` : ''}</li>)}</ul></details>}
    {rollingBack && <ConfirmDialog title={t('aiExp.rollback.title')} body={t('aiExp.rollback.body')} confirm={t('aiExp.versions.rollback')} withReason onClose={() => setRollingBack(false)}
      run={reason => callingQualityApi.rollback(agentId, reason)} />}
  </section>;
}

function ConfirmDialog({ title, body, confirm, onClose, run, withReason = false }: { title: string; body: string; confirm: string; onClose: () => void; run: (reason: string) => Promise<unknown>; withReason?: boolean }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const action = useQualityMutation((r: string) => run(r));
  return <AgentDialog title={title} description={body} onClose={onClose}
    footer={<div className="flex items-center justify-end gap-2">{error && <p role="alert" className="me-auto text-xs text-rose-300">{error}</p>}<button className={secondaryClass} onClick={onClose}>{t('aiBench.cancel')}</button>
      <button className={primaryClass} disabled={action.isPending} onClick={async () => { setError(null); try { await action.mutateAsync(reason); onClose(); } catch (e) { setError(readableError(e)); } }}>{action.isPending && <Loader2 className="size-4 animate-spin" />}{confirm}</button></div>}>
    {withReason ? <AgentField label={t('aiExp.reason')}><input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} /></AgentField> : <span />}
  </AgentDialog>;
}

function ExperimentWizard({ agentId, onClose, onCreated }: { agentId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const versions = useScriptVersions(agentId).data;
  const campaigns = useCampaigns({ agentId, limit: 100 }).data?.data || [];
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [controlId, setControlId] = useState('');
  const [variant, setVariant] = useState<ScriptAgentConfig>({});
  const [variantLabel, setVariantLabel] = useState('');
  const [split, setSplit] = useState(50);
  const [campaignIds, setCampaignIds] = useState<string[]>([]);
  const [guardrails, setGuardrails] = useState<Guardrails>(DEFAULT_GUARDRAILS);
  const [error, setError] = useState<string | null>(null);
  const control: ScriptVersion | undefined = versions?.find(v => v._id === (controlId || versions.find(x => x.active)?._id));
  const base = control?.snapshot.agentConfig || {};
  const value = (k: keyof ScriptAgentConfig) => (variant[k] ?? base[k] ?? '') as string;
  const changed = VARIABLE_FIELDS.filter(k => variant[k] !== undefined && variant[k] !== base[k]);
  const create = useQualityMutation(async () => {
    if (!control) throw new Error(t('aiExp.wizard.needControl'));
    const v = await callingQualityApi.createVariant(agentId, control._id, Object.fromEntries(changed.map(k => [k, variant[k]])), variantLabel);
    return callingQualityApi.createExperiment({ agentId, name, hypothesis, arms: [{ key: 'control', versionId: control._id, weight: 100 - split }, { key: 'variant_1', versionId: v._id, weight: split }], campaignIds, guardrails });
  });
  const steps = [t('aiExp.wizard.step1'), t('aiExp.wizard.step2'), t('aiExp.wizard.step3')];
  const canNext = step === 0 ? Boolean(name.trim()) : step === 1 ? Boolean(control && changed.length) : true;
  return <AgentDialog wide title={t('aiExp.new')} description={steps.map((s, i) => `${i + 1}. ${s}`).join('  ·  ')} onClose={onClose}
    footer={<div className="flex items-center justify-end gap-2">{error && <p role="alert" className="me-auto text-xs text-rose-300">{error}</p>}
      {step > 0 && <button className={secondaryClass} onClick={() => setStep(step - 1)}>{t('aiExp.wizard.back')}</button>}
      {step < 2 ? <button className={primaryClass} disabled={!canNext} onClick={() => setStep(step + 1)}>{t('aiExp.wizard.next')}</button>
        : <button className={primaryClass} disabled={create.isPending} onClick={async () => { setError(null); try { onCreated((await create.mutateAsync(undefined))._id); } catch (e) { setError(readableError(e)); } }}>{t('aiExp.wizard.create')}</button>}</div>}>
    {step === 0 && <div className="space-y-4">
      <AgentField label={t('aiExp.wizard.name')}><input className={inputClass} value={name} onChange={e => setName(e.target.value)} /></AgentField>
      <AgentField label={t('aiExp.wizard.hypothesis')} hint={t('aiExp.wizard.hypothesisHint')}><textarea className={inputClass} rows={3} value={hypothesis} onChange={e => setHypothesis(e.target.value)} /></AgentField>
    </div>}
    {step === 1 && <div className="space-y-4">
      {!versions?.length ? <p className="rounded-xl border border-amber-400/25 p-3 text-xs text-amber-200">{t('aiExp.wizard.snapshotFirst')}</p> : <>
        <AgentField label={t('aiExp.wizard.control')}><select className={inputClass} value={control?._id || ''} onChange={e => { setControlId(e.target.value); setVariant({}); }}>{versions.map(v => <option key={v._id} value={v._id}>v{v.number}{v.label ? ` · ${v.label}` : ''}{v.active ? ` (${t('aiExp.active')})` : ''}</option>)}</select></AgentField>
        <p className="text-xs text-slate-400">{t('aiExp.wizard.variantHint')}</p>
        <AgentField label={t('aiExp.wizard.variantLabel')}><input className={inputClass} value={variantLabel} onChange={e => setVariantLabel(e.target.value)} /></AgentField>
        <AgentField label={t('aiExp.field.objective')}><textarea dir="auto" className={inputClass} rows={2} value={value('objective')} onChange={e => setVariant({ ...variant, objective: e.target.value })} /></AgentField>
        <div className="grid gap-3 sm:grid-cols-3">
          <AgentField label={t('aiExp.field.speakingStyle')}><select className={inputClass} value={value('speakingStyle')} onChange={e => setVariant({ ...variant, speakingStyle: e.target.value })}>{STYLES.map(s => <option key={s} value={s}>{s}</option>)}</select></AgentField>
          <AgentField label={t('aiExp.field.voice')}><input className={inputClass} value={value('voice')} onChange={e => setVariant({ ...variant, voice: e.target.value })} /></AgentField>
          <AgentField label={t('aiExp.field.language')}><input className={inputClass} value={value('language')} onChange={e => setVariant({ ...variant, language: e.target.value })} /></AgentField>
        </div>
        <AgentField label={t('aiExp.field.customStyle')}><input dir="auto" className={inputClass} value={value('customStyle')} onChange={e => setVariant({ ...variant, customStyle: e.target.value })} /></AgentField>
        <AgentField label={t('aiExp.field.disclosure')}><textarea dir="auto" className={inputClass} rows={2} value={value('disclosure')} onChange={e => setVariant({ ...variant, disclosure: e.target.value })} /></AgentField>
        <p className="text-[11px] text-slate-500">{changed.length ? t('aiExp.wizard.changed', { fields: changed.join(', ') }) : t('aiExp.wizard.unchanged')}</p>
      </>}
    </div>}
    {step === 2 && <div className="space-y-4">
      <AgentField label={t('aiExp.wizard.split', { variant: split, control: 100 - split })}><input type="range" min={1} max={99} value={split} onChange={e => setSplit(Number(e.target.value))} /></AgentField>
      <p className="text-[11px] text-slate-500">{t('aiExp.wizard.sticky')}</p>
      <fieldset><legend className="mb-2 text-xs font-medium text-slate-300">{t('aiExp.wizard.campaigns')}</legend>
        {!campaigns.length ? <p className="text-xs text-slate-500">{t('aiExp.wizard.allCampaigns')}</p> : <div className="max-h-40 space-y-1 overflow-y-auto">{campaigns.map(c => <label key={c._id} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={campaignIds.includes(c._id)} onChange={e => setCampaignIds(e.target.checked ? [...campaignIds, c._id] : campaignIds.filter(x => x !== c._id))} />{c.name} <span className="text-slate-500">({c.status})</span></label>)}</div>}
        <p className="mt-1 text-[11px] text-slate-500">{t('aiExp.wizard.campaignsHint')}</p></fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3"><legend className="mb-2 text-xs font-medium text-slate-300">{t('aiExp.wizard.guardrails')}</legend>
        {(Object.keys(DEFAULT_GUARDRAILS) as Array<keyof Guardrails>).map(k => <AgentField key={k} label={t(`aiExp.guard.${k}`)}><input type="number" step={k === 'minCallsPerArm' || k === 'maxP95LatencyIncreaseMs' ? 1 : 0.01} min={0} className={inputClass} value={guardrails[k]} onChange={e => setGuardrails({ ...guardrails, [k]: Number(e.target.value) })} /></AgentField>)}
      </fieldset>
      <p className="text-[11px] text-slate-500">{t('aiExp.wizard.guardrailsHint')}</p>
    </div>}
  </AgentDialog>;
}

function TestCell({ test, t }: { test: ProportionTest; t: Translate }) {
  const label = test.underpowered ? t('aiExp.stats.underpowered') : test.significant ? t('aiExp.stats.significant') : t('aiExp.stats.inconclusive');
  const cls = test.underpowered ? 'text-slate-500' : test.significant ? 'text-emerald-300' : 'text-slate-300';
  return <td className="px-3 py-2 text-end text-xs tabular-nums">
    <span className="text-slate-100">{test.diff == null ? '—' : `${test.diff > 0 ? '+' : ''}${(test.diff * 100).toFixed(1)} pt`}</span>
    {test.ciLow != null && <span className="block text-[10px] text-slate-500">95% CI {(test.ciLow * 100).toFixed(1)} … {(test.ciHigh! * 100).toFixed(1)} · p={test.pValue}</span>}
    <span className={`block text-[10px] ${cls}`}>{label} (n={test.n1}/{test.n2})</span>
  </td>;
}

function ExperimentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const t = useT();
  const { canWrite, canAdmin } = useRoles();
  const e = useExperiment(id).data;
  const [confirm, setConfirm] = useState<'start' | 'pause' | { promote: string } | null>(null);
  if (!e) return <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="size-4 animate-spin" />{t('aiQuality.loading')}</p>;
  const stats = e.stats;
  const armName = (key: string) => key === 'control' ? t('aiExp.arm.control') : `${t('aiExp.arm.variant')} ${key.split('_')[1] || ''}`;
  const rows: Array<[string, (a: ArmStats) => string]> = [
    ['calls', a => String(a.calls)], ['connectRate', a => pct(a.connectRate, 1) ?? '—'], ['completionRate', a => pct(a.completionRate, 1) ?? '—'],
    ['qualifiedRate', a => pct(a.qualifiedRate, 1) ?? '—'], ['failureRate', a => pct(a.failureRate, 1) ?? '—'], ['optOutRate', a => pct(a.optOutRate, 1) ?? '—'],
    ['avgCost', a => a.avgCost == null ? '—' : `$${a.avgCost.toFixed(4)}`],
    ['p95', a => ms(a.quality.p95LatencyMs) ?? t('aiQuality.notRecorded')],
    ['missingTranscripts', a => pct(a.quality.missingTranscriptRate, 1) ?? t('aiQuality.notRecorded')],
    ['audioFailures', a => pct(a.quality.audioFailureRate, 1) ?? t('aiQuality.notRecorded')],
    ['telemetry', a => `${a.quality.callsWithTelemetry} / ${a.quality.callsWithTelemetry + a.quality.notRecorded}`],
  ];
  return <div className="space-y-5">
    <button className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-100" onClick={onBack}><ArrowLeft className="size-3.5" />{t('aiExp.back')}</button>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold tracking-tight">{e.name}</h2><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[e.status]}`}>{t(`aiExp.status.${e.status}`)}</span><GuardrailBadge e={e} t={t} /></div>
        <p className="mt-1 max-w-2xl text-xs text-slate-400">{e.hypothesis}</p>
        {e.pausedReason && e.status === 'paused' && <p className="mt-1 text-xs text-amber-200">{t(`aiExp.paused.${e.pausedReason}`)}</p>}
        {e.promotedArm && <p className="mt-1 text-xs text-emerald-300">{t('aiExp.promotedArm', { arm: armName(e.promotedArm) })}</p>}</div>
      <div className="flex flex-wrap gap-2">
        {(e.status === 'draft' || e.status === 'paused') && <button className={primaryClass} disabled={!canAdmin} onClick={() => setConfirm('start')}><Play className="size-4" />{e.status === 'paused' ? t('aiExp.resume') : t('aiExp.start')}</button>}
        {e.status === 'running' && <button className={secondaryClass} disabled={!canWrite} onClick={() => setConfirm('pause')}><Pause className="size-4" />{t('aiExp.pause')}</button>}
        {(e.status === 'running' || e.status === 'paused') && e.arms.map(a => <button key={a.key} className={secondaryClass} disabled={!canAdmin} onClick={() => setConfirm({ promote: a.key })}><Trophy className="size-4" />{t('aiExp.promote', { arm: armName(a.key) })}</button>)}
      </div>
    </header>
    {!canAdmin && <p className="text-[11px] text-slate-500">{t('aiExp.adminOnly')}</p>}

    {e.guardrailEvents.length > 0 && <section className="rounded-2xl border border-rose-400/25 bg-rose-400/[0.04] p-4 text-xs text-rose-100">
      <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4" />{t('aiExp.guardrail.events')}</p>
      <ul className="mt-2 space-y-1">{e.guardrailEvents.map((g, i) => <li key={i}>{when(g.at)} · {armName(g.arm)} · {t(`aiExp.metric.${g.metric}`)}: {g.metric === 'p95LatencyMs' ? `${ms(g.variantValue)} vs ${ms(g.controlValue)}` : `${pct(g.variantValue, 1)} vs ${pct(g.controlValue, 1)}`} ({t('aiExp.guardrail.limit', { value: g.metric === 'p95LatencyMs' ? ms(g.threshold) ?? '' : `+${pct(g.threshold, 1)}` })}, n={g.variantCalls}/{g.controlCalls})</li>)}</ul>
    </section>}

    <section className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1425]">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2.5 text-start">{t('aiExp.stats.metric')}</th>
          {e.arms.map(a => <th key={a.key} className="px-3 py-2.5 text-end">{armName(a.key)} · {a.weight}%<span className="block font-normal normal-case tracking-normal text-slate-500">v{a.version?.number ?? '?'}{a.version?.label ? ` · ${a.version.label}` : ''}</span></th>)}</tr></thead>
        <tbody className="divide-y divide-white/[0.06]">
          {stats && rows.map(([k, f]) => <tr key={k}><td className="px-3 py-2 text-xs text-slate-400">{t(`aiExp.stats.${k}`)}</td>{stats.arms.map(a => <td key={a.key} className="px-3 py-2 text-end tabular-nums text-slate-100">{f(a)}</td>)}</tr>)}
          <tr><td className="px-3 py-2 text-xs text-slate-400">{t('aiExp.stats.benchmark')}</td>{e.arms.map(a => <td key={a.key} className="px-3 py-2 text-end text-xs tabular-nums text-slate-300">{a.latestBenchmark ? `${pct(a.latestBenchmark.overall?.fieldAccuracy, 1) ?? t('aiBench.noScore')} (${a.latestBenchmark.overall?.cases ?? 0})` : t('aiExp.versions.noBenchmark')}</td>)}</tr>
        </tbody>
      </table>
    </section>
    {stats?.arms.some(a => a.underpowered) && <p className="text-xs text-slate-400">{t('aiExp.stats.minSamples', { n: stats.minCallsPerArm })}</p>}

    {stats && stats.comparisons.length > 0 && <section className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0c1425]">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2.5 text-start">{t('aiExp.stats.vsControl')}</th><th className="px-3 py-2.5 text-end">{t('aiExp.stats.connectRate')}</th><th className="px-3 py-2.5 text-end">{t('aiExp.stats.completionRate')}</th><th className="px-3 py-2.5 text-end">{t('aiExp.stats.qualifiedRate')}</th></tr></thead>
        <tbody>{stats.comparisons.map(c => <tr key={c.arm} className="border-t border-white/[0.06]"><td className="px-3 py-2 text-xs text-slate-300">{armName(c.arm)}</td><TestCell test={c.connectRate} t={t} /><TestCell test={c.completionRate} t={t} /><TestCell test={c.qualifiedRate} t={t} /></tr>)}</tbody>
      </table>
    </section>}
    <p className="flex gap-2 text-[11px] text-slate-500"><BadgeCheck className="size-3.5 shrink-0" />{t('aiExp.stats.method')}</p>

    {confirm === 'start' && <ConfirmDialog title={t('aiExp.confirm.startTitle')} body={t('aiExp.confirm.startBody')} confirm={e.status === 'paused' ? t('aiExp.resume') : t('aiExp.start')} onClose={() => setConfirm(null)} run={() => callingQualityApi.startExperiment(e._id)} />}
    {confirm === 'pause' && <ConfirmDialog title={t('aiExp.confirm.pauseTitle')} body={t('aiExp.confirm.pauseBody')} confirm={t('aiExp.pause')} onClose={() => setConfirm(null)} run={() => callingQualityApi.pauseExperiment(e._id)} />}
    {confirm && typeof confirm === 'object' && <ConfirmDialog withReason title={t('aiExp.confirm.promoteTitle', { arm: armName(confirm.promote) })} body={t('aiExp.confirm.promoteBody')} confirm={t('aiExp.promote', { arm: armName(confirm.promote) })} onClose={() => setConfirm(null)} run={reason => callingQualityApi.promote(e._id, confirm.promote, reason)} />}
  </div>;
}
