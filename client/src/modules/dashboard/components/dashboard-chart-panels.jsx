'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  FolderKanban,
  Gauge,
  GitBranch,
  Landmark,
  LineChart,
  ListChecks,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  User,
  Users,
  WalletCards,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRecentCustomers, RECENT_CUSTOMERS_EVENT } from '@/modules/crm/utils/recent-customers';
import { CHART_COLORS, FEATURE_MIX_COLORS, WORK_QUEUE_CONFIG } from '@/modules/dashboard/data/dashboard-config';
import {
  formatDashboardCurrency,
  formatDashboardNumber,
  hasSeriesData,
} from '@/modules/dashboard/utils/dashboard-formatters';
import {
  localizeDashboardSeries,
  translateDashboardBreakdown,
  translateDashboardEventType,
  translateDashboardMetric,
} from '@/modules/dashboard/utils/dashboard-i18n';
import { EmptyAnalyticsState, GlassPanel, PanelHeader } from './dashboard-primitives';

const GRID_COLOR = 'rgba(148, 163, 184, 0.16)';
const AXIS_COLOR = 'rgba(203, 213, 225, 0.68)';

function getBreakdownTotal(items, field = 'value') {
  return (items || []).reduce((total, item) => total + (Number(item?.[field]) || 0), 0);
}

function metric(t, key, color) {
  return { key, name: translateDashboardMetric(t, key), color };
}

function PremiumTooltip({ active, payload, label, locale, currency = false, currencyKeys = [] }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs text-foreground shadow-[0_18px_54px_rgba(0,0,0,0.34)] backdrop-blur-xl">
      <p className="mb-2 font-semibold text-foreground">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {currency || currencyKeys.includes(entry.dataKey)
                ? formatDashboardCurrency(entry.value, locale)
                : formatDashboardNumber(entry.value, locale)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResponsiveChart({ children, height = 320 }) {
  const containerRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const updateWidth = (width) => {
      const nextWidth = Math.floor(width || node.getBoundingClientRect().width || 0);
      setChartWidth((currentWidth) => (
        nextWidth > 0 && nextWidth !== currentWidth ? nextWidth : currentWidth
      ));
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      const handleResize = () => updateWidth();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }

    const observer = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect?.width);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="min-h-0 min-w-0 w-full" style={{ height, minHeight: height }}>
      {chartWidth > 0 ? (
        <ResponsiveContainer width={chartWidth} height={height} minWidth={1} minHeight={1}>
          {children}
        </ResponsiveContainer>
      ) : (
        <div className="h-full w-full animate-pulse rounded-lg bg-card" />
      )}
    </div>
  );
}

