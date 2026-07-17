'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarClock,
  ClipboardList,
  DatabaseZap,
  FileText,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  RefreshCw,
  ScrollText,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/shared/hooks/use-auth';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useDashboardAnalytics, getDefaultGranularity } from '@/modules/dashboard/hooks/use-dashboard-analytics';
import {
  DASHBOARD_GRANULARITIES,
  DASHBOARD_RANGES,
  DASHBOARD_TABS,
  KPI_CONFIG,
} from '@/modules/dashboard/data/dashboard-config';
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

const TAB_ICONS = Object.freeze({
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

const ACCENT_CLASSES = Object.freeze({
  cyan: {
    icon: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-700 dark:text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.14)]',
    line: 'from-cyan-300/70 via-cyan-300/20 to-transparent',
  },
  violet: {
    icon: 'border-violet-300/20 bg-violet-300/10 text-violet-700 dark:text-violet-200 shadow-[0_0_30px_rgba(167,139,250,0.14)]',
    line: 'from-violet-300/70 via-violet-300/20 to-transparent',
  },
  blue: {
    icon: 'border-blue-300/20 bg-blue-300/10 text-blue-700 dark:text-blue-200 shadow-[0_0_30px_rgba(96,165,250,0.14)]',
    line: 'from-blue-300/70 via-blue-300/20 to-transparent',
  },
  emerald: {
    icon: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-700 dark:text-emerald-200 shadow-[0_0_30px_rgba(52,211,153,0.14)]',
    line: 'from-emerald-300/70 via-emerald-300/20 to-transparent',
  },
  amber: {
    icon: 'border-amber-300/20 bg-amber-300/10 text-amber-700 dark:text-amber-200 shadow-[0_0_30px_rgba(251,191,36,0.14)]',
    line: 'from-amber-300/70 via-amber-300/20 to-transparent',
  },
  rose: {
    icon: 'border-rose-300/20 bg-rose-300/10 text-rose-700 dark:text-rose-200 shadow-[0_0_30px_rgba(251,113,133,0.14)]',
    line: 'from-rose-300/70 via-rose-300/20 to-transparent',
  },
});

const QUICK_ACTIONS = Object.freeze([
  { labelKey: 'dashboard.manageUsers', fallback: 'Manage Users', href: '/settings/users', icon: Users, permission: 'users:read' },
  { labelKey: 'dashboard.manageRoles', fallback: 'Manage Roles', href: '/settings/roles', icon: Shield, permission: 'roles:read' },
  { labelKey: 'dashboard.myProfile', fallback: 'My Profile', href: '/profile', icon: Activity },
  { labelKey: 'dashboard.auditLog', fallback: 'Audit Log', href: '/settings/audit', icon: ScrollText, permission: 'audit:read' },
]);

