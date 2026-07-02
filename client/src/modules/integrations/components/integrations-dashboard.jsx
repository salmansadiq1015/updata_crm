'use client';

import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import {
  useIntegrationAdminMutations,
  useIntegrationDashboard,
  useIntegrationDetail,
  useIntegrationHealthHistory,
  useIntegrationSyncHistory,
} from '@/modules/integrations/hooks/use-integration-admin';
import {
  calculateIntegrationSummary,
  filterIntegrations,
  getIntegrationOperationalState,
} from '@/modules/integrations/utils/integration-dashboard-utils';
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Database,
  Globe2,
  Landmark,
  Mail,
  MessageCircle,
  PackageSearch,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  ScanText,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  WifiOff,
  XCircle,
} from 'lucide-react';

const STATUS_STYLES = {
  healthy: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  degraded: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  down: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  disabled: 'border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  unknown: 'border-muted-foreground/20 bg-muted text-muted-foreground',
  running: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  completed: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300',
  cancelled: 'border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

const STATE_STYLES = {
  operational: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  attention: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  disabled: 'border-slate-500/25 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  unknown: 'border-muted-foreground/20 bg-muted text-muted-foreground',
};

const STATUS_FILTERS = ['all', 'active', 'healthy', 'issues', 'disabled', 'unknown'];
const EMPTY_DASHBOARD_ITEMS = Object.freeze([]);

function integrationLocale(locale) {
  if (locale === 'en') return 'en-US';
  if (locale === 'fr') return 'fr-CH';
  if (locale === 'it') return 'it-CH';
  return 'de-CH';
}

function formatDate(value, locale, t) {
  if (!value) return t('integrations.admin.value.never');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('integrations.admin.value.never');
  return new Intl.DateTimeFormat(integrationLocale(locale), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function formatDuration(value, t) {
  const duration = Number(value || 0);
  if (!duration) return t('integrations.admin.value.noLatency');
  if (duration < 1000) return t('integrations.admin.value.ms', null, { count: duration });
  return t('integrations.admin.value.seconds', null, { count: (duration / 1000).toFixed(1) });
}

function ProviderGlyph({ provider, className }) {
  const normalized = String(provider || '').toLowerCase();

  if (normalized === 'camt') return <Landmark className={className} />;
  if (normalized === 'google' || normalized === 'microsoft') return <CalendarDays className={className} />;
  if (normalized === 's3') return <Cloud className={className} />;
  if (normalized === 'igh') return <PackageSearch className={className} />;
  if (normalized === 'ocr') return <ScanText className={className} />;
  if (normalized === 'meta') return <MessageCircle className={className} />;
  if (normalized === 'smtp') return <Mail className={className} />;
  if (normalized === 'self') return <Globe2 className={className} />;
  return <Database className={className} />;
}

function StatusBadge({ status, t }) {
  const normalized = status || 'unknown';
  return (
    <Badge variant="outline" className={cn('capitalize', STATUS_STYLES[normalized] || STATUS_STYLES.unknown)}>
      {t(`integrations.admin.status.${normalized}`)}
    </Badge>
  );
}

function EnabledBadge({ enabled, t }) {
  return enabled ? (
    <Badge variant="outline" className="border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      {t('integrations.admin.enabled')}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-300">
      <XCircle className="mr-1 h-3 w-3" />
      {t('integrations.admin.disabled')}
    </Badge>
  );
}

function StateBadge({ item, t }) {
  const state = getIntegrationOperationalState(item);
  return (
    <Badge variant="outline" className={STATE_STYLES[state] || STATE_STYLES.unknown}>
      {t(`integrations.admin.state.${state}`)}
    </Badge>
  );
}

function SummaryCard({ icon: Icon, label, value, meta, tone = 'default', loading }) {
  const toneClass = {
    default: 'border-border/70 bg-card',
    success: 'border-emerald-500/20 bg-emerald-500/5',
    warning: 'border-amber-500/20 bg-amber-500/5',
    danger: 'border-red-500/20 bg-red-500/5',
  }[tone];

  return (
    <Card className={cn('rounded-lg shadow-theme-sm', toneClass)}>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>}
          {loading ? <Skeleton className="mt-3 h-3 w-28" /> : <p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} className="grid gap-3 rounded-lg border border-border/60 p-4 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.8fr_1fr_0.6fr]">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

function IconButtonWithTooltip({ label, children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} title={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function IntegrationActionButtons({ item, busy, t, onHealthCheck, onToggle, onOpenDetails }) {
  return (
    <div className="flex justify-end gap-2">
      <IconButtonWithTooltip
        label={t('integrations.admin.action.healthCheck')}
        size="icon-sm"
        variant="outline"
        disabled={busy}
        onClick={() => onHealthCheck(item.integrationKey)}
      >
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      </IconButtonWithTooltip>
      <IconButtonWithTooltip
        label={item.isEnabled ? t('integrations.admin.action.disable') : t('integrations.admin.action.enable')}
        size="icon-sm"
        variant="outline"
        disabled={busy}
        onClick={() => onToggle(item)}
      >
        {item.isEnabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
      </IconButtonWithTooltip>
      <IconButtonWithTooltip
        label={t('integrations.admin.action.details')}
        size="icon-sm"
        variant="outline"
        onClick={() => onOpenDetails(item.integrationKey)}
      >
        <ChevronRight className="h-4 w-4" />
      </IconButtonWithTooltip>
    </div>
  );
}

function IntegrationDetailDrawer({ open, integrationKey, item, onOpenChange, locale, t, busy, onHealthCheck, onToggle }) {
  const detailQuery = useIntegrationDetail(integrationKey, { enabled: open });
  const healthQuery = useIntegrationHealthHistory(integrationKey, '24h', { enabled: open });
  const syncQuery = useIntegrationSyncHistory(integrationKey, { limit: 5 }, { enabled: open });
  const detail = detailQuery.data || item;
  const healthItems = Array.isArray(healthQuery.data) ? healthQuery.data.slice(0, 6) : [];
  const syncItems = syncQuery.data?.items?.slice(0, 5) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border/70 p-5">
          <div className="flex items-start gap-3 pr-10">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
              <ProviderGlyph provider={detail?.provider} className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="truncate">{detail?.displayName || integrationKey}</SheetTitle>
              <SheetDescription className="mt-1 truncate">
                {detail?.integrationKey || integrationKey} / {detail?.provider || t('integrations.admin.value.noProvider')}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t('integrations.admin.detail.status')}</p>
              <div className="mt-2"><StatusBadge status={detail?.status} t={t} /></div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t('integrations.admin.detail.availability')}</p>
              <p className="mt-2 text-sm font-semibold">{detail?.isEnabled ? t('integrations.admin.enabled') : t('integrations.admin.disabled')}</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t('integrations.admin.detail.circuit')}</p>
              <p className="mt-2 text-sm font-semibold">{detail?.circuitBreakerState || t('integrations.admin.value.unknown')}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onHealthCheck(integrationKey)} disabled={busy || !integrationKey}>
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
              {t('integrations.admin.action.healthCheck')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onToggle(detail)} disabled={busy || !detail}>
              {detail?.isEnabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
              {detail?.isEnabled ? t('integrations.admin.action.disable') : t('integrations.admin.action.enable')}
            </Button>
            {integrationKey === 'website_widget' ? (
              <Button size="sm" variant="outline" asChild>
                <Link href="/admin/integrations/widget/config">
                  <Settings className="h-3.5 w-3.5" />
                  {t('integrations.admin.action.widgetConfig')}
                </Link>
              </Button>
            ) : null}
          </div>

          <section className="rounded-lg border border-border/70 bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{t('integrations.admin.detail.configTitle')}</h3>
                <p className="text-xs text-muted-foreground">{t('integrations.admin.detail.configDescription')}</p>
              </div>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <InfoLine label={t('integrations.admin.detail.syncSchedule')} value={detail?.syncSchedule || t('integrations.admin.value.notConfigured')} />
              <InfoLine label={t('integrations.admin.detail.credentials')} value={detail?.credentialsRef || t('integrations.admin.value.notConfigured')} />
              <InfoLine label={t('integrations.admin.detail.lastCheck')} value={formatDate(detail?.lastHealthCheckAt, locale, t)} />
              <InfoLine label={t('integrations.admin.detail.lastError')} value={detail?.lastErrorMessage || t('integrations.admin.value.noError')} />
            </div>
          </section>

          <section className="rounded-lg border border-border/70 bg-card p-4">
            <h3 className="text-sm font-semibold">{t('integrations.admin.detail.healthHistory')}</h3>
            {healthQuery.isFetching ? (
              <div className="mt-3 space-y-2">
                {[0, 1, 2].map((row) => <Skeleton key={row} className="h-9 w-full" />)}
              </div>
            ) : healthItems.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('integrations.admin.detail.noHealthHistory')}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {healthItems.map((record) => (
                  <div key={record._id || record.id || record.checkedAt} className="flex items-center justify-between gap-3 rounded-lg bg-muted/35 px-3 py-2">
                    <div className="min-w-0">
                      <StatusBadge status={record.status} t={t} />
                      {record.errorMessage ? <p className="mt-1 truncate text-xs text-muted-foreground">{record.errorMessage}</p> : null}
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <p>{formatDuration(record.responseTimeMs, t)}</p>
                      <p>{formatDate(record.checkedAt, locale, t)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border/70 bg-card p-4">
            <h3 className="text-sm font-semibold">{t('integrations.admin.detail.syncHistory')}</h3>
            {syncQuery.isFetching ? (
              <div className="mt-3 space-y-2">
                {[0, 1, 2].map((row) => <Skeleton key={row} className="h-9 w-full" />)}
              </div>
            ) : syncItems.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('integrations.admin.detail.noSyncHistory')}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {syncItems.map((record) => (
                  <div key={record._id || record.id} className="rounded-lg bg-muted/35 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{record.syncType || t('integrations.admin.value.manual')}</p>
                      <StatusBadge status={record.status || 'unknown'} t={t} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('integrations.admin.detail.recordsProcessed', null, { count: Number(record.recordsProcessed || 0) })}
                      {' / '}
                      {formatDate(record.startedAt || record.createdAt, locale, t)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoLine({ label, value }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/35 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

export function IntegrationsDashboard() {
  const { t, locale } = useLanguage();
  const dashboardQuery = useIntegrationDashboard();
  const mutations = useIntegrationAdminMutations(t);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const deferredSearch = useDeferredValue(search);
  const items = dashboardQuery.data ?? EMPTY_DASHBOARD_ITEMS;
  const summary = useMemo(() => calculateIntegrationSummary(items), [items]);
  const filteredItems = useMemo(
    () => filterIntegrations(items, { search: deferredSearch, status: statusFilter }),
    [deferredSearch, items, statusFilter],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.integrationKey === selectedKey) || null,
    [items, selectedKey],
  );
  const loadingInitial = dashboardQuery.isLoading && items.length === 0;

  const runWithBusyState = useCallback((integrationKey, mutation) => {
    if (!integrationKey) return;
    setBusyKey(integrationKey);
    mutation.mutate(integrationKey, {
      onSettled: () => setBusyKey(null),
    });
  }, []);

  const handleHealthCheck = useCallback(
    (integrationKey) => runWithBusyState(integrationKey, mutations.healthCheck),
    [mutations.healthCheck, runWithBusyState],
  );

  const handleToggle = useCallback(
    (item) => {
      if (!item?.integrationKey) return;
      runWithBusyState(item.integrationKey, item.isEnabled ? mutations.disable : mutations.enable);
    },
    [mutations.disable, mutations.enable, runWithBusyState],
  );

  const statusFilters = useMemo(() => STATUS_FILTERS.map((value) => ({
    value,
    label: t(`integrations.admin.filter.${value}`),
  })), [t]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-theme-sm">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-3">
              <Badge variant="outline" className="w-fit border-primary/25 bg-primary/10 text-primary">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                {t('integrations.admin.commandBadge')}
              </Badge>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t('integrations.admin.commandTitle')}</h2>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t('integrations.admin.commandDescription')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StateBadge item={{ isEnabled: summary.enabled > 0, status: summary.issues > 0 ? 'degraded' : summary.healthy > 0 ? 'healthy' : 'unknown' }} t={t} />
                <Badge variant="outline" className="border-border/70 bg-muted/35">
                  <Timer className="mr-1 h-3.5 w-3.5" />
                  {t('integrations.admin.meta.checks24h', null, { count: summary.checksLast24h })}
                </Badge>
                <Badge variant="outline" className="border-border/70 bg-muted/35">
                  {t('integrations.admin.meta.avgLatency', null, { value: formatDuration(summary.avgResponseTimeMs, t) })}
                </Badge>
              </div>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/25 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('integrations.admin.uptimeScore')}</p>
                  <p className="mt-1 text-3xl font-semibold">{summary.uptimePercent}%</p>
                </div>
                <Activity className="h-8 w-8 text-primary" />
              </div>
              <Progress value={summary.uptimePercent} className="h-2" />
              <p className="mt-3 text-xs text-muted-foreground">
                {t('integrations.admin.uptimeDescription', null, { healthy: summary.healthy, total: summary.total })}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={Database}
            label={t('integrations.admin.summary.total')}
            value={summary.total}
            meta={t('integrations.admin.summary.totalMeta', null, { count: summary.enabled })}
            loading={loadingInitial}
          />
          <SummaryCard
            icon={CheckCircle2}
            label={t('integrations.admin.summary.healthy')}
            value={summary.healthy}
            meta={t('integrations.admin.summary.healthyMeta', null, { percent: summary.uptimePercent })}
            tone="success"
            loading={loadingInitial}
          />
          <SummaryCard
            icon={AlertTriangle}
            label={t('integrations.admin.summary.issues')}
            value={summary.issues}
            meta={t('integrations.admin.summary.issuesMeta', null, { count: summary.averageErrorRate })}
            tone={summary.issues > 0 ? 'danger' : 'default'}
            loading={loadingInitial}
          />
          <SummaryCard
            icon={PowerOff}
            label={t('integrations.admin.summary.disabled')}
            value={summary.disabled}
            meta={t('integrations.admin.summary.disabledMeta', null, { count: summary.unknown })}
            tone="warning"
            loading={loadingInitial}
          />
        </div>

        <section className="rounded-lg border border-border/70 bg-card shadow-theme-sm">
          <div className="border-b border-border/70 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h3 className="text-base font-semibold">{t('integrations.admin.providerStatus')}</h3>
                <p className="text-sm text-muted-foreground">{t('integrations.admin.providerStatusDescription')}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                    placeholder={t('integrations.admin.searchPlaceholder')}
                    aria-label={t('integrations.admin.searchLabel')}
                  />
                </div>
                <Button variant="outline" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
                  <RefreshCw className={cn('h-4 w-4', dashboardQuery.isFetching && 'animate-spin')} />
                  {t('integrations.admin.action.refresh')}
                </Button>
              </div>
            </div>
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mt-4 overflow-x-auto">
              <TabsList className="min-w-max">
                {statusFilters.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {dashboardQuery.isError ? (
            <EmptyState
              icon={WifiOff}
              title={t('integrations.admin.errorTitle')}
              description={t('integrations.admin.errorDescription')}
              action={(
                <Button size="sm" onClick={() => dashboardQuery.refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('integrations.admin.action.retry')}
                </Button>
              )}
            />
          ) : loadingInitial ? (
            <DashboardSkeleton />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontal}
              title={t('integrations.admin.emptyTitle')}
              description={t('integrations.admin.emptyDescription')}
              action={(
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                >
                  {t('integrations.admin.action.clearFilters')}
                </Button>
              )}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/35">
                    <TableHead className="min-w-[260px]">{t('integrations.admin.table.integration')}</TableHead>
                    <TableHead>{t('integrations.admin.table.status')}</TableHead>
                    <TableHead>{t('integrations.admin.table.activity')}</TableHead>
                    <TableHead>{t('integrations.admin.table.performance')}</TableHead>
                    <TableHead className="min-w-[230px]">{t('integrations.admin.table.lastSignal')}</TableHead>
                    <TableHead className="min-w-[260px]">{t('integrations.admin.table.issue')}</TableHead>
                    <TableHead className="text-right">{t('integrations.admin.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const busy = busyKey === item.integrationKey && mutations.isBusy;
                    return (
                      <TableRow key={item.integrationKey} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary">
                              <ProviderGlyph provider={item.provider} className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{item.displayName || item.integrationKey}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {item.integrationKey} / {item.provider || t('integrations.admin.value.noProvider')}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            <StatusBadge status={item.status} t={t} />
                            <StateBadge item={item} t={t} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <EnabledBadge enabled={item.isEnabled} t={t} />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <p className="font-medium">{formatDuration(item.avgResponseTimeMs, t)}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('integrations.admin.meta.errorRate', null, { value: Number(item.errorRate || 0) })}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <p className="font-medium">{formatDate(item.lastHealthCheckAt, locale, t)}</p>
                            <p className="text-xs text-muted-foreground">
                              {t('integrations.admin.meta.checks24h', null, { count: Number(item.checksLast24h || 0) })}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {item.lastErrorMessage || t('integrations.admin.value.noError')}
                          </p>
                        </TableCell>
                        <TableCell>
                          <IntegrationActionButtons
                            item={item}
                            busy={busy}
                            t={t}
                            onHealthCheck={handleHealthCheck}
                            onToggle={handleToggle}
                            onOpenDetails={setSelectedKey}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <IntegrationDetailDrawer
          open={Boolean(selectedKey)}
          integrationKey={selectedKey}
          item={selectedItem}
          onOpenChange={(open) => { if (!open) setSelectedKey(null); }}
          locale={locale}
          t={t}
          busy={busyKey === selectedKey && mutations.isBusy}
          onHealthCheck={handleHealthCheck}
          onToggle={handleToggle}
        />
      </div>
    </TooltipProvider>
  );
}
