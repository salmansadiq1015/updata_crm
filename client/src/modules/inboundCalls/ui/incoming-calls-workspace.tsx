'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Activity, ArrowUpRight, AudioLines, BarChart3, Bot, Coins, History, LayoutGrid, PhoneIncoming, Settings2, ShieldCheck, Smartphone, Workflow, type LucideIcon } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useDrawer } from '@/shared/hooks/use-drawer';
import { useInboundLive, useInboundRealtime, useInboundSettings } from '../hooks/use-inbound-calls';
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
  const { t } = useInboundLanguage();
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

  return (
    <div className={styles.workspace}>
      <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.brandIcon}><PhoneIncoming aria-hidden="true" /><span><AudioLines /></span></span>
          <div className="min-w-0">
            <p className={styles.eyebrow}>{t('inbound.ai.prefix', 'AI')} <span aria-hidden="true">/</span> {labels[tab]}</p>
            <h1 className={styles.title}>{t('inbound.title', 'Incoming Calls')}</h1>
            <p className={styles.subtitle}>{t('inbound.subtitle', 'Calls to your connected phones: who called, what they needed, and what your AI receptionist did.')}</p>
          </div>
        </div>
        {settings.data ? (
          <button type="button" onClick={() => { setAgentId(null); setTab('settings'); }} className={styles.statusButton} data-enabled={Boolean(enabled)}>
            <ShieldCheck aria-hidden="true" className="size-4" /><span className={styles.statusDot} />
            {enabled ? t('inbound.header.aiOn', 'AI answering is on') : t('inbound.header.aiOff', 'AI answering is off')}
            <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-60 rtl:-scale-x-100" />
          </button>
        ) : null}
      </header>
      {agentId ? (
        <CallingAgentWorkspace key={agentId} id={agentId} initialTab="settings"
          onBack={() => { setAgentId(null); setTab('agents'); }}
          onLaunch={(agent) => router.push(`/ai-calling?agent=${agent._id}`)} onCampaign={() => router.push(`/ai-calling?agent=${agentId}`)} />
      ) : <Tabs.Root value={tab} onValueChange={(v) => setTab(v as InboundTab)} className="min-w-0">
        <div className={styles.navRail}>
          <Tabs.List aria-label={t('inbound.tabs.label', 'Incoming calls sections')} className={styles.tabs}>
            {INBOUND_TAB_ITEMS.map(({ value, icon: Icon }) => {
              return <Tabs.Trigger key={value} value={value} className={styles.tab}><Icon aria-hidden="true" className="size-4" />{labels[value]}</Tabs.Trigger>;
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