function MetricCard({ item, locale, t }) {
  const config = KPI_CONFIG[item.id] || KPI_CONFIG.customers;
  const Icon = KPI_ICONS[item.id] || BarChart3;
  const accent = ACCENT_CLASSES[config.accent] || ACCENT_CLASSES.cyan;
  const isPositive = Number(item.delta) >= 0;

  return (
    <GlassPanel className="group min-h-36 transition-transform duration-200 hover:-translate-y-0.5">
      <div className={cn('absolute inset-x-0 top-0 h-px bg-gradient-to-r', accent.line)} />
      <div className="flex h-full flex-col justify-between gap-5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">
              {t(config.labelKey, config.fallback)}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-normal text-foreground tabular-nums">
              {formatDashboardMetric(item.value, item.format, locale)}
            </p>
          </div>
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border', accent.icon)}>
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
}

function MetricSkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
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

export function PremiumDashboard() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { t, locale } = useLanguage();
  const localeCode = getLocaleCode(locale);
  const [range, setRange] = useState('30d');
  const [granularity, setGranularity] = useState(getDefaultGranularity('30d'));
  const [activeTab, setActiveTab] = useState('overview');

  const filters = useMemo(() => ({ range, granularity }), [granularity, range]);
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboardAnalytics(filters);

  const visibleQuickActions = useMemo(
    () => QUICK_ACTIONS.filter((action) => !action.permission || hasPermission(action.permission)),
    [hasPermission],
  );

  const handleRangeChange = (nextRange) => {
    setRange(nextRange);
    setGranularity(getDefaultGranularity(nextRange));
  };

  const updatedAt = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString(localeCode, { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <section className="relative -m-4 min-h-[calc(100dvh-4rem)] overflow-hidden bg-background text-foreground sm:-m-6">

      <div className="relative z-10 mx-auto flex max-w-[1800px] flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-semibold uppercase text-cyan-700 dark:text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.1)]">
              <Sparkles className="h-3.5 w-3.5" />
              {t('dashboard.analytics.badge', 'Executive analytics')}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
                {t('dashboard.welcome', 'Welcome')}, {user?.firstName || user?.name || 'System'}
              </h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {t('dashboard.analytics.subtitle', 'Live business performance across customers, projects, sales, tasks, scheduling, accounting, and system activity.')}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Select value={range} onValueChange={handleRangeChange}>
                <SelectTrigger
                  aria-label={t('dashboard.analytics.range', 'Analytics range')}
                  className="h-11 min-w-36 border-border bg-card text-foreground shadow-none hover:bg-accent"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DASHBOARD_RANGES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey, option.fallback)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={granularity} onValueChange={setGranularity}>
                <SelectTrigger
                  aria-label={t('dashboard.analytics.granularity', 'Analytics granularity')}
                  className="h-11 min-w-36 border-border bg-card text-foreground shadow-none hover:bg-accent"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DASHBOARD_GRANULARITIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey, option.fallback)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              aria-label={t('dashboard.analytics.refresh', 'Refresh analytics')}
              onClick={() => refetch()}
              className="h-11 border-border bg-card px-4 text-foreground hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              <span className="sm:hidden">{t('dashboard.analytics.refresh', 'Refresh')}</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
            <DatabaseZap className="h-3.5 w-3.5 text-cyan-200" />
            {t('dashboard.analytics.optimizedApi', 'Single cached analytics API')}
          </span>
          {updatedAt && (
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
              {t('dashboard.analytics.updatedAt', 'Updated')} {updatedAt}
            </span>
          )}
        </div>

        <WarningStrip warnings={data?.warnings} t={t} />

        {isError ? (
          <DashboardError error={error} onRetry={() => refetch()} t={t} />
        ) : (
          <>
            {isLoading ? (
              <MetricSkeletonGrid />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {data?.overview?.kpis?.map((item) => (
                  <MetricCard key={item.id} item={item} locale={localeCode} t={t} />
                ))}
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
              <div className="overflow-x-auto pb-1">
                <TabsList className="min-h-12 min-w-max gap-1 rounded-lg border border-border bg-card p-1 text-muted-foreground shadow-sm">
                  {DASHBOARD_TABS.map((tab) => {
                    const Icon = TAB_ICONS[tab.id] || BarChart3;
                    return (
                      <TabsTrigger
                        key={tab.id}
                        value={tab.id}
                        className="h-10 rounded-md px-3 text-sm text-muted-foreground data-active:border-violet-300/70 data-active:bg-[linear-gradient(135deg,rgba(124,58,237,0.48),rgba(88,28,135,0.34))] data-active:text-white data-active:ring-1 data-active:ring-violet-300/60 data-active:shadow-[0_0_0_1px_rgba(167,139,250,0.35),0_0_28px_rgba(139,92,246,0.34),inset_0_1px_0_rgba(255,255,255,0.16)]"
                      >
                        <Icon className="h-4 w-4" />
                        {t(tab.labelKey, tab.fallback)}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <TabsContent value={activeTab} className="mt-0">
                {isLoading ? (
                  <DashboardChartSkeleton />
                ) : (
                  <DashboardChartPanels
                    activeTab={activeTab}
                    data={data}
                    t={t}
                    locale={localeCode}
                    isFetching={isFetching}
                  />
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleQuickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.href} href={action.href} className="group block">
                <GlassPanel className="transition-transform duration-200 group-hover:-translate-y-0.5">
                  <div className="flex min-h-16 items-center gap-3 p-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-violet-300/20 bg-violet-300/10 text-violet-700 dark:text-violet-200 shadow-[0_0_26px_rgba(167,139,250,0.1)]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {t(action.labelKey, action.fallback)}
                    </span>
                  </div>
                </GlassPanel>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
