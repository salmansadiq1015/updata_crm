'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Activity, BarChart3, Bot, Coins, History, Inbox, LayoutGrid, PhoneIncoming, Radio, Settings2, Smartphone, Workflow, type LucideIcon } from 'lucide-react';
import { HeroStat } from '@/shared/components/hero-art';
import { HeroPill, PageHero, heroButton, pageTabs } from '@/shared/components/page-hero';
import { Tabs } from 'radix-ui';
import { useDrawer } from '@/shared/hooks/use-drawer';
import { useInboundDevices, useInboundList, useInboundLive, useInboundRealtime, useInboundSettings, useInboundStats } from '../hooks/use-inbound-calls';
import { browserTimeZone, filtersToQuery, formatDuration, formatRate, rangeFor } from '../inbound-domain';
import { incomingStyles as styles } from './incoming-calls-styles';
import { useInboundLanguage } from './use-inbound-language';
import type { InboundFilters } from '../types/inbound-call-types';
import { OverviewTab } from './overview-tab';

function Deferred() {
  return <div role="status" aria-busy="true" className="space-y-3 py-5"><div className="h-6 w-48 animate-pulse rounded-lg bg-muted" /><div className="h-36 animate-pulse rounded-xl border border-border bg-muted/40" /></div>;
}
const LiveMonitorTab = dynamic(() => import('./live-monitor-tab').then((m) => m.LiveMonitorTab), { loading: Deferred });
const HistoryTab = dynamic(() => import('./history-tab').then((m) => m.HistoryTab), { loading: Deferred });
const AnalyticsTab = dynamic(() => import('./analytics-tab').then((m) => m.AnalyticsTab), { loading: Deferred });
const RulesTab = dynamic(() => import('./rules-tab').then((m) => m.RulesTab), { loading: Deferred });
const SettingsTab = dynamic(() => import('./settings-tab').then((m) => m.SettingsTab), { loading: Deferred });
const DevicesTab = dynamic(() => import('./devices-tab').then((m) => m.DevicesTab), { loading: Deferred });
const CallDetailDrawer = dynamic(() => import('./call-detail-drawer').then((m) => m.CallDetailDrawer));
const CostsTab = dynamic(() => import('./costs-tab').then((m) => m.CostsTab), { loading: Deferred });
const AgentsTab = dynamic(() => import('./agents-tab').then((m) => m.AgentsTab), { loading: Deferred });
// The same agent workspace the AI Calling page opens (settings incl. the receptionist fields).
const CallingAgentWorkspace = dynamic(() => import('@/modules/aiCalling/ui/calling-agent-workspace').then((m) => m.CallingAgentWorkspace), { loading: Deferred });

// Keep each tab and its icon together so a new section cannot lack an icon.
const INBOUND_TAB_ITEMS = [
  { value: 'overview', icon: LayoutGrid },
  { value: 'agents', icon: Bot },
  { value: 'live', icon: Activity },
  { value: 'history', icon: History },
  { value: 'analytics', icon: BarChart3 },
  { value: 'costs', icon: Coins },
  { value: 'rules', icon: Workflow },
  { value: 'settings', icon: Settings2 },
  { value: 'devices', icon: Smartphone },
] as const satisfies ReadonlyArray<{ value: string; icon: LucideIcon }>;
export const INBOUND_TABS = INBOUND_TAB_ITEMS.map(({ value }) => value);
export type InboundTab = (typeof INBOUND_TABS)[number];

