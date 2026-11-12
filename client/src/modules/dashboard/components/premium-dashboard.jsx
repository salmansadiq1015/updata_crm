'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Bot,
  PhoneCall,
  PhoneIncoming,
  UserPlus,
  CalendarClock,
  Check,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  ScrollText,
  Settings2,
  Shield,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useAuth } from '@/shared/hooks/use-auth';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useDashboardAnalytics, useDashboardIntelligence, getDefaultGranularity } from '@/modules/dashboard/hooks/use-dashboard-analytics';
import {
  DASHBOARD_GRANULARITIES,
  DASHBOARD_RANGES,
  DASHBOARD_TABS,
  KPI_CONFIG,
} from '@/modules/dashboard/data/dashboard-config';
import { IntelligenceHeroStats, FeatureOverview } from './dashboard-workspaces';
import { HeroPill, PageHero, heroButton, pageTabs } from '@/shared/components/page-hero';

const GLASS = 'h-11 rounded-full border-white/15 bg-white/[0.07] px-4 text-white shadow-none backdrop-blur-md hover:bg-white/[0.12] [&_svg]:text-cyan-300 dark:bg-white/[0.07]';
import styles from './dashboard.module.css';
import {
  formatDashboardMetric,
  formatDelta,
  getLocaleCode,
} from '@/modules/dashboard/utils/dashboard-formatters';
import {
  DashboardChartSkeleton,
  GlassPanel,
  WarningStrip,
} from './dashboard-primitives';

const DashboardChartPanels = dynamic(
  () => import('./dashboard-chart-panels').then((mod) => mod.DashboardChartPanels),
  {
    ssr: false,
    loading: () => <DashboardChartSkeleton />,
  },
);

const IntelligenceTab = dynamic(
  () => import('./dashboard-intelligence').then(mod => mod.IntelligenceTab),
  { ssr: false, loading: () => <DashboardChartSkeleton /> },
);
const INTELLIGENCE_TABS = new Set(['assistant', 'calling', 'incoming', 'leads']);

const TAB_ICONS = Object.freeze({
  assistant: Bot, calling: PhoneCall, incoming: PhoneIncoming, leads: UserPlus,
  overview: LayoutDashboard,
  crm: Users,
  projects: FolderKanban,
  sales: FileText,
  tasks: ClipboardList,
  scheduling: CalendarClock,
  accounting: WalletCards,
  system: Gauge,
});

const KPI_ICONS = Object.freeze({
  revenue: TrendingUp,
  customers: Users,
  projects: FolderKanban,
  openTasks: ClipboardList,
  scheduleToday: CalendarClock,
  outstanding: WalletCards,
});

const METRIC_ACCENT = 'border-primary/10 bg-primary/5 text-primary';

const QUICK_ACTIONS = Object.freeze([
  { labelKey: 'dashboard.manageUsers', fallback: 'Manage Users', href: '/settings/users', icon: Users, permission: 'users:read' },
  { labelKey: 'dashboard.manageRoles', fallback: 'Manage Roles', href: '/settings/roles', icon: Shield, permission: 'roles:read' },
  { labelKey: 'dashboard.myProfile', fallback: 'My Profile', href: '/profile', icon: Activity },
  { labelKey: 'dashboard.auditLog', fallback: 'Audit Log', href: '/settings/audit', icon: ScrollText, permission: 'audit:read' },
]);

function MetricCard({ item, locale, t }) {
  const config = KPI_CONFIG[item.id] || KPI_CONFIG.projects;
  const Icon = KPI_ICONS[item.id] || BarChart3;

  const isPositive = Number(item.delta) >= 0;

  const card = (
    <GlassPanel className={cn('dashboard-metric group min-h-32 transition-colors duration-200', config.href && 'cursor-pointer')}>
      <div className="flex h-full flex-col justify-between gap-5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">
              {t(config.labelKey, config.fallback)}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatDashboardMetric(item.value, item.format, locale)}
            </p>
          </div>
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border', METRIC_ACCENT)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span
            className={cn(
              'rounded-md border px-2 py-1 font-semibold tabular-nums',
              isPositive
                ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-700 dark:text-emerald-200'
                : 'border-rose-300/20 bg-rose-300/10 text-rose-700 dark:text-rose-200',
            )}
          >
            {formatDelta(item.delta)}
          </span>
          <span className="truncate text-muted-foreground">
            {t('dashboard.analytics.vsPrevious', 'vs previous period')}
          </span>
        </div>
      </div>
    </GlassPanel>
  );

  if (config.href) {
    return <Link href={config.href} className="block">{card}</Link>;
  }
  return card;
}

