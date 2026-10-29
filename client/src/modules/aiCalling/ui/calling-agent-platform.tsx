'use client';
import { useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { Archive, ArrowRight, Bot, Copy, MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useAgentMutations, useCallingAgents } from '../hooks/use-calling-agents';
import { useAiCallingRealtime } from '../hooks/use-ai-calling-realtime';
import { useCampaigns, useTelephonyHealth } from '../hooks/use-ai-calling';
import type { CallingAgent, Campaign } from '../types/ai-calling-types';
import { CallingAgentEditor } from './calling-agent-editor';
import { AgentCampaignHistory, CallingAgentWorkspace } from './calling-agent-workspace';
import { AgentLaunchDialog } from './agent-launch-dialog';
import { AgentAvatar, AgentDialog, AgentMetric, AgentTabs, inputClass, panelClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';
import { StatusPill } from './status-pill';
import { CampaignDetailDrawer } from './campaign-detail-drawer';
import { CampaignWizard } from './campaign-wizard';
import { TelephonyBanner } from './campaign-overview';
import { PairedPhonesPanel } from './paired-phones-panel';
import { VoiceKillSwitch } from './voice-kill-switch';
import { LinkKillSwitch } from './link-kill-switch';
import { CallHistoryPanel } from './call-history-panel';
import { AnalyticsPanel } from './analytics-panel';
import { QualityDashboard } from './quality-dashboard';
import { BenchmarkWorkspace } from './benchmark-workspace';
import { AgentTestLauncher, AgentTestStudio } from './agent-test-studio';
import { IntelligenceReviewQueue } from './intelligence-review-queue';
import { KnowledgeBasePanel } from './knowledge-base-panel';
import { TransferAvailability } from './transfer-availability';

export function CallingAgentPlatform() {
  const [tab, setTab] = useState('agents');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState('overview');
  const [creating, setCreating] = useState(false);
  const [launchAgent, setLaunchAgent] = useState<CallingAgent | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [legacyWizard, setLegacyWizard] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [testing, setTesting] = useState(false);
  const { isAdmin, hasPermission } = usePermissions();
  const canManage = isAdmin || ['ai-calling:write', 'crm:write', 'crm:admin'].some(hasPermission);
  const campaigns = useCampaigns({ limit: 100 });
  const telephony = useTelephonyHealth();
  useAiCallingRealtime();
  const openAgent = (id: string, section = 'overview') => { setWorkspaceTab(section); setAgentId(id); setCreating(false); };
  return <div className="dark h-full space-y-5 overflow-y-auto bg-[#070b14] p-4 text-slate-100 sm:p-6">
    {agentId ? <CallingAgentWorkspace key={agentId} id={agentId} initialTab={workspaceTab} onBack={() => setAgentId(null)} onLaunch={setLaunchAgent} onCampaign={setCampaignId} /> : <>
      <header className="flex flex-wrap items-start justify-between gap-4 py-1"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-400/20 bg-gradient-to-br from-blue-500/15 to-cyan-500/15"><Bot className="h-5 w-5 text-sky-300" /></span><div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Calling Agents</h1><p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">Create your AI callers, assign leads, and manage every conversation.</p></div></div><button className={primaryClass} disabled={!canManage} onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Create Agent</button></header>
      <AgentTabs label="AI Calling sections" value={tab} onChange={setTab} items={[{ value: 'agents', label: 'Calling Agents' }, { value: 'campaigns', label: 'Campaign History' }, { value: 'calls', label: 'Call History' }, { value: 'analytics', label: 'Analytics' }, { value: 'quality', label: 'Quality' }, { value: 'benchmarks', label: 'Benchmarks' }, { value: 'review', label: 'Review Queue' }, { value: 'knowledge', label: 'Knowledge' }, { value: 'testing', label: 'Test Studio' }, { value: 'connections', label: 'Connections' }]}>
        {tab === 'agents' && <CallingAgentGallery canManage={canManage} onOpen={openAgent} onLaunch={setLaunchAgent} onCreate={() => setCreating(true)} onCampaign={setCampaignId} />}
        {tab === 'campaigns' && <><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Campaign History</h2><p className="mt-1 text-xs text-slate-500">Every run retains its questions, leads and calling configuration.</p></div><button className={secondaryClass} disabled={!canManage} onClick={() => { setEditingCampaign(null); setLegacyWizard(true); }}>Legacy / SMS campaign</button></div><AgentCampaignHistory onCampaign={setCampaignId} /></>}
        {tab === 'calls' && <CallHistoryPanel />}
        {tab === 'analytics' && <AnalyticsPanel />}
        {tab === 'quality' && <QualityDashboard />}
        {tab === 'benchmarks' && <BenchmarkWorkspace />}
        {tab === 'review' && <IntelligenceReviewQueue />}
        {tab === 'knowledge' && <KnowledgeBasePanel />}
        {tab === 'testing' && <AgentTestLauncher campaigns={campaigns.data?.data || []} livekitReady={Boolean(telephony.data?.livekitReady || telephony.data?.configured)} onOpen={() => setTesting(true)} />}
        {tab === 'connections' && <><TelephonyBanner telephony={telephony.data} failed={telephony.isError} /><TransferAvailability /><PairedPhonesPanel /><div className="grid gap-4 xl:grid-cols-2"><VoiceKillSwitch /><LinkKillSwitch /></div></>}
      </AgentTabs>
    </>}
    {creating && <CallingAgentEditor onClose={() => setCreating(false)} onCreated={openAgent} />}
    {launchAgent && <AgentLaunchDialog agent={launchAgent} onClose={() => setLaunchAgent(null)} onConnections={() => { setLaunchAgent(null); setAgentId(null); setTab('connections'); }} onLaunched={id => { setLaunchAgent(null); setCampaignId(id); }} />}
    {campaignId && <CampaignDetailDrawer campaignId={campaignId} onClose={() => setCampaignId(null)} onEdit={campaign => { setEditingCampaign(campaign); setLegacyWizard(true); }} />}
    {legacyWizard && <CampaignWizard campaign={editingCampaign || undefined} onClose={() => { setLegacyWizard(false); setEditingCampaign(null); }} onCreated={id => { setLegacyWizard(false); setEditingCampaign(null); setCampaignId(id); }} />}
    {testing && <AgentTestStudio campaigns={campaigns.data?.data || []} telephony={telephony.data} onClose={() => setTesting(false)} onCreateCampaign={() => { setTesting(false); setEditingCampaign(null); setLegacyWizard(true); }} />}
  </div>;
}

function CallingAgentGallery({ canManage, onOpen, onLaunch, onCreate, onCampaign }: { canManage: boolean; onOpen: (id: string, section?: string) => void; onLaunch: (agent: CallingAgent) => void; onCreate: () => void; onCampaign: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);
  const [availability, setAvailability] = useState('');
  const [readiness, setReadiness] = useState('');
  const [campaignStatus, setCampaignStatus] = useState('');
  const [sort, setSort] = useState('updated');
  const [page, setPage] = useState(1);
  const query = useCallingAgents({ search: q, availability: availability || undefined, readiness: readiness || undefined, campaignStatus: campaignStatus || undefined, sort, page });
  const actions = useAgentMutations();
  const [confirm, setConfirm] = useState<{ agent: CallingAgent; action: 'archive' | 'delete' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const summary = query.data?.summary;
  const busy = actions.update.isPending || actions.remove.isPending || actions.duplicate.isPending;
  const confirmAction = async () => { if (!confirm) return; setError(null); try {
    if (confirm.action === 'archive') await actions.update.mutateAsync({ id: confirm.agent._id, version: confirm.agent.version, availability: 'archived' });
    else await actions.remove.mutateAsync(confirm.agent._id);
    setConfirm(null);
  } catch (e) { setError(readableError(e)); } };
  return <div className="space-y-5">
    <section aria-label="Agent summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[
      ['Total agents', summary?.agents], ['Active campaigns', summary?.activeCampaigns], ['Calls in progress', summary?.inProgress], ['Completed calls', summary?.completed], ['Eligible assignments', summary?.eligible],
    ].map(([label, value]) => <AgentMetric key={label} label={String(label)} value={query.isLoading ? '—' : value ?? '—'} />)}</section>
    <div className="flex flex-wrap gap-2"><div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" /><input aria-label="Search agents" className={`${inputClass} pl-9`} placeholder="Search agents by name or title…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
      <GalleryFilter label="Agent availability" value={availability} onChange={v => { setAvailability(v); setPage(1); }} options={[['', 'All agents'], ['active', 'Active'], ['draft', 'Draft'], ['paused', 'Paused'], ['archived', 'Archived']]} />
      <GalleryFilter label="Configuration status" value={readiness} onChange={v => { setReadiness(v); setPage(1); }} options={[['', 'Any configuration'], ['ready', 'Ready'], ['incomplete', 'Incomplete']]} />
      <GalleryFilter label="Agent campaign activity" value={campaignStatus} onChange={v => { setCampaignStatus(v); setPage(1); }} options={[['', 'Any campaign activity'], ['active', 'Active campaigns'], ['none', 'No active campaign']]} />
      <GalleryFilter label="Sort agents" value={sort} onChange={setSort} options={[['updated', 'Recently updated'], ['active', 'Recently active'], ['name', 'Name A–Z']]} />
    </div>
    {query.isLoading && <div role="status" aria-label="Loading agents" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[0, 1, 2, 3].map(n => <div key={n} className="h-72 animate-pulse rounded-2xl border border-white/8 bg-white/3" />)}</div>}
    {query.isError && <div role="alert" className={`${panelClass} space-y-3 text-sm text-rose-300`}><p>Calling agents could not be loaded.</p><button className={secondaryClass} onClick={() => query.refetch()}>Try again</button></div>}
    {query.isSuccess && !query.data.data.length && <div className={`${panelClass} py-16 text-center`}><Bot className="mx-auto h-10 w-10 text-sky-300/70" /><h2 className="mt-4 text-lg font-semibold">{search || availability || readiness || campaignStatus ? 'No agents match these filters' : 'Your next conversation starts here'}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{search || availability || readiness || campaignStatus ? 'Try another name or adjust the filters.' : 'Create an agent, give it a voice and questions, then assign leads when you’re ready.'}</p><button className={`${primaryClass} mt-5`} disabled={!canManage} onClick={onCreate}><Plus className="h-4 w-4" />Create Agent</button></div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{query.data?.data.map(agent => <article key={agent._id} className="group flex min-w-0 flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-[#101b31] to-[#0b1223] p-4 shadow-[0_12px_32px_rgba(0,0,0,.12)] transition hover:border-sky-400/30">
      <div className="flex items-start justify-between gap-2"><button type="button" aria-label={`Open ${agent.name}`} onClick={() => onOpen(agent._id)} className="flex min-w-0 items-center gap-3 text-left"><AgentAvatar name={agent.name} url={agent.avatarUrl} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-100">{agent.name}</span><span className="mt-1 block truncate text-[11px] text-slate-400">{agent.title || 'Calling agent'}</span></span></button><StatusPill status={agent.availability} /></div>
      <p className="mb-4 mt-4 line-clamp-2 min-h-10 text-xs leading-relaxed text-slate-400">{agent.description || 'Add a description to help your team understand this agent’s role.'}</p>
      <div className="grid grid-cols-2 gap-3 border-y border-white/8 py-3 text-xs"><button type="button" onClick={() => onOpen(agent._id, 'leads')} className="rounded-md text-left hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-400" aria-label={`Manage assigned leads for ${agent.name}`}><p className="text-slate-300">{agent.assignedLeadIds.length}</p><p className="mt-1 text-[10px] text-slate-500">Assigned leads</p></button><div><p className="text-slate-300">{agent.metrics.activeCampaigns}</p><p className="mt-1 text-[10px] text-slate-500">Active campaigns</p></div></div>
      <div className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-2 text-[10px]"><span className={agent.readiness.ready ? 'text-emerald-300' : 'text-amber-300'}>{agent.readiness.ready ? `${agent.eligibility.eligible} eligible · Ready` : 'Configuration incomplete'}</span>{agent.latestCampaign && <StatusPill status={agent.latestCampaign.status === 'running' ? agent.metrics.inProgress ? 'calling' : agent.latestCampaign.waitReason ? 'waiting' : 'queued' : agent.latestCampaign.status} />}</div>
      <p className="mt-1 text-[10px] text-slate-600">{agent.lastActiveAt ? `Last active ${new Date(agent.lastActiveAt).toLocaleDateString()}` : `Updated ${new Date(agent.updatedAt).toLocaleDateString()}`}</p>
      <button type="button" className={`${secondaryClass} mt-4 w-full text-xs`} disabled={!canManage} onClick={() => onOpen(agent._id, 'leads')} aria-label={`Assign leads to ${agent.name}`}><Users className="h-3.5 w-3.5" />Assign leads</button>
      <div className="mt-3 flex gap-2"><button className={`${primaryClass} min-w-0 flex-1 px-2 text-xs`} disabled={!canManage || (agent.metrics.activeCampaigns === 0 && (!agent.readiness.ready || agent.availability !== 'active'))} onClick={() => { if (agent.metrics.activeCampaigns > 0) { if (agent.latestCampaign && ['running', 'queued', 'scheduled'].includes(agent.latestCampaign.status)) onCampaign(agent.latestCampaign._id); else onOpen(agent._id, 'history'); } else onLaunch(agent); }}>{agent.metrics.activeCampaigns > 0 ? 'Open active campaign' : 'Start Campaign'}</button><button className={`${secondaryClass} px-2.5 text-xs`} onClick={() => onOpen(agent._id)}>Open <ArrowRight className="h-3 w-3" /></button>
        <DropdownMenu.Root><DropdownMenu.Trigger aria-label={`Actions for ${agent.name}`} className={`${secondaryClass} px-2`}><MoreHorizontal className="h-4 w-4" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" className="dark z-40 min-w-44 rounded-xl border border-white/12 bg-[#10192c] p-1 text-xs text-slate-300 shadow-xl">{[
          { label: 'Edit agent', icon: Pencil, run: () => onOpen(agent._id), disabled: !canManage },
          { label: 'Duplicate agent', icon: Copy, run: async () => { try { const copy = await actions.duplicate.mutateAsync(agent._id); onOpen(copy._id); } catch { /* mutation reports the error */ } }, disabled: !canManage || busy },
          { label: 'Archive agent', icon: Archive, run: () => { setError(null); setConfirm({ agent, action: 'archive' }); }, disabled: !canManage || busy || agent.availability === 'archived' },
          { label: 'Delete agent', icon: Trash2, run: () => { setError(null); setConfirm({ agent, action: 'delete' }); }, disabled: !canManage || busy || agent.metrics.campaigns > 0 },
        ].map(item => <DropdownMenu.Item key={item.label} disabled={item.disabled} onSelect={() => void item.run()} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 outline-none data-[disabled]:opacity-35 data-[highlighted]:bg-white/8"><item.icon className="h-3.5 w-3.5" />{item.label}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
      </div>
    </article>)}</div>
    {query.data && query.data.pagination.pages > 1 && <div className="flex items-center justify-between text-xs text-slate-400"><button className={secondaryClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous agents</button><span>Page {page} of {query.data.pagination.pages}</span><button className={secondaryClass} disabled={page >= query.data.pagination.pages} onClick={() => setPage(p => p + 1)}>Next agents</button></div>}
    {confirm && <AgentDialog title={`${confirm.action === 'archive' ? 'Archive' : 'Delete'} ${confirm.agent.name}?`} description={confirm.action === 'archive' ? 'Archiving prevents future launches. Campaign history and saved settings are retained.' : 'This permanently removes this agent and its default assignments. CRM leads and gallery images are retained.'} onClose={() => { if (!busy) setConfirm(null); }}><div className="space-y-4">{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<div className="flex justify-end gap-2"><button className={secondaryClass} disabled={busy} onClick={() => setConfirm(null)}>Keep agent</button><button className={primaryClass} disabled={busy} onClick={() => void confirmAction()}>{busy ? 'Saving…' : confirm.action === 'archive' ? 'Archive agent' : 'Delete agent'}</button></div></div></AgentDialog>}
  </div>;
}

function GalleryFilter({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (next: string) => void }) {
  return <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} className="min-w-0 rounded-lg border border-white/12 bg-[#0c1425] px-3 py-2 text-xs text-slate-400 outline-none focus:border-sky-400">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>;
}