/** Incoming Calls: the AI receptionist on the owner's connected phone(s). */
export function IncomingCallsWorkspace({ initialTab = 'overview', initialAgentId = null }: { initialTab?: string; initialAgentId?: string | null }) {
  const { t, intlLocale } = useInboundLanguage();
  const [tab, setTab] = useState<InboundTab>((INBOUND_TABS as readonly string[]).includes(initialTab) ? initialTab as InboundTab : 'overview');
  const drawer = useDrawer('call');
  const router = useRouter();
  const [agentId, setAgentId] = useState<string | null>(initialAgentId);
  const [historyPreset, setHistoryPreset] = useState<Partial<InboundFilters> | null>(null);
  const settings = useInboundSettings();
  const live = useInboundLive();
  useInboundRealtime();
  const liveCount = live.data?.length ?? 0;
  const labels: Record<InboundTab, string> = {
    overview: t('inbound.tabs.overview', 'Overview'),
    agents: t('inbound.tabs.agents', 'Agents'),
    live: liveCount ? `${t('inbound.tabs.live', 'Live Monitor')} (${liveCount})` : t('inbound.tabs.live', 'Live Monitor'),
    history: t('inbound.tabs.history', 'History'),
    analytics: t('inbound.tabs.analytics', 'Analytics'),
    costs: t('inbound.tabs.costs', 'Costs'),
    rules: t('inbound.tabs.rules', 'Rules'),
    settings: t('inbound.tabs.settings', 'Settings'),
    devices: t('inbound.tabs.devices', 'Connected Devices'),
  };
  const enabled = settings.data?.enabled;
  // Same 30-day query the Overview tab opens with, so both share one cached request.
  const statsParams = useMemo(() => { const r = rangeFor('30d'); return filtersToQuery({ from: r.from, to: r.to }, { tz: browserTimeZone() }); }, []);
  const stats = useInboundStats(statsParams);
  const s = stats.data;
  // Live operational figures (period totals live in the Overview tab); same queries the tabs use.
  const openCalls = useInboundList(useMemo(() => ({ workStatus: 'open', page: 1, limit: 1 }), []));
  const devices = useInboundDevices();
  const devicesOnline = (devices.data ?? []).filter((d) => d.online).length;
  const devicesOffline = (devices.data?.length ?? 0) - devicesOnline;
  const num = (v: number | undefined) => (v == null ? '—' : v.toLocaleString(intlLocale));

  return (
    <div className={styles.workspace}>
      <div className={styles.container}>
      <PageHero
        id="incoming-calls-title"
        className="mb-6"
        art="/hero/incoming"
        icon={PhoneIncoming}
        eyebrow={t('inbound.title', 'Incoming Calls')}
        title={t('hero.inbound.title', 'Every caller answered, day and night.')}
        subtitle={t('inbound.subtitle', 'Calls to your connected phones: who called, what they needed, and what your AI receptionist did.')}
        status={settings.data ? (
          <HeroPill tone={enabled ? 'ok' : 'off'} onClick={() => { setAgentId(null); setTab('settings'); }}>
            {enabled ? t('inbound.header.aiOn', 'AI answering is on') : t('inbound.header.aiOff', 'AI answering is off')}
          </HeroPill>
        ) : null}
        actions={<>
          <button type="button" className={heroButton.ghost} onClick={() => { setAgentId(null); setTab('analytics'); }}><BarChart3 aria-hidden="true" />{t('inbound.tabs.analytics', 'Analytics')}</button>
          <button type="button" className={heroButton.primary} onClick={() => { setAgentId(null); setTab('live'); }}><Activity aria-hidden="true" />{t('inbound.tabs.live', 'Live Monitor')}{liveCount ? ` (${liveCount})` : ''}</button>
        </>}
        stats={<>
          <HeroStat icon={PhoneIncoming} label={t('hero.inbound.calls', 'Calls · 30 days')} value={num(s?.total)} hint={t('hero.inbound.callsHint', '{count} answered by AI', { count: num(s?.answeredByAi) })} loading={stats.isLoading} />
          <HeroStat icon={Bot} tone="text-cyan-300" label={t('hero.inbound.aiRate', 'AI answer rate')} value={s ? formatRate(s.aiAnswerRate) : '—'} hint={t('hero.inbound.avg', 'Average call {duration}', { duration: s ? formatDuration(s.averageDurationSeconds) : '—' })} loading={stats.isLoading} />
          <button type="button" onClick={() => { setAgentId(null); setHistoryPreset({ workStatus: 'open' }); setTab('history'); }} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50">
            <HeroStat icon={Inbox} tone={openCalls.data?.pagination.total ? 'text-amber-300' : 'text-emerald-300'} label={t('hero.inbound.open', 'Calls to handle')} value={num(openCalls.data?.pagination.total)} hint={t('hero.inbound.openHint', 'Open follow-up work from callers')} loading={openCalls.isLoading} />
          </button>
          <button type="button" onClick={() => { setAgentId(null); setTab('devices'); }} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50">
            <HeroStat icon={Smartphone} tone={devicesOffline ? 'text-amber-300' : 'text-cyan-300'} label={t('hero.inbound.devices', 'Phones online')} value={devices.data ? `${num(devicesOnline)} / ${num(devices.data.length)}` : '—'} hint={devicesOffline ? t('hero.inbound.devicesOffline', '{count} offline', { count: devicesOffline }) : t('hero.inbound.devicesHint', 'Connected phones answering calls')} loading={devices.isLoading} />
          </button>
          <button type="button" onClick={() => { setAgentId(null); setTab('live'); }} className="col-span-2 rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50 lg:col-span-1">
            <HeroStat icon={Radio} tone={liveCount ? 'text-emerald-300' : 'text-sky-200'} label={t('hero.inbound.live', 'On the line now')} value={num(live.data ? liveCount : undefined)} hint={t('hero.inbound.liveHint', 'Live calls, updated in real time')} loading={live.isLoading} />
          </button>
        </>}
      />
      {agentId ? (
        <CallingAgentWorkspace key={agentId} id={agentId} initialTab="settings"
          onBack={() => { setAgentId(null); setTab('agents'); }}
          onLaunch={(agent) => router.push(`/ai-calling?agent=${agent._id}`)} onCampaign={() => router.push(`/ai-calling?agent=${agentId}`)} />
      ) : <Tabs.Root value={tab} onValueChange={(v) => setTab(v as InboundTab)} className="min-w-0">
        <div className="mb-6">
          <Tabs.List aria-label={t('inbound.tabs.label', 'Incoming calls sections')} className={pageTabs.list}>
            {INBOUND_TAB_ITEMS.map(({ value, icon: Icon }) => {
              return <Tabs.Trigger key={value} value={value} className={pageTabs.tab}><Icon aria-hidden="true" className="size-4" />{labels[value]}</Tabs.Trigger>;
            })}
          </Tabs.List>
        </div>
        <Tabs.Content key={tab} value={tab} className={styles.tabContent}>
        {tab === 'overview' && <OverviewTab onOpenCall={drawer.open} onTab={(next, filters) => { setHistoryPreset(filters ?? null); setTab(next as InboundTab); }} />}
        {tab === 'live' && <LiveMonitorTab onOpenCall={drawer.open} />}
        {tab === 'history' && <HistoryTab key={JSON.stringify(historyPreset)} onOpenCall={drawer.open} initialFilters={historyPreset ?? undefined} />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'devices' && <DevicesTab onTab={(next) => setTab(next as InboundTab)} />}
        {tab === 'agents' && <AgentsTab onOpenAgent={setAgentId} />}
        {tab === 'costs' && <CostsTab />}
        </Tabs.Content>
      </Tabs.Root>}
      {drawer.selectedId ? <CallDetailDrawer callId={drawer.selectedId} onClose={drawer.close} /> : null}
      </div>
    </div>
  );
}