function MetricSkeletonGrid({ count = 3 }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', count > 2 && 'xl:grid-cols-3')}>
      {Array.from({ length: count }).map((_, index) => (
        <GlassPanel key={index} className="min-h-36">
          <div className="space-y-5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-3">
                <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
                <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
              </div>
              <div className="h-11 w-11 animate-pulse rounded-lg bg-muted" />
            </div>
            <div className="h-6 w-36 animate-pulse rounded-md bg-muted" />
          </div>
        </GlassPanel>
      ))}
    </div>
  );
}

function DashboardError({ error, onRetry, t }) {
  return (
    <GlassPanel>
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-rose-300/20 bg-rose-300/10 text-rose-700 dark:text-rose-200 shadow-[0_0_34px_rgba(251,113,133,0.12)]">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            {t('dashboard.analytics.errorTitle', 'Analytics could not be loaded')}
          </h2>
          <p className="max-w-lg text-sm text-muted-foreground">
            {error?.message || t('dashboard.analytics.errorDescription', 'The server returned an unexpected response.')}
          </p>
        </div>
        <Button
          type="button"
          onClick={onRetry}
          className="h-11 gap-2 rounded-lg bg-cyan-400 text-slate-950 hover:bg-cyan-300"
        >
          <RefreshCw className="h-4 w-4" />
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    </GlassPanel>
  );
}

/**
 * Config popover — lets each user toggle visible KPIs and tabs.
 * Persists to user.preferences.dashboard via PATCH /users/me/preferences.
 */
