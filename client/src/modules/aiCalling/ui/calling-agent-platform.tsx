'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/lib/i18n/language-context';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import { DropdownMenu } from 'radix-ui';
import { Archive, ArrowRight, Bot, Copy, MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useAgentMutations, useCallingAgents } from '../hooks/use-calling-agents';
import { useAiCallingRealtime } from '../hooks/use-ai-calling-realtime';
import { useCampaigns, useTelephonyHealth } from '../hooks/use-ai-calling';
import type { CallingAgent, Campaign } from '../types/ai-calling-types';
const CallingAgentEditor = dynamic(() => import('./calling-agent-editor').then(module => module.CallingAgentEditor), { loading: DeferredCallingView });
const AgentCampaignHistory = dynamic(() => import('./calling-agent-workspace').then(module => module.AgentCampaignHistory), { loading: DeferredCallingView });
const CallingAgentWorkspace = dynamic(() => import('./calling-agent-workspace').then(module => module.CallingAgentWorkspace), { loading: DeferredCallingView });
const AgentLaunchDialog = dynamic(() => import('./agent-launch-dialog').then(module => module.AgentLaunchDialog), { loading: DeferredCallingView });
import { AgentAvatar, AgentDialog, AgentMetric, AgentTabs, inputClass, panelClass, primaryClass, readableError, secondaryClass } from './calling-agent-primitives';
import { StatusPill } from './status-pill';
const CampaignDetailDrawer = dynamic(() => import('./campaign-detail-drawer').then(module => module.CampaignDetailDrawer), { loading: DeferredCallingView });
const CampaignWizard = dynamic(() => import('./campaign-wizard').then(module => module.CampaignWizard), { loading: DeferredCallingView });
const TelephonyBanner = dynamic(() => import('./campaign-overview').then(module => module.TelephonyBanner), { loading: DeferredCallingView });
const PairedPhonesPanel = dynamic(() => import('./paired-phones-panel').then(module => module.PairedPhonesPanel), { loading: DeferredCallingView });
const VoiceKillSwitch = dynamic(() => import('./voice-kill-switch').then(module => module.VoiceKillSwitch), { loading: DeferredCallingView });
const VoiceProviderSettingsPanel = dynamic(() => import('./voice-provider-settings').then(module => module.VoiceProviderSettingsPanel), { loading: DeferredCallingView });
const LinkKillSwitch = dynamic(() => import('./link-kill-switch').then(module => module.LinkKillSwitch), { loading: DeferredCallingView });
const CallHistoryPanel = dynamic(() => import('./call-history-panel').then(module => module.CallHistoryPanel), { loading: DeferredCallingView });
const AnalyticsPanel = dynamic(() => import('./analytics-panel').then(module => module.AnalyticsPanel), { loading: DeferredCallingView });
const QualityDashboard = dynamic(() => import('./quality-dashboard').then(module => module.QualityDashboard), { loading: DeferredCallingView });
const BenchmarkWorkspace = dynamic(() => import('./benchmark-workspace').then(module => module.BenchmarkWorkspace), { loading: DeferredCallingView });
const AgentTestLauncher = dynamic(() => import('./agent-test-studio').then(module => module.AgentTestLauncher), { loading: DeferredCallingView });
const AgentTestStudio = dynamic(() => import('./agent-test-studio').then(module => module.AgentTestStudio), { loading: DeferredCallingView });
const IntelligenceReviewQueue = dynamic(() => import('./intelligence-review-queue').then(module => module.IntelligenceReviewQueue), { loading: DeferredCallingView });
const KnowledgeBasePanel = dynamic(() => import('./knowledge-base-panel').then(module => module.KnowledgeBasePanel), { loading: DeferredCallingView });
const TransferAvailability = dynamic(() => import('./transfer-availability').then(module => module.TransferAvailability), { loading: DeferredCallingView });

function DeferredCallingView() {
  const { t } = useLanguage();
  return <div role="status" aria-busy="true" className="space-y-3 py-5">
    <span className="sr-only">{t('common.loading')}</span>
    <div aria-hidden="true" className="h-6 w-48 animate-pulse rounded-lg bg-muted" />
    <div aria-hidden="true" className="h-36 animate-pulse rounded-xl border border-border bg-muted/40" />
  </div>;
}

