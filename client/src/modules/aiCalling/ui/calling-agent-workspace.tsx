'use client';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Coins, Loader2, PhoneCall, Save } from 'lucide-react';
import { showSuccess } from '@/lib/toast';
import { usePermissions } from '@/shared/hooks/use-permissions';
import type { Lead, LeadStatus } from '@/modules/leads/types/lead-types';
import { useAgentCallAnalytics, useAgentMutations, useCallingAgent } from '../hooks/use-calling-agents';
import { AgentCallAnalytics, money } from './agent-call-analytics';
import { ScriptExperiments } from './script-experiments';
import { useCampaignMutations, useCampaigns, usePreviewEligibility } from '../hooks/use-ai-calling';
import type { CallingAgent, CallingAgentInput } from '../types/ai-calling-types';
import { AgentIdentityFields, AgentQuestionTabs } from './calling-agent-editor';
import { AgentExecutionFields, AgentVoiceFields } from './agent-settings-fields';
import { CampaignLeadPicker, RecipientReasons } from './campaign-lead-picker';
import { EligibilityNotice } from './campaign-eligibility-notice';
import { CampaignOverview } from './campaign-overview';
import { CampaignCallingStatus } from './campaign-run-status';
import { StatusPill } from './status-pill';
import { AgentAvatar, AgentMetric, AgentTabs, panelClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';
import { AgentIntelligenceSettings } from './agent-intelligence-settings';

const toInput = (agent: CallingAgent): CallingAgentInput => ({ name: agent.name, title: agent.title, description: agent.description, avatarFileId: agent.avatarFileId, avatarPresetId: agent.avatarPresetId, availability: agent.availability,
  agentConfig: agent.agentConfig, questionnaire: agent.questionnaire, statusRules: agent.statusRules, schedule: agent.schedule, transport: agent.transport, pairedDeviceId: agent.pairedDeviceId });

export function CallingAgentWorkspace({ id, onBack, onLaunch, onCampaign, initialTab = 'overview' }: { id: string; initialTab?: string; onBack: () => void; onLaunch: (agent: CallingAgent) => void; onCampaign: (id: string) => void }) {
  const query = useCallingAgent(id);
  const [tab, setTab] = useState(initialTab);
  const [dirty, setDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const { isAdmin, hasPermission } = usePermissions();
  const canManage = isAdmin || ['ai-calling:write', 'crm:write', 'crm:admin'].some(hasPermission);
  const agent = query.data;
  const changeTab = (next: string) => { if (dirty) setPendingTab(next); else setTab(next); };
  if (!agent) return <div className={panelClass}>{query.isError ? <div role="alert" className="space-y-3"><p>Agent could not be loaded.</p><button className={secondaryClass} onClick={() => query.refetch()}>Try again</button><button className={secondaryClass} onClick={onBack}>Back to agents</button></div> : <p role="status" className="flex items-center gap-2 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading agent…</p>}</div>;
  return <div className="space-y-5">
    <button className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-100" onClick={() => { if (dirty) setPendingTab('back'); else onBack(); }}><ArrowLeft className="h-3.5 w-3.5" />Back to Calling Agents</button>
    <header className="relative flex flex-wrap items-center justify-between gap-5 overflow-hidden rounded-3xl border border-sky-400/15 bg-gradient-to-br from-[#0b2a7a]/70 via-[#0c1733] to-[#071226] p-5 shadow-2xl shadow-blue-950/40 sm:p-6"><span aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-cyan-400/10 blur-3xl" /><span aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-blue-600/15 blur-3xl" /><div className="relative flex min-w-0 items-center gap-4"><AgentAvatar name={agent.name} url={agent.avatarUrl} large /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1><StatusPill status={agent.availability} /></div><p className="mt-1 text-sm font-medium text-sky-200/85">{agent.title || 'Calling agent'}</p><p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">{agent.description}</p></div></div><div className="relative w-full sm:w-auto"><AgentWorkspaceStart agent={agent} canManage={canManage} dirty={dirty} onLaunch={onLaunch} onCampaign={onCampaign} onHistory={() => setTab('history')} /></div></header>
    {pendingTab && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/25 p-3 text-xs text-amber-200"><span className="flex-1">You have unsaved changes. Stay to save them, or discard them before leaving.</span><button className={secondaryClass} onClick={() => setPendingTab(null)}>Keep editing</button><button className={secondaryClass} onClick={() => { setDirty(false); if (pendingTab === 'back') onBack(); else setTab(pendingTab); setPendingTab(null); }}>Discard changes</button></div>}
    <AgentTabs label="Agent workspace" value={tab} onChange={changeTab} items={[{ value: 'overview', label: 'Overview' }, { value: 'questions', label: 'Questions' }, { value: 'leads', label: 'Leads' }, { value: 'settings', label: 'Settings' }, { value: 'analytics', label: 'Call Analytics' }, { value: 'intelligence', label: 'Knowledge & Transfer' }, { value: 'experiments', label: 'Experiments' }, { value: 'history', label: 'Campaign History' }]}>
      {tab === 'overview' && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><AgentMetric label="Assigned leads" value={agent.assignedLeadIds.length} /><AgentMetric label="Eligible leads" value={agent.eligibility.eligible} /><AgentMetric label="Completed" value={agent.metrics.completed} /><AgentMetric label="Calls in progress" value={agent.metrics.inProgress} /></div>
        <div className="grid gap-5 lg:grid-cols-2"><section className={panelClass}><div className="mb-4 flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${agent.readiness.ready ? 'text-emerald-400' : 'text-amber-400'}`} /><h2 className="text-sm font-semibold">Configuration readiness</h2></div><p className="text-sm text-slate-400">{agent.readiness.ready ? 'Voice, questions and calling settings are configured.' : `Complete: ${agent.readiness.missing.join(', ')}`}</p><button className={`${secondaryClass} mt-4`} onClick={() => setTab(agent.readiness.ready ? 'leads' : 'settings')}>{agent.readiness.ready ? 'Manage assigned leads' : 'Continue setup'}<ArrowRight className="h-3.5 w-3.5" /></button></section>
          <section className={panelClass}><h2 className="mb-4 text-sm font-semibold">Latest campaign</h2>{agent.latestCampaign ? <><div className="mb-3 flex items-center justify-between gap-3"><button className="text-left text-sm font-medium hover:text-sky-300" onClick={() => onCampaign(agent.latestCampaign!._id)}>{agent.latestCampaign.name}</button><StatusPill status={agent.latestCampaign.status === 'running' ? agent.latestCampaign.summary.inProgress ? 'calling' : agent.latestCampaign.waitReason ? 'waiting' : 'queued' : agent.latestCampaign.status} /></div><CampaignCallingStatus campaign={agent.latestCampaign} /><button className={`${secondaryClass} mt-3`} onClick={() => onCampaign(agent.latestCampaign!._id)}>Open live monitoring <ArrowRight className="h-3.5 w-3.5" /></button></> : <p className="text-sm text-slate-500">No campaigns yet. Assign leads, then start your first campaign.</p>}</section></div>
        <AgentSpendSummary agentId={id} onOpen={() => changeTab('analytics')} />
        <section className={panelClass}><h2 className="mb-4 text-sm font-semibold">Call outcomes</h2>{agent.metrics.campaigns ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[['Answered', agent.metrics.answered], ['No answer', agent.metrics.noAnswer], ['Qualified', agent.metrics.qualified], ['Failed', agent.metrics.failed]].map(([label, value]) => <div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}</div> : <p className="text-sm text-slate-500">Actual results will appear here after calls begin.</p>}</section>
        <p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />Last updated {new Date(agent.updatedAt).toLocaleString()}</p>
      </>}
      {(tab === 'questions' || tab === 'settings') && <AgentConfiguration key={tab} agent={agent} section={tab} canManage={canManage} onDirty={setDirty} />}
      {tab === 'leads' && <AgentLeads agent={agent} canManage={canManage} onDirty={setDirty} />}
      {tab === 'analytics' && <AgentCallAnalytics agentId={id} />}
      {tab === 'intelligence' && <AgentIntelligenceSettings key={agent.version} agent={agent} canManage={canManage} />}
      {tab === 'experiments' && <ScriptExperiments agentId={id} />}
      {tab === 'history' && <AgentCampaignHistory agentId={id} onCampaign={onCampaign} />}
    </AgentTabs>
  </div>;
}


function AgentSpendSummary({ agentId, onOpen }: { agentId: string; onOpen: () => void }) {
  const { data, isError } = useAgentCallAnalytics(agentId);
  const t = data?.totals;
  if (isError) return null;
  const items: Array<[string, string]> = t ? [['Total spend', money(t.totalCost, data.currency)], ['Avg cost / call', money(t.avgCostPerCall, data.currency)], ['Cost / lead', money(t.avgCostPerLead, data.currency)], ['Avg duration', t.avgDurationSeconds ? `${Math.floor(t.avgDurationSeconds / 60)}:${String(t.avgDurationSeconds % 60).padStart(2, '0')}` : '—']] : [];
  return <section className="relative overflow-hidden rounded-2xl border border-sky-400/15 bg-gradient-to-r from-blue-950/50 via-[#0c1425] to-cyan-950/30 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Coins className="size-4 text-sky-300" />Call economics</h2><button className={secondaryClass} onClick={onOpen}>Open call analytics<ArrowRight className="h-3.5 w-3.5" /></button></div>
    {!t ? <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" />Loading spend…</p> : !t.calls ? <p className="mt-3 text-sm text-slate-500">Cost per call, per lead and token usage appear here after the first call.</p>
      : <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{items.map(([label, value]) => <div key={label}><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-50">{value}</p></div>)}</div>}
  </section>;
}

function AgentWorkspaceStart({ agent, canManage, dirty, onLaunch, onCampaign, onHistory }: {
  agent: CallingAgent; canManage: boolean; dirty: boolean;
  onLaunch: (agent: CallingAgent) => void; onCampaign: (id: string) => void; onHistory: () => void;
}) {
  const { start } = useCampaignMutations();
  const [error, setError] = useState<string | null>(null);
  const latest = agent.latestCampaign;
  const existing = latest && ['draft', 'paused', 'scheduled', 'queued', 'running'].includes(latest.status) ? latest : null;
  const alreadyCalling = existing?.status === 'running' && existing.runMode === 'immediate'
    && !['calling_hours', 'recipient_quiet_hours'].includes(existing.waitReason || '');
  const historyOnly = !existing && agent.metrics.activeCampaigns > 0;
  const setupIncomplete = !existing && !historyOnly && (agent.availability !== 'active' || !agent.readiness.ready);
  const disabledReason = !canManage ? 'You need calling write permission.' : dirty ? 'Save or discard your changes before starting.'
    : setupIncomplete ? 'Activate this agent and complete its settings before starting.' : null;
  const label = start.isPending ? 'Starting…' : alreadyCalling ? 'Calling now' : existing?.status === 'queued' || historyOnly ? 'Open active campaign' : 'Start Now';

  const startNow = async () => {
    setError(null);
    if (historyOnly) { onHistory(); return; }
    if (!existing) { onLaunch(agent); return; }
    if (alreadyCalling || existing.status === 'queued') { onCampaign(existing._id); return; }
    try {
      const campaign = await start.mutateAsync({ id: existing._id, scheduledAt: null, startNow: true });
      onCampaign(campaign._id);
    } catch (e) { setError(readableError(e)); }
  };

  return <div className="flex w-full shrink-0 flex-col items-start gap-2 sm:w-auto sm:max-w-xs sm:items-end">
    <button type="button" className={primaryClass} disabled={Boolean(disabledReason) || start.isPending} title={disabledReason || undefined} onClick={() => void startNow()}>
      {start.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <PhoneCall className="size-4" aria-hidden="true" />}{label}
    </button>
    <p className="text-xs text-slate-400 sm:text-end">{disabledReason || (alreadyCalling ? 'Open your current queue and live call status.' : historyOnly || existing?.status === 'queued' ? 'Manage the campaign already assigned to this agent.' : 'Start immediately, at any time.')}</p>
    {error && <p role="alert" className="text-xs text-rose-300 sm:text-end">{error}</p>}
  </div>;
}

function AgentConfiguration({ agent, section, canManage, onDirty }: { agent: CallingAgent; section: 'questions' | 'settings'; canManage: boolean; onDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState(() => toInput(agent));
  const [base, setBase] = useState(() => JSON.stringify(toInput(agent)));
  const [version, setVersion] = useState(agent.version);
  const [avatarUrl, setAvatarUrl] = useState(agent.avatarUrl);
  const [subtab, setSubtab] = useState('identity');
  const [error, setError] = useState<string | null>(null);
  const { update } = useAgentMutations();
  const change = (next: CallingAgentInput) => { setDraft(next); onDirty(JSON.stringify(next) !== base); };
  const save = async () => { setError(null); try {
    const saved = await update.mutateAsync({ id: agent._id, version, ...draft, agentConfig: { ...draft.agentConfig, agentName: draft.name } });
    setDraft(toInput(saved)); setBase(JSON.stringify(toInput(saved))); setVersion(saved.version); onDirty(false); showSuccess('Agent configuration saved');
  } catch (e) { setError(readableError(e)); } };
  return <div className="space-y-5">
    {agent.version !== version && <p role="alert" className="text-sm text-amber-300">This agent changed since you opened the editor. Reopen this tab to load the latest version before saving.</p>}
    <fieldset disabled={!canManage || update.isPending} className="min-w-0 space-y-5 disabled:opacity-60">
      {section === 'questions' ? <AgentQuestionTabs value={draft} onChange={change} /> : <AgentTabs label="Agent settings" value={subtab} onChange={setSubtab} items={[{ value: 'identity', label: 'Identity & avatar' }, { value: 'voice', label: 'Voice & instructions' }, { value: 'behavior', label: 'Calling behavior' }]}>
        {subtab === 'identity' && <div className={panelClass}><AgentIdentityFields value={draft} onChange={change} avatarUrl={avatarUrl} onAvatarChange={setAvatarUrl} /><label className="mt-5 block text-xs font-medium text-slate-300">Agent availability<select aria-label="Agent availability" className="mt-2 w-full rounded-lg border border-white/12 bg-[#090f1e] p-2.5 text-sm" value={draft.availability} onChange={e => change({ ...draft, availability: e.target.value as CallingAgentInput['availability'] })}>{['draft', 'active', 'paused', 'archived'].map(value => <option value={value} key={value}>{value}</option>)}</select></label><p className="mt-2 text-xs text-slate-500">Availability controls future launches. Manage running campaigns separately.</p></div>}
        {subtab === 'voice' && <div className={panelClass}><AgentVoiceFields value={draft.agentConfig || {}} onChange={agentConfig => change({ ...draft, agentConfig })} /></div>}
        {subtab === 'behavior' && <AgentExecutionFields value={draft} onChange={change} />}
      </AgentTabs>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><p className="text-xs text-slate-500">Saved changes apply to future campaigns. Existing campaigns retain their configuration.</p><button className={primaryClass} disabled={!canManage || update.isPending || JSON.stringify(draft) === base} onClick={() => void save()}>{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save {section === 'questions' ? 'questions' : 'settings'}</button></div>
  </div>;
}

function AgentLeads({ agent, canManage, onDirty }: { agent: CallingAgent; canManage: boolean; onDirty: (dirty: boolean) => void }) {
  const [selected, setSelected] = useState(() => new Map<string, Lead>(agent.eligibility.leads.map(l => [l.leadId, { id: l.leadId, name: l.name, phone: l.phone, status: l.status as LeadStatus } as Lead])));
  const [version, setVersion] = useState(agent.version);
  const [baseIds, setBaseIds] = useState(() => [...agent.assignedLeadIds].sort().join(','));
  const [review, setReview] = useState(false);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { assign } = useAgentMutations();
  const preview = usePreviewEligibility([...selected.keys()], 'voice');
  const [eligibilityTab, setEligibilityTab] = useState('all');
  const change = (next: Map<string, Lead>) => { setSelected(next); setReview(false); onDirty([...next.keys()].sort().join(',') !== baseIds); };
  const save = async () => { try {
    const result = await assign.mutateAsync({ id: agent._id, leadIds: [...selected.keys()], version });
    setVersion(result.version); setBaseIds([...selected.keys()].sort().join(',')); onDirty(false); setReview(false); showSuccess('Lead assignments saved');
  } catch (e) { setError(readableError(e)); } };
  return <div className={`${panelClass} space-y-4`}><div><h2 className="font-semibold">Assign leads</h2><p className="mt-1 text-xs text-slate-400">Manage this agent&apos;s default selection. Removing an assignment keeps CRM records and previous campaign results.</p></div>
    <fieldset disabled={!canManage || assign.isPending} className="min-w-0"><CampaignLeadPicker purpose="assignment" onBusyChange={setSelectionBusy} selected={selected} onChange={change} /></fieldset>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Assigned', agent.assignedLeadIds.length], ['Selected', selected.size], ['Eligible', selected.size ? preview.data?.eligible ?? '—' : 0], ['Duplicates', preview.data?.reasonCounts.duplicate_phone || 0]].map(([label, count]) => <div key={label} className="rounded-lg border border-white/8 p-3 text-xs"><p className="text-slate-500">{label}</p><p className="mt-1 font-semibold">{count}</p></div>)}</div>
    <EligibilityNotice leadIds={[...selected.keys()]} channel="voice" />
    {preview.data && <details className="text-xs"><summary className="cursor-pointer text-slate-300">Review selected lead eligibility ({preview.data.total - preview.data.eligible} ineligible)</summary><div className="mt-3 space-y-3"><select aria-label="Selected lead eligibility" value={eligibilityTab} onChange={e => setEligibilityTab(e.target.value)} className="rounded-lg border border-white/10 bg-[#090f1e] p-2"><option value="all">All selected leads</option><option value="eligible">Eligible</option><option value="ineligible">Ineligible</option><option value="duplicates">Duplicates</option></select><div className="max-h-60 space-y-2 overflow-y-auto">{preview.data.leads.filter(l => eligibilityTab === 'all' || eligibilityTab === 'eligible' && l.eligible || eligibilityTab === 'ineligible' && !l.eligible || eligibilityTab === 'duplicates' && l.reasons.includes('duplicate_phone')).map(l => <div key={l.leadId} className="flex items-start justify-between gap-3 rounded-lg border border-white/8 p-2"><div><p>{l.name} · {l.phone || 'No phone'}</p>{l.eligible ? <p className="mt-1 text-emerald-300">Eligible</p> : <RecipientReasons leadId={l.leadId} reasons={l.reasons} />}</div><button type="button" disabled={!canManage || assign.isPending} className="text-slate-400 underline" onClick={() => { const next = new Map(selected); next.delete(l.leadId); change(next); }}>Remove</button></div>)}</div></div></details>}

    {agent.eligibility.leads.some(l => !l.eligible) && <details className="text-xs"><summary className="cursor-pointer text-amber-300">Assigned leads requiring attention</summary><div className="mt-2 space-y-2">{agent.eligibility.leads.filter(l => !l.eligible).map(l => <div key={l.leadId}><span className="text-slate-300">{l.name}</span><RecipientReasons leadId={l.leadId} reasons={l.reasons} /></div>)}</div></details>}
    {review && <div className="rounded-xl border border-sky-400/25 bg-sky-400/5 p-4"><p className="text-sm font-semibold">Review assignment · {selected.size} leads</p><div className="my-3 max-h-40 space-y-1 overflow-auto text-xs text-slate-400">{[...selected.values()].map(lead => <p key={lead.id}>{lead.name} · {lead.mobile || lead.phone || 'No phone'}</p>)}</div><p className="mb-3 text-xs text-slate-400">Ineligible leads remain visible for review and will be excluded from calls.</p><button className={primaryClass} disabled={assign.isPending || selectionBusy || !canManage} onClick={() => void save()}>{assign.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Confirm assignments</button></div>}
    {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    <button className={primaryClass} disabled={!canManage || selectionBusy || assign.isPending || [...selected.keys()].sort().join(',') === baseIds} onClick={() => setReview(true)}>Review {selected.size} assignments <ArrowRight className="h-4 w-4" /></button>
  </div>;
}

export function AgentCampaignHistory({ agentId, onCampaign }: { agentId?: string; onCampaign: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const query = useCampaigns({ ...(agentId ? { agentId } : {}), page, limit: 25, ...(status ? { status } : {}) });
  return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-400">{agentId ? 'Campaigns launched with this agent and their original settings.' : 'All campaigns, including legacy campaigns and SMS link campaigns.'}</p><label className="text-xs text-slate-400">Campaign status<select aria-label="Campaign status" className="ml-2 rounded-lg border border-white/10 bg-[#0c1425] p-2" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">All states</option>{['draft', 'scheduled', 'running', 'queued', 'paused', 'completed', 'cancelled', 'failed'].map(s => <option key={s} value={s}>{s}</option>)}</select></label></div>
    <CampaignOverview campaigns={query.data?.data || []} total={query.data?.pagination.total || 0} isLoading={query.isLoading} isError={query.isError} onRetry={() => query.refetch()} onSelect={onCampaign} />
    {query.data && query.data.pagination.pages > 1 && <div className="flex items-center justify-between text-xs text-slate-400"><button className={secondaryClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous campaigns</button><span>Page {page} of {query.data.pagination.pages}</span><button className={secondaryClass} disabled={page >= query.data.pagination.pages} onClick={() => setPage(p => p + 1)}>Next campaigns</button></div>}
  </div>;
}