function DashboardConfigPopover({ hiddenKpis, hiddenTabs, availableKpis, availableTabs, onSave, t }) {
  const [localKpis, setLocalKpis] = useState(hiddenKpis);
  const [localTabs, setLocalTabs] = useState(hiddenTabs);
  const [saving, setSaving] = useState(false);

  const toggleKpi = (id) => {
    setLocalKpis((prev) => prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]);
  };
  const toggleTab = (id) => {
    setLocalTabs((prev) => prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave({ hiddenKpis: localKpis, hiddenTabs: localTabs });
    setSaving(false);
  };

  return (
    <div className="w-72 space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">
          {t('dashboard.config.kpis', 'Kennzahlen')}
        </p>
        <div className="space-y-1">
          {availableKpis.map((kpi) => {
            const config = KPI_CONFIG[kpi];
            const visible = !localKpis.includes(kpi);
            return (
              <button
                key={kpi}
                type="button"
                onClick={() => toggleKpi(kpi)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors',
                  visible
                    ? 'bg-accent/50 text-foreground'
                    : 'text-muted-foreground hover:bg-accent/30',
                )}
              >
                <span className="flex items-center gap-2">
                  {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {t(config?.labelKey, config?.fallback || kpi)}
                </span>
                {visible && <Check className="h-3.5 w-3.5 text-emerald-500" />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">
          {t('dashboard.config.tabs', 'Bereiche')}
        </p>
        <div className="space-y-1">
          {availableTabs.map((tab) => {
            const tabDef = DASHBOARD_TABS.find((d) => d.id === tab.id);
            if (!tabDef || tabDef.id === 'overview') return null;
            const visible = !localTabs.includes(tabDef.id);
            return (
              <button
                key={tabDef.id}
                type="button"
                onClick={() => toggleTab(tabDef.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors',
                  visible
                    ? 'bg-accent/50 text-foreground'
                    : 'text-muted-foreground hover:bg-accent/30',
                )}
              >
                <span className="flex items-center gap-2">
                  {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {t(tabDef.labelKey, tabDef.fallback)}
                </span>
                {visible && <Check className="h-3.5 w-3.5 text-emerald-500" />}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full"
        size="sm"
      >
        {saving
          ? t('common.saving', 'Speichern...')
          : t('dashboard.config.save', 'Speichern')}
      </Button>
    </div>
  );
}

export function PremiumDashboard() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { t, locale } = useLanguage();
  const localeCode = getLocaleCode(locale);
  const [range, setRange] = useState('30d');
  const [granularity, setGranularity] = useState(getDefaultGranularity('30d'));
  const [activeTab, setActiveTab] = useState('overview');
  const [configOpen, setConfigOpen] = useState(false);

  const hiddenKpis = useMemo(() => user?.preferences?.dashboard?.hiddenKpis || [], [user?.preferences?.dashboard?.hiddenKpis]);
  const hiddenTabs = useMemo(() => user?.preferences?.dashboard?.hiddenTabs || [], [user?.preferences?.dashboard?.hiddenTabs]);

  const filters = useMemo(() => ({ range, granularity }), [granularity, range]);
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboardAnalytics(filters);
  const intelligence = useDashboardIntelligence(filters);

  // KPIs available to this user (permission-based)
  const permittedKpis = useMemo(
    () => Object.keys(KPI_CONFIG).filter((id) => {
      const perm = KPI_CONFIG[id].permission;
      return !perm || hasPermission(perm);
    }),
    [hasPermission],
  );

  // Visible KPIs = permitted - hidden by user
  const visibleKpiIds = useMemo(
    () => permittedKpis.filter((id) => !hiddenKpis.includes(id)),
    [permittedKpis, hiddenKpis],
  );

  // Tabs available to this user (permission-based + not hidden)
  const permittedTabs = useMemo(
    () => DASHBOARD_TABS.filter((tab) => !tab.permission || hasPermission(tab.permission)),
    [hasPermission],
  );
  const visibleTabs = useMemo(
    () => permittedTabs.filter((tab) => tab.id === 'overview' || !hiddenTabs.includes(tab.id)),
    [permittedTabs, hiddenTabs],
  );

  const visibleQuickActions = useMemo(
    () => QUICK_ACTIONS.filter((action) => !action.permission || hasPermission(action.permission)),
    [hasPermission],
  );

  const handleRangeChange = (nextRange) => {
    setRange(nextRange);
    setGranularity(getDefaultGranularity(nextRange));
  };

  const handleSaveConfig = useCallback(async (dashboardConfig) => {
    try {
      const res = await apiClient.patch(ENDPOINTS.AUTH.USER_PREFERENCES, {
        dashboard: dashboardConfig,
      });
      const prefs = res.data?.preferences ?? res.preferences ?? {};
      const currentUser = useAuthStore.getState().user;
      useAuthStore.getState().setUser({ ...currentUser, preferences: prefs });
      setConfigOpen(false);
    } catch {
      // Silently fail — next reload will restore saved state
    }
  }, [setConfigOpen]);

  // Reset active tab if it's no longer visible
  const safeActiveTab = visibleTabs.some((t) => t.id === activeTab) ? activeTab : 'overview';

  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString(localeCode, { hour: '2-digit', minute: '2-digit' })
    : null;

  const refreshAll = () => { void refetch(); void intelligence.refetch(); };
  const selectIntelligence = (id) => { if (!visibleTabs.some(tab => tab.id === id)) setConfigOpen(true); else setActiveTab(id); };
  return (
    <section className={cn(styles.dashboard, 'relative -m-4 min-h-[calc(100dvh-4rem)] text-foreground sm:-m-6')}>
      <div className="mx-auto flex max-w-[1800px] min-w-0 flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <PageHero
          id="dashboard-title"
          art="/hero/dashboard"
          icon={LayoutDashboard}
          eyebrow={t('dashboard.intelligence.workspace')}
          title={<>{t('dashboard.welcome', 'Welcome')}, {user?.firstName || user?.name || 'System'}</>}
          subtitle={t('dashboard.intelligence.subtitle')}
          status={updatedAt ? <HeroPill tone={isError ? 'warn' : 'ok'}>{t('dashboard.analytics.updatedAt')} {updatedAt}</HeroPill> : null}
          actions={<>
            <Select value={range} onValueChange={handleRangeChange}>
              <SelectTrigger aria-label={t('dashboard.analytics.range')} className={cn(GLASS, 'w-32')}><SelectValue /></SelectTrigger>
              <SelectContent>{DASHBOARD_RANGES.map(option => <SelectItem key={option.value} value={option.value}>{t(option.labelKey, option.fallback)}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={granularity} onValueChange={setGranularity}>
              <SelectTrigger aria-label={t('dashboard.analytics.granularity')} className={cn(GLASS, 'w-28')}><SelectValue /></SelectTrigger>
              <SelectContent>{DASHBOARD_GRANULARITIES.map(option => <SelectItem key={option.value} value={option.value}>{t(option.labelKey, option.fallback)}</SelectItem>)}</SelectContent>
            </Select>
            <Popover open={configOpen} onOpenChange={setConfigOpen}>
              <PopoverTrigger asChild><button type="button" className={cn(heroButton.ghost, 'w-11 justify-center px-0')} aria-label={t('dashboard.config.title')}><Settings2 aria-hidden="true" /></button></PopoverTrigger>
              <PopoverContent align="end" className="max-h-[75dvh] w-auto overflow-y-auto p-4"><DashboardConfigPopover hiddenKpis={hiddenKpis} hiddenTabs={hiddenTabs} availableKpis={permittedKpis} availableTabs={permittedTabs} onSave={handleSaveConfig} t={t} /></PopoverContent>
            </Popover>
            <button type="button" className={cn(heroButton.ghost, 'w-11 justify-center px-0')} aria-label={t('dashboard.analytics.refresh')} onClick={refreshAll} disabled={isFetching || intelligence.isFetching}><RefreshCw aria-hidden="true" className={cn((isFetching || intelligence.isFetching) && 'animate-spin')} /></button>
          </>}
          stats={<IntelligenceHeroStats query={intelligence} t={t} locale={localeCode} onSelect={selectIntelligence} />}
        />

        <Tabs value={safeActiveTab} onValueChange={setActiveTab} className="min-w-0 gap-6">
          <TabsPrimitive.List aria-label={t('dashboard.config.tabs')} className={pageTabs.list}>
            {visibleTabs.map(tab => { const Icon = TAB_ICONS[tab.id] || BarChart3; return <TabsPrimitive.Trigger key={tab.id} value={tab.id} className={pageTabs.tab}><Icon aria-hidden="true" />{t(tab.labelKey, tab.fallback)}</TabsPrimitive.Trigger>; })}
          </TabsPrimitive.List>
          <TabsContent value={safeActiveTab} className="m-0 min-w-0 space-y-5">
            {INTELLIGENCE_TABS.has(safeActiveTab) ? <IntelligenceTab name={safeActiveTab} query={intelligence} t={t} locale={localeCode} /> : <>
              <WarningStrip warnings={data?.warnings} t={t} />
              {safeActiveTab === 'overview' && <>
                {isLoading ? <MetricSkeletonGrid count={visibleKpiIds.length || 3} /> : !isError && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data?.overview?.kpis?.filter(item => visibleKpiIds.includes(item.id)).map(item => <MetricCard key={item.id} item={item} locale={localeCode} t={t} />)}</div>}
              </>}
              {isError ? <DashboardError error={error} onRetry={refreshAll} t={t} /> : isLoading ? <DashboardChartSkeleton /> : <DashboardChartPanels activeTab={safeActiveTab} data={data} t={t} locale={localeCode} isFetching={isFetching} />}
              {safeActiveTab === 'overview' && <FeatureOverview data={data} intelligence={intelligence.data} t={t} locale={localeCode} />}
            </>}
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap gap-x-5 gap-y-3 border-t border-border pt-5">
          {visibleQuickActions.map(action => { const Icon = action.icon; return <Link href={action.href} key={action.href} className="inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-primary"><Icon className="size-3.5" />{t(action.labelKey, action.fallback)}</Link>; })}
        </div>
      </div>
    </section>
  );
}