export function CallingAgentPlatform({ initialAgentId = null }: { initialAgentId?: string | null } = {}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState('agents');
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
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
  return <div className="h-full space-y-5 overflow-y-auto bg-card p-4 text-foreground sm:p-6">
    {agentId ? <CallingAgentWorkspace key={agentId} id={agentId} initialTab={workspaceTab} onBack={() => {
      setAgentId(null);
      if (initialAgentId) {
        const url = new URL(window.location.href);
        url.searchParams.delete('agent');
        window.history.replaceState(window.history.state, '', url);
      }
    }} onLaunch={setLaunchAgent} onCampaign={setCampaignId} /> : <>
      <header className="flex flex-wrap items-start justify-between gap-4 py-1"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-400/20 bg-gradient-to-br from-blue-500/15 to-cyan-500/15"><Bot className="h-5 w-5 text-primary" /></span><div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('callingExperience.agents')}</h1><p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{t('callingExperience.intro')}</p></div></div><button className={primaryClass} disabled={!canManage} onClick={() => setCreating(true)}><Plus className="h-4 w-4" />{t('callingExperience.create')}</button></header>
      <AgentTabs label={t('callingExperience.sections')} value={tab} onChange={setTab} items={[{ value: 'agents', label: t('callingExperience.agents') }, { value: 'campaigns', label: t('callingExperience.campaigns') }, { value: 'calls', label: t('callingExperience.calls') }, { value: 'analytics', label: t('callingExperience.analytics') }, { value: 'quality', label: t('callingExperience.quality') }, { value: 'benchmarks', label: t('callingExperience.benchmarks') }, { value: 'review', label: t('callingExperience.review') }, { value: 'knowledge', label: t('callingExperience.knowledge') }, { value: 'testing', label: t('callingExperience.testing') }, { value: 'connections', label: t('callingExperience.connections') }]}>
        {tab === 'agents' && <CallingAgentGallery canManage={canManage} onOpen={openAgent} onLaunch={setLaunchAgent} onCreate={() => setCreating(true)} onCampaign={setCampaignId} />}
        {tab === 'campaigns' && <><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{t('callingExperience.campaigns')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('callingExperience.savedRun')}</p></div><button className={secondaryClass} disabled={!canManage} onClick={() => { setEditingCampaign(null); setLegacyWizard(true); }}>{t('callingExperience.legacy')}</button></div><AgentCampaignHistory onCampaign={setCampaignId} /></>}
        {tab === 'calls' && <CallHistoryPanel />}
        {tab === 'analytics' && <AnalyticsPanel />}
        {tab === 'quality' && <QualityDashboard />}
        {tab === 'benchmarks' && <BenchmarkWorkspace />}
        {tab === 'review' && <IntelligenceReviewQueue />}
        {tab === 'knowledge' && <KnowledgeBasePanel />}
        {tab === 'testing' && <AgentTestLauncher campaigns={campaigns.data?.data || []} livekitReady={Boolean(telephony.data?.livekitReady || telephony.data?.configured)} onOpen={() => setTesting(true)} />}
        {tab === 'connections' && <><TelephonyBanner telephony={telephony.data} failed={telephony.isError} />{(isAdmin || hasPermission('ai-calling:admin')) && <VoiceProviderSettingsPanel />}<TransferAvailability /><PairedPhonesPanel /><div className="grid gap-4 xl:grid-cols-2"><VoiceKillSwitch /><LinkKillSwitch /></div></>}
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
  const { t, locale } = useLanguage();
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
    <section aria-label={t('callingExperience.summary')} className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[
      [t('callingExperience.total'), summary?.agents], [t('callingExperience.activeCampaigns'), summary?.activeCampaigns], [t('callingExperience.inProgress'), summary?.inProgress], [t('callingExperience.completed'), summary?.completed], [t('callingExperience.eligible'), summary?.eligible],
    ].map(([label, value]) => <AgentMetric key={label} label={String(label)} value={query.isLoading ? '—' : value ?? '—'} />)}</section>
    <div className="flex flex-wrap gap-2"><div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label={t('callingExperience.search')} className={`${inputClass} ps-9`} placeholder={t('callingExperience.searchHint')} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>
      <GalleryFilter label={t('callingExperience.availability')} value={availability} onChange={v => { setAvailability(v); setPage(1); }} options={[['', t('callingExperience.all')], ['active', t('callingExperience.active')], ['draft', t('callingExperience.draft')], ['paused', t('callingExperience.paused')], ['archived', t('callingExperience.archived')]]} />
      <GalleryFilter label={t('callingExperience.configuration')} value={readiness} onChange={v => { setReadiness(v); setPage(1); }} options={[['', t('callingExperience.anyConfig')], ['ready', t('callingExperience.ready')], ['incomplete', t('callingExperience.incomplete')]]} />
      <GalleryFilter label={t('callingExperience.activity')} value={campaignStatus} onChange={v => { setCampaignStatus(v); setPage(1); }} options={[['', t('callingExperience.anyActivity')], ['active', t('callingExperience.activeCampaigns')], ['none', t('callingExperience.noneActive')]]} />
      <GalleryFilter label={t('callingExperience.sort')} value={sort} onChange={setSort} options={[['updated', t('callingExperience.updated')], ['active', t('callingExperience.recentActive')], ['name', t('callingExperience.nameOrder')]]} />
    </div>
    {query.isLoading && <div role="status" aria-label={t('callingExperience.loading')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[0, 1, 2, 3].map(n => <div key={n} className="h-72 animate-pulse rounded-2xl border border-border bg-muted/40" />)}</div>}
    {query.isError && <div role="alert" className={`${panelClass} space-y-3 text-sm text-rose-700 dark:text-rose-300`}><p>{t('callingExperience.loadError')}</p><button className={secondaryClass} onClick={() => query.refetch()}>{t('callingExperience.retry')}</button></div>}
    {query.isSuccess && !query.data.data.length && <div className={`${panelClass} py-16 text-center`}><Bot className="mx-auto h-10 w-10 text-primary/70" /><h2 className="mt-4 text-lg font-semibold">{search || availability || readiness || campaignStatus ? t('callingExperience.noMatch') : t('callingExperience.empty')}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{search || availability || readiness || campaignStatus ? t('callingExperience.adjust') : t('callingExperience.emptyHint')}</p><button className={`${primaryClass} mt-5`} disabled={!canManage} onClick={onCreate}><Plus className="h-4 w-4" />{t('callingExperience.create')}</button></div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{query.data?.data.map(agent => <article key={agent._id} className="group flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-[0_12px_32px_rgba(0,0,0,.12)] transition hover:border-sky-400/30">
      <div className="flex items-start justify-between gap-2"><button type="button" aria-label={t('callingExperience.openNamed', { name: agent.name })} onClick={() => onOpen(agent._id)} className="flex min-w-0 items-center gap-3 text-start"><AgentAvatar name={agent.name} url={agent.avatarUrl} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{agent.name}</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{agent.title || t('callingExperience.agent')}</span></span></button><StatusPill status={agent.availability} /></div>
      <p className="mb-4 mt-4 line-clamp-2 min-h-10 text-xs leading-relaxed text-muted-foreground">{agent.description || t('callingExperience.descriptionHint')}</p>
      <div className="grid grid-cols-2 gap-3 border-y border-border py-3 text-xs"><button type="button" onClick={() => onOpen(agent._id, 'leads')} className="rounded-md text-start hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-400" aria-label={t('callingExperience.manageNamed', { name: agent.name })}><p className="text-muted-foreground">{agent.assignedLeadIds.length}</p><p className="mt-1 text-[10px] text-muted-foreground">{t('callingExperience.assigned')}</p></button><div><p className="text-muted-foreground">{agent.metrics.activeCampaigns}</p><p className="mt-1 text-[10px] text-muted-foreground">{t('callingExperience.activeCampaigns')}</p></div></div>
      <div className="mt-3 flex min-h-8 flex-wrap items-center justify-between gap-2 text-[10px]"><span className={agent.readiness.ready ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{agent.readiness.ready ? t('callingExperience.readyCount', { count: agent.eligibility.eligible }) : t('callingExperience.configIncomplete')}</span>{agent.latestCampaign && <StatusPill status={agent.latestCampaign.status === 'running' ? agent.metrics.inProgress ? 'calling' : agent.latestCampaign.waitReason ? 'waiting' : 'queued' : agent.latestCampaign.status} />}</div>
      <p className="mt-1 text-[10px] text-muted-foreground">{agent.lastActiveAt ? t('callingExperience.lastActive', { date: new Date(agent.lastActiveAt).toLocaleDateString(intlLocaleFor(locale)) }) : t('callingExperience.updatedDate', { date: new Date(agent.updatedAt).toLocaleDateString(intlLocaleFor(locale)) })}</p>
      <button type="button" className={`${secondaryClass} mt-4 w-full text-xs`} disabled={!canManage} onClick={() => onOpen(agent._id, 'leads')} aria-label={t('callingExperience.assignNamed', { name: agent.name })}><Users className="h-3.5 w-3.5" />{t('callingExperience.assign')}</button>
      <div className="mt-3 flex gap-2"><button className={`${primaryClass} min-w-0 flex-1 px-2 text-xs`} disabled={!canManage || (agent.metrics.activeCampaigns === 0 && (!agent.readiness.ready || agent.availability !== 'active'))} onClick={() => { if (agent.metrics.activeCampaigns > 0) { if (agent.latestCampaign && ['running', 'queued', 'scheduled'].includes(agent.latestCampaign.status)) onCampaign(agent.latestCampaign._id); else onOpen(agent._id, 'history'); } else onLaunch(agent); }}>{agent.metrics.activeCampaigns > 0 ? t('callingExperience.openCampaign') : t('callingExperience.start')}</button><button className={`${secondaryClass} px-2.5 text-xs`} onClick={() => onOpen(agent._id)}>{t('callingExperience.open')} <ArrowRight className="h-3 w-3" /></button>
        <DropdownMenu.Root><DropdownMenu.Trigger aria-label={t('callingExperience.actionsNamed', { name: agent.name })} className={`${secondaryClass} px-2`}><MoreHorizontal className="h-4 w-4" /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" className="z-40 min-w-44 rounded-xl border border-border bg-card p-1 text-xs text-muted-foreground shadow-xl">{[
          { label: t('callingExperience.edit'), icon: Pencil, run: () => onOpen(agent._id), disabled: !canManage },
          { label: t('callingExperience.duplicate'), icon: Copy, run: async () => { try { const copy = await actions.duplicate.mutateAsync(agent._id); onOpen(copy._id); } catch { /* mutation reports the error */ } }, disabled: !canManage || busy },
          { label: t('callingExperience.archive'), icon: Archive, run: () => { setError(null); setConfirm({ agent, action: 'archive' }); }, disabled: !canManage || busy || agent.availability === 'archived' },
          { label: t('callingExperience.delete'), icon: Trash2, run: () => { setError(null); setConfirm({ agent, action: 'delete' }); }, disabled: !canManage || busy || agent.metrics.campaigns > 0 },
        ].map(item => <DropdownMenu.Item key={item.label} disabled={item.disabled} onSelect={() => void item.run()} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 outline-none data-[disabled]:opacity-35 data-[highlighted]:bg-muted"><item.icon className="h-3.5 w-3.5" />{item.label}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
      </div>
    </article>)}</div>
    {query.data && query.data.pagination.pages > 1 && <div className="flex items-center justify-between text-xs text-muted-foreground"><button className={secondaryClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('callingExperience.previous')}</button><span>{t('callingExperience.page', { page, pages: query.data.pagination.pages })}</span><button className={secondaryClass} disabled={page >= query.data.pagination.pages} onClick={() => setPage(p => p + 1)}>{t('callingExperience.next')}</button></div>}
    {confirm && <AgentDialog title={t(confirm.action === 'archive' ? 'callingExperience.archiveTitle' : 'callingExperience.deleteTitle', { name: confirm.agent.name })} description={confirm.action === 'archive' ? t('callingExperience.archiveHint') : t('callingExperience.deleteHint')} onClose={() => { if (!busy) setConfirm(null); }}><div className="space-y-4">{error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}<div className="flex justify-end gap-2"><button className={secondaryClass} disabled={busy} onClick={() => setConfirm(null)}>{t('callingExperience.keep')}</button><button className={primaryClass} disabled={busy} onClick={() => void confirmAction()}>{busy ? t('callingExperience.saving') : confirm.action === 'archive' ? t('callingExperience.archive') : t('callingExperience.delete')}</button></div></div></AgentDialog>}
  </div>;
}

function GalleryFilter({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (next: string) => void }) {
  return <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} className="min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground outline-none focus:border-sky-400">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>;
}