function TrendAreaPanel({ title, description, icon, data, metrics, locale, t, currency, currencyKeys = [], children }) {
  const reduceMotion = useReducedMotion();
  const chartData = useMemo(() => localizeDashboardSeries(data, locale, t), [data, locale, t]);
  const hasData = hasSeriesData(chartData, metrics.map((metric) => metric.key));
  const Icon = icon || TrendingUp;

  return (
    <GlassPanel className="min-w-0 xl:col-span-8">
      <PanelHeader icon={Icon} title={title} description={description} />
      {hasData ? (
        <div className="p-4">
          <ResponsiveChart>
            <AreaChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <defs>
                {metrics.map((metric) => (
                  <linearGradient key={metric.key} id={`gradient-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={metric.color} stopOpacity={0.44} />
                    <stop offset="95%" stopColor={metric.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="label" stroke={AXIS_COLOR} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis stroke={AXIS_COLOR} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} width={54} />
              <Tooltip content={<PremiumTooltip locale={locale} currency={currency} currencyKeys={currencyKeys} />} />
              {metrics.map((metric) => (
                <Area
                  key={metric.key}
                  type="monotone"
                  dataKey={metric.key}
                  name={metric.name}
                  stroke={metric.color}
                  strokeWidth={2.4}
                  fill={`url(#gradient-${metric.key})`}
                  isAnimationActive={!reduceMotion}
                  animationDuration={650}
                />
              ))}
            </AreaChart>
          </ResponsiveChart>
          {children}
        </div>
      ) : (
        <EmptyAnalyticsState
          title={t('dashboard.analytics.empty.chartTitle', 'No chart data')}
          description={t('dashboard.analytics.empty.chartDescription', 'There is no activity in this filter window.')}
        />
      )}
    </GlassPanel>
  );
}

function BarPanel({
  title,
  description,
  icon,
  data,
  valueKey = 'value',
  locale,
  t,
  labelGroup,
  currency = false,
  color = CHART_COLORS.neutral,
}) {
  const reduceMotion = useReducedMotion();
  const chartData = useMemo(() => translateDashboardBreakdown(data, t, labelGroup), [data, labelGroup, t]);
  const hasData = getBreakdownTotal(chartData, valueKey) > 0;
  const Icon = icon || BarChart3;
  const valueLabel = currency
    ? t('dashboard.analytics.tooltip.value', 'Value')
    : t('dashboard.analytics.tooltip.count', 'Count');

  return (
    <GlassPanel className="min-w-0 xl:col-span-4">
      <PanelHeader icon={Icon} title={title} description={description} />
      {hasData ? (
        <div className="p-4">
          <ResponsiveChart height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 12, left: 28, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
              <XAxis type="number" stroke={AXIS_COLOR} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="label"
                stroke={AXIS_COLOR}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                width={108}
              />
              <Tooltip content={<PremiumTooltip locale={locale} currency={currency} />} />
              <Bar
                dataKey={valueKey}
                name={valueLabel}
                radius={[0, 6, 6, 0]}
                fill={color}
                isAnimationActive={!reduceMotion}
                animationDuration={620}
              />
            </BarChart>
          </ResponsiveChart>
        </div>
      ) : (
        <EmptyAnalyticsState
          title={t('dashboard.analytics.empty.breakdownTitle', 'No breakdown data')}
          description={t('dashboard.analytics.empty.breakdownDescription', 'Nothing matched this filter window.')}
        />
      )}
    </GlassPanel>
  );
}

function DonutPanel({ title, description, icon, data, locale, t, labelGroup, valueKey = 'value' }) {
  const reduceMotion = useReducedMotion();
  const chartData = useMemo(() => translateDashboardBreakdown(data, t, labelGroup), [data, labelGroup, t]);
  const total = getBreakdownTotal(chartData, valueKey);
  const Icon = icon || Gauge;

  return (
    <GlassPanel className="min-w-0 xl:col-span-4">
      <PanelHeader icon={Icon} title={title} description={description} />
      {total > 0 ? (
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_12rem] xl:grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_12rem]">
          <ResponsiveChart height={260}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey={valueKey}
                nameKey="label"
                innerRadius="62%"
                outerRadius="86%"
                paddingAngle={3}
                stroke="rgba(7,17,31,0.9)"
                strokeWidth={2}
                isAnimationActive={!reduceMotion}
                animationDuration={650}
              >
                {chartData.map((entry, index) => (
                  <Cell key={entry.id} fill={FEATURE_MIX_COLORS[index % FEATURE_MIX_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<PremiumTooltip locale={locale} />} />
            </PieChart>
          </ResponsiveChart>
          <div className="space-y-2">
            {chartData.slice(0, 6).map((item, index) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: FEATURE_MIX_COLORS[index % FEATURE_MIX_COLORS.length] }} />
                  {item.label}
                </span>
                <span className="text-sm font-semibold text-foreground tabular-nums">
                  {formatDashboardNumber(item[valueKey], locale)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyAnalyticsState
          title={t('dashboard.analytics.empty.segmentTitle', 'No segment data')}
          description={t('dashboard.analytics.empty.segmentDescription', 'Segments will appear after records are created.')}
        />
      )}
    </GlassPanel>
  );
}

function StatTiles({ items, locale }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon || Activity;
        return (
          <GlassPanel key={item.label}>
            <div className="flex min-h-24 items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground tabular-nums">
                  {item.currency
                    ? formatDashboardCurrency(item.value, locale)
                    : `${formatDashboardNumber(item.value, locale)}${item.suffix || ''}`}
                </p>
              </div>
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', item.className || 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100')}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}

function WorkQueuePanel({ items, t, locale }) {
  return (
    <GlassPanel className="min-w-0 xl:col-span-4">
      <PanelHeader icon={ListChecks} title={t('dashboard.analytics.queue.title', 'Priority queue')} description={t('dashboard.analytics.queue.desc', 'Items that need operational attention.')} />
      <div className="space-y-2 p-4">
        {items?.length ? items.map((item) => {
          const config = WORK_QUEUE_CONFIG[item.id] || { fallback: item.id, labelKey: item.id };
          const tone = item.severity === 'danger'
            ? 'border-rose-300/20 bg-rose-300/10 text-rose-100'
            : item.severity === 'warning'
            ? 'border-amber-300/20 bg-amber-300/10 text-amber-100'
            : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';

          const row = (
            <div className={cn('flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5', config.href && 'transition-colors hover:border-primary/40 hover:bg-accent')}>
              <span className="min-w-0 truncate text-sm text-muted-foreground">{t(config.labelKey, config.fallback)}</span>
              <span className={cn('rounded-md border px-2 py-1 text-xs font-semibold tabular-nums', tone)}>
                {formatDashboardNumber(item.value, locale)}
              </span>
            </div>
          );

          return config.href ? (
            <Link key={item.id} href={config.href} className="block">
              {row}
            </Link>
          ) : (
            <div key={item.id}>{row}</div>
          );
        }) : (
          <EmptyAnalyticsState title={t('dashboard.analytics.empty.queueTitle', 'No queue data')} className="min-h-[12rem]" />
        )}
      </div>
    </GlassPanel>
  );
}

function RecentActivityPanel({ data, t, locale }) {
  return (
    <GlassPanel className="min-w-0 xl:col-span-4">
      <PanelHeader icon={Activity} title={t('dashboard.recentActivity', 'Recent Activity')} description={t('dashboard.analytics.system.auditDesc', 'Latest audit events.')} />
      <div className="space-y-2 p-4">
        {data?.length ? data.map((entry) => (
          <div key={entry.id} className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{translateDashboardEventType(t, entry.eventType)}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{entry.email || entry.module || '-'}</p>
            </div>
            <span className={cn(
              'shrink-0 rounded-md border px-2 py-1 text-xs font-semibold',
              entry.result === 'success'
                ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                : 'border-rose-300/20 bg-rose-300/10 text-rose-100',
            )}
            >
              {entry.timestamp
                ? new Date(entry.timestamp).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
                : '-'}
            </span>
          </div>
        )) : (
          <EmptyAnalyticsState title={t('dashboard.activity.empty', 'No recent activity.')} className="min-h-[12rem]" />
        )}
      </div>
    </GlassPanel>
  );
}

function formatRecentOpenedAt(at, t, locale) {
  if (!at) return '';
  const min = Math.floor((Date.now() - at) / 60000);
  if (min < 1) return t('dashboard.analytics.crm.recent.justNow', 'just now');
  if (min < 60) return t('dashboard.analytics.crm.recent.minutesAgo', '{n} min ago').replace('{n}', String(min));
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return t('dashboard.analytics.crm.recent.hoursAgo', '{n} h ago').replace('{n}', String(hrs));
  return new Date(at).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

function RecentCustomersPanel({ t, locale }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const load = () => setItems(getRecentCustomers());
    load();
    window.addEventListener(RECENT_CUSTOMERS_EVENT, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(RECENT_CUSTOMERS_EVENT, load);
      window.removeEventListener('storage', load);
    };
  }, []);

  return (
    <GlassPanel className="min-w-0 xl:col-span-12">
      <PanelHeader
        icon={Clock}
        title={t('dashboard.analytics.crm.recent.title', 'Recently opened')}
        description={t('dashboard.analytics.crm.recent.desc', 'Quick access to the customers you opened last.')}
      />
      <div className="p-4">
        {items.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((c) => {
              const Icon = c.type === 'business' ? Building2 : User;
              const subtitle = [c.customerNumber, c.city].filter(Boolean).join(' · ');
              return (
                <Link
                  key={c._id}
                  href={`/crm/customers/${c._id}`}
                  className="group flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{c.name || '—'}</span>
                      {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                    {formatRecentOpenedAt(c.at, t, locale)}
                    <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyAnalyticsState
            title={t('dashboard.analytics.crm.recent.emptyTitle', 'No recently opened customers')}
            description={t('dashboard.analytics.crm.recent.emptyDesc', 'Open a customer to see it here for quick access.')}
            className="min-h-[12rem]"
          />
        )}
      </div>
    </GlassPanel>
  );
}

function OverviewTab({ data, t, locale }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-12">
        <TrendAreaPanel
          title={t('dashboard.analytics.overview.operations', 'Operations pulse')}
          description={t('dashboard.analytics.overview.operationsDesc', 'Tasks and scheduling movement.')}
          icon={Activity}
          data={data.overview.operationsTrend}
          t={t}
          metrics={[
            metric(t, 'created', CHART_COLORS.created),
            metric(t, 'completed', CHART_COLORS.completed),
            metric(t, 'assignments', CHART_COLORS.assignments),
          ]}
          locale={locale}
          currencyKeys={['budget']}
        />
        <WorkQueuePanel items={data.overview.workQueue} t={t} locale={locale} />
      </div>
    </div>
  );
}

function CrmTab({ data, t, locale }) {
  return (
    <div className="space-y-4">
      <StatTiles
        locale={locale}
        items={[
          { label: t('dashboard.analytics.crm.total', 'Total customers'), value: data.crm.total, icon: Users },
          { label: t('dashboard.analytics.crm.active', 'Active customers'), value: data.crm.active, icon: CheckCircle2, className: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' },
          { label: t('dashboard.analytics.crm.new', 'New customers'), value: data.crm.newCurrent, icon: TrendingUp, className: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100' },
          { label: t('dashboard.analytics.crm.delta', 'Growth'), value: data.crm.delta, icon: Activity, className: 'border-brand-300/20 bg-brand-300/10 text-brand-100' },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <TrendAreaPanel
          title={t('dashboard.analytics.crm.trend', 'Customer growth')}
          description={t('dashboard.analytics.crm.trendDesc', 'New customer records over time.')}
          icon={Users}
          data={data.crm.trend}
          t={t}
          metrics={[metric(t, 'customers', CHART_COLORS.quoteValue)]}
          locale={locale}
        />
        <DonutPanel title={t('dashboard.analytics.crm.types', 'Customer types')} icon={Gauge} data={data.crm.byType} locale={locale} t={t} labelGroup="crmType" />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <RecentCustomersPanel t={t} locale={locale} />
      </div>
    </div>
  );
}

function ProjectsTab({ data, t, locale }) {
  return (
    <div className="space-y-4">
      <StatTiles
        locale={locale}
        items={[
          { label: t('dashboard.analytics.projects.active', 'Active projects'), value: data.projects.active, icon: FolderKanban },
          { label: t('dashboard.analytics.projects.completed', 'Completed'), value: data.projects.completed, icon: CheckCircle2, className: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' },
          { label: t('dashboard.analytics.projects.budget', 'Active budget'), value: data.projects.budget, icon: WalletCards, currency: true, className: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100' },
          { label: t('dashboard.analytics.projects.risk', 'Overdue'), value: data.projects.overdue, icon: AlertTriangle, className: 'border-amber-300/20 bg-amber-300/10 text-amber-100' },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <TrendAreaPanel
          title={t('dashboard.analytics.projects.trend', 'Project creation')}
          description={t('dashboard.analytics.projects.trendDesc', 'New projects and estimated budget.')}
          icon={FolderKanban}
          data={data.projects.trend}
          t={t}
          metrics={[
            metric(t, 'projects', CHART_COLORS.created),
            metric(t, 'budget', CHART_COLORS.revenue),
          ]}
          locale={locale}
        />
        <BarPanel title={t('dashboard.analytics.projects.status', 'Project status')} icon={GitBranch} data={data.projects.byStatus} locale={locale} t={t} labelGroup="projectStatus" color={CHART_COLORS.quoteValue} />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <BarPanel
          title={t('dashboard.analytics.projects.typeBudget', 'Type budget')}
          description={t('dashboard.analytics.projects.typeBudgetDesc', 'Estimated budget by project type.')}
          icon={WalletCards}
          data={data.projects.byType}
          locale={locale}
          t={t}
          labelGroup="projectType"
          currency
          color={CHART_COLORS.revenue}
        />
      </div>
    </div>
  );
}

function SalesTab({ data, t, locale }) {
  return (
    <div className="space-y-4">
      <StatTiles
        locale={locale}
        items={[
          { label: t('dashboard.analytics.sales.revenue', 'Invoice revenue'), value: data.sales.invoices.revenue, icon: TrendingUp, currency: true },
          { label: t('dashboard.analytics.sales.pipeline', 'Open quote value'), value: data.sales.quotations.openValue, icon: FileText, currency: true, className: 'border-brand-300/20 bg-brand-300/10 text-brand-100' },
          { label: t('dashboard.analytics.sales.conversion', 'Quote conversion'), value: data.sales.quotations.conversionRate, icon: Gauge, suffix: '%', className: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' },
          { label: t('dashboard.analytics.sales.overdue', 'Overdue invoices'), value: data.sales.invoices.overdueCount, icon: AlertTriangle, className: 'border-amber-300/20 bg-amber-300/10 text-amber-100' },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <TrendAreaPanel
          title={t('dashboard.analytics.sales.trend', 'Sales trend')}
          description={t('dashboard.analytics.sales.trendDesc', 'Revenue, quote value, and order value.')}
          icon={TrendingUp}
          data={data.overview.financialTrend}
          t={t}
          metrics={[
            metric(t, 'revenue', CHART_COLORS.revenue),
            metric(t, 'quoteValue', CHART_COLORS.quoteValue),
            metric(t, 'orderValue', CHART_COLORS.orderValue),
          ]}
          locale={locale}
          currencyKeys={['cashMovement']}
        />
        <BarPanel title={t('dashboard.analytics.sales.quotes', 'Quote pipeline')} icon={FileText} data={data.sales.quotations.byStatus} locale={locale} t={t} labelGroup="quoteStatus" currency color={CHART_COLORS.quoteValue} />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <DonutPanel title={t('dashboard.analytics.sales.invoices', 'Invoice status')} icon={ReceiptText} data={data.sales.invoices.byStatus} locale={locale} t={t} labelGroup="invoiceStatus" />
        <BarPanel title={t('dashboard.analytics.sales.orders', 'Order status')} icon={BriefcaseBusiness} data={data.sales.orders.byStatus} locale={locale} t={t} labelGroup="orderStatus" currency color={CHART_COLORS.orderValue} />
      </div>
    </div>
  );
}

function TasksTab({ data, t, locale }) {
  return (
    <div className="space-y-4">
      <StatTiles
        locale={locale}
        items={[
          { label: t('dashboard.analytics.tasks.open', 'Open tasks'), value: data.tasks.open, icon: ClipboardList },
          { label: t('dashboard.analytics.tasks.dueToday', 'Due today'), value: data.tasks.dueToday, icon: CalendarClock, className: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100' },
          { label: t('dashboard.analytics.tasks.overdue', 'Overdue'), value: data.tasks.overdue, icon: AlertTriangle, className: 'border-rose-300/20 bg-rose-300/10 text-rose-100' },
          { label: t('dashboard.analytics.tasks.completed', 'Completed'), value: data.tasks.completedCurrent, icon: CheckCircle2, className: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <TrendAreaPanel
          title={t('dashboard.analytics.tasks.trend', 'Task throughput')}
          description={t('dashboard.analytics.tasks.trendDesc', 'Created versus completed tasks.')}
          icon={ClipboardList}
          data={data.tasks.trend}
          t={t}
          metrics={[
            metric(t, 'created', CHART_COLORS.created),
            metric(t, 'completed', CHART_COLORS.completed),
          ]}
          locale={locale}
        />
        <BarPanel title={t('dashboard.analytics.tasks.priority', 'Priority mix')} icon={AlertTriangle} data={data.tasks.byPriority} valueKey="count" locale={locale} t={t} labelGroup="taskPriority" color={CHART_COLORS.assignments} />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <DonutPanel title={t('dashboard.analytics.tasks.status', 'Task status')} icon={ListChecks} data={data.tasks.byStatus} locale={locale} t={t} labelGroup="taskStatus" />
      </div>
    </div>
  );
}

function SchedulingTab({ data, t, locale }) {
  return (
    <div className="space-y-4">
      <StatTiles
        locale={locale}
        items={[
          { label: t('dashboard.analytics.scheduling.today', 'Today'), value: data.scheduling.today, icon: CalendarClock },
          { label: t('dashboard.analytics.scheduling.upcoming', 'Upcoming'), value: data.scheduling.upcoming, icon: Activity, className: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100' },
          { label: t('dashboard.analytics.scheduling.unconfirmed', 'Unconfirmed'), value: data.scheduling.unconfirmed, icon: AlertTriangle, className: 'border-amber-300/20 bg-amber-300/10 text-amber-100' },
          { label: t('dashboard.analytics.scheduling.hours', 'Planned hours'), value: data.scheduling.hours, icon: Gauge, className: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <TrendAreaPanel
          title={t('dashboard.analytics.scheduling.trend', 'Schedule load')}
          description={t('dashboard.analytics.scheduling.trendDesc', 'Assignments and planned hours.')}
          icon={CalendarClock}
          data={data.scheduling.trend}
          t={t}
          metrics={[
            metric(t, 'assignments', CHART_COLORS.assignments),
            metric(t, 'hours', CHART_COLORS.hours),
          ]}
          locale={locale}
        />
        <DonutPanel title={t('dashboard.analytics.scheduling.status', 'Assignment status')} icon={Gauge} data={data.scheduling.byStatus} locale={locale} t={t} labelGroup="schedulingStatus" />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <BarPanel title={t('dashboard.analytics.scheduling.types', 'Assignment types')} icon={BriefcaseBusiness} data={data.scheduling.byType} valueKey="count" locale={locale} t={t} labelGroup="schedulingType" color={CHART_COLORS.assignments} />
      </div>
    </div>
  );
}

function AccountingTab({ data, t, locale }) {
  return (
    <div className="space-y-4">
      <StatTiles
        locale={locale}
        items={[
          { label: t('dashboard.analytics.accounting.apOpen', 'Open payables'), value: data.accounting.openPayables, icon: WalletCards, currency: true },
          { label: t('dashboard.analytics.accounting.apOverdue', 'Overdue payables'), value: data.accounting.overduePayables, icon: AlertTriangle, currency: true, className: 'border-amber-300/20 bg-amber-300/10 text-amber-100' },
          { label: t('dashboard.analytics.accounting.unmatched', 'Unmatched bank'), value: data.accounting.unmatchedBankTransactions, icon: Landmark, className: 'border-rose-300/20 bg-rose-300/10 text-rose-100' },
          { label: t('dashboard.analytics.accounting.journals', 'Journal amount'), value: data.accounting.journalAmount, icon: ReceiptText, currency: true, className: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100' },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <TrendAreaPanel
          title={t('dashboard.analytics.accounting.cash', 'Cash movement')}
          description={t('dashboard.analytics.accounting.cashDesc', 'Bank transaction movement over time.')}
          icon={Landmark}
          data={data.accounting.cashTrend}
          t={t}
          metrics={[
            metric(t, 'cashMovement', CHART_COLORS.cashMovement),
            metric(t, 'bankTransactions', CHART_COLORS.created),
          ]}
          locale={locale}
          currency
        />
        <BarPanel title={t('dashboard.analytics.accounting.payables', 'Payables status')} icon={WalletCards} data={data.accounting.payablesByStatus} locale={locale} t={t} labelGroup="accountingPayableStatus" currency color={CHART_COLORS.hours} />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <DonutPanel title={t('dashboard.analytics.accounting.bank', 'Bank reconciliation')} icon={ShieldCheck} data={data.accounting.bankByStatus} locale={locale} t={t} labelGroup="bankStatus" />
        <BarPanel title={t('dashboard.analytics.accounting.references', 'Journal references')} icon={ReceiptText} data={data.accounting.journalByReferenceType} locale={locale} t={t} labelGroup="journalReferenceType" currency color={CHART_COLORS.revenue} />
      </div>
    </div>
  );
}

function SystemTab({ data, t, locale }) {
  const system = data.system;
  return (
    <div className="space-y-4">
      <StatTiles
        locale={locale}
        items={[
          { label: t('dashboard.analytics.system.users', 'Active users'), value: system.users.active, icon: Users },
          { label: t('dashboard.analytics.system.successes', 'Audit successes'), value: system.audit.successes, icon: CheckCircle2, className: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' },
          { label: t('dashboard.analytics.system.failures', 'Audit failures'), value: system.audit.failures, icon: AlertTriangle, className: 'border-rose-300/20 bg-rose-300/10 text-rose-100' },
          { label: t('dashboard.analytics.system.failureDelta', 'Failure delta'), value: system.audit.failureDelta, icon: Gauge, suffix: '%', className: 'border-amber-300/20 bg-amber-300/10 text-amber-100' },
        ]}
      />
      <div className="grid gap-4 xl:grid-cols-12">
        <TrendAreaPanel
          title={t('dashboard.analytics.system.auditTrend', 'Audit trend')}
          description={t('dashboard.analytics.system.auditTrendDesc', 'Successful and failed audit events.')}
          icon={Activity}
          data={system.audit.trend}
          t={t}
          metrics={[
            metric(t, 'successes', CHART_COLORS.successes),
            metric(t, 'failures', CHART_COLORS.failures),
          ]}
          locale={locale}
        />
        <RecentActivityPanel data={system.audit.recent} t={t} locale={locale} />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <BarPanel title={t('dashboard.analytics.system.events', 'Top audit events')} icon={LineChart} data={system.audit.byEvent} valueKey="count" locale={locale} t={t} labelGroup="auditEvent" color={CHART_COLORS.created} />
        <DonutPanel title={t('dashboard.analytics.system.userStatus', 'User status')} icon={Users} data={system.users.byStatus} locale={locale} t={t} labelGroup="userStatus" />
      </div>
    </div>
  );
}

export function DashboardChartPanels({ activeTab, data, t, locale, isFetching }) {
  const content = useMemo(() => {
    if (!data) return null;

    switch (activeTab) {
      case 'crm':
        return <CrmTab data={data} t={t} locale={locale} />;
      case 'projects':
        return <ProjectsTab data={data} t={t} locale={locale} />;
      case 'sales':
        return <SalesTab data={data} t={t} locale={locale} />;
      case 'tasks':
        return <TasksTab data={data} t={t} locale={locale} />;
      case 'scheduling':
        return <SchedulingTab data={data} t={t} locale={locale} />;
      case 'accounting':
        return <AccountingTab data={data} t={t} locale={locale} />;
      case 'system':
        return <SystemTab data={data} t={t} locale={locale} />;
      case 'overview':
      default:
        return <OverviewTab data={data} t={t} locale={locale} />;
    }
  }, [activeTab, data, locale, t]);

  return (
    <div className="relative">
      {isFetching && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs font-semibold text-cyan-100">
          {t('dashboard.analytics.refreshing', 'Refreshing')}
        </div>
      )}
      {content}
    </div>
  );
}
