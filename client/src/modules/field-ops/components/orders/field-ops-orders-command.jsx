'use client';

import { Button } from '@/components/ui/button';
import { PremiumStatCard } from '@/shared/components/premium-stat-card';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { ORDER_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Clock3,
  FileWarning,
  ListFilter,
  Plus,
  Radar,
  Route,
  ShieldCheck,
  TimerReset,
  UploadCloud,
  Zap,
} from 'lucide-react';

const STATUS_PIPELINE = [
  {
    status: 'PLANNED',
    icon: CalendarClock,
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(148_163_184_/_0.24),transparent_62%)]',
    bar: 'from-slate-400 via-slate-300 to-transparent',
  },
  {
    status: 'CONFIRMED',
    icon: ShieldCheck,
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(34_211_238_/_0.24),transparent_62%)]',
    bar: 'from-cyan-400 via-sky-400 to-transparent',
  },
  {
    status: 'IN_PROGRESS',
    icon: TimerReset,
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(245_158_11_/_0.25),transparent_62%)]',
    bar: 'from-amber-400 via-orange-400 to-transparent',
  },
  {
    status: 'PAUSED',
    icon: Clock3,
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(249_115_22_/_0.24),transparent_62%)]',
    bar: 'from-orange-400 via-amber-400 to-transparent',
  },
  {
    status: 'COMPLETED',
    icon: CheckCircle2,
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(16_185_129_/_0.24),transparent_62%)]',
    bar: 'from-emerald-400 via-teal-400 to-transparent',
  },
];

const QUICK_PRESETS = [
  { key: 'ALL', icon: ClipboardList, labelKey: 'fieldOps.orders.presets.all', fallback: 'All' },
  { key: 'PLANNED', icon: CalendarClock, labelKey: 'fieldOps.orders.presets.planned', fallback: 'Planned' },
  { key: 'CONFIRMED', icon: ShieldCheck, labelKey: 'fieldOps.orders.presets.confirmed', fallback: 'Confirmed' },
  { key: 'IN_PROGRESS', icon: TimerReset, labelKey: 'fieldOps.orders.presets.inProgress', fallback: 'In Progress' },
  { key: 'URGENT', icon: Zap, labelKey: 'fieldOps.orders.presets.urgent', fallback: 'Urgent' },
  { key: 'NEXT_7_DAYS', icon: Route, labelKey: 'fieldOps.orders.presets.next7Days', fallback: 'Next 7 Days' },
];

function formatSyncLabel(syncTimestamp, de) {
  if (!syncTimestamp) return de ? 'Live bereit' : 'Live ready';
  const date = new Date(syncTimestamp);
  if (Number.isNaN(date.getTime())) return de ? 'Live bereit' : 'Live ready';
  return `${de ? 'Sync' : 'Synced'} ${date.toLocaleTimeString(de ? 'de-CH' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function StatusPipelineCard({ status, count, total, de, isLoading, icon: Icon, glow, bar }) {
  const config = ORDER_STATUS_CONFIG[status];
  const ratio = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/95 p-4 shadow-theme-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-theme-md dark:bg-card/80">
      <div className={cn('absolute inset-x-0 top-0 h-px bg-linear-to-r', bar)} />
      <div className={cn('pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-300 group-hover:opacity-100', glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase text-muted-foreground">
            {de ? config.label : config.labelEn}
          </p>
          {isLoading ? (
            <div className="mt-3 h-8 w-16 rounded-md skeleton-shimmer" />
          ) : (
            <p className="mt-2 text-3xl font-bold tabular-nums leading-none">{count}</p>
          )}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-background/70 shadow-theme-sm">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full bg-linear-to-r transition-all duration-500', bar)} style={{ width: `${ratio}%` }} />
      </div>
      <p className="relative mt-2 text-[11px] font-medium text-muted-foreground">{ratio}%</p>
    </div>
  );
}

export function FieldOpsOrdersCommand({
  title,
  description,
  count,
  de,
  summary,
  summaryTotal,
  metrics,
  isLoading,
  syncTimestamp,
  activePreset,
  onPreset,
  onImport,
  onExport,
  onDownloadTemplate,
  onCreate,
  isExporting,
  isTemplateDownloading,
}) {
  const { t } = useLanguage();
  const completed = Number(summary?.COMPLETED || 0);
  const completionRate = summaryTotal > 0 ? Math.round((completed / summaryTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-theme-sm">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(34_211_238_/_0.14),transparent_46%),radial-gradient(ellipse_at_top_right,rgb(139_92_246_/_0.16),transparent_52%),linear-gradient(135deg,rgb(255_255_255_/_0.08),transparent_48%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-cyan-400/70 via-brand-400/70 to-emerald-400/60" />

        <div className="relative grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Radar className="h-3.5 w-3.5" />
              {t('fieldOps.orders.commandLabel', 'Assignment Command')}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-3">
                  <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {title}
                  </h1>
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-2.5 text-sm font-bold text-primary tabular-nums">
                    {count}
                  </span>
                </div>
                {description ? (
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDownloadTemplate}
                  disabled={isTemplateDownloading}
                  className="h-10 gap-2 rounded-lg border-border/70 bg-background/75 px-3"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {t('fieldOps.orders.actions.referenceCsv', 'Reference CSV')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onImport}
                  className="h-10 gap-2 rounded-lg border-border/70 bg-background/75 px-3"
                >
                  <UploadCloud className="h-4 w-4" />
                  {t('fieldOps.orders.actions.import', 'Import')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onExport}
                  disabled={isExporting}
                  className="h-10 gap-2 rounded-lg border-border/70 bg-background/75 px-3"
                >
                  <Download className="h-4 w-4" />
                  {t('fieldOps.orders.actions.export', 'Export')}
                </Button>
                <Button size="sm" onClick={onCreate} className="h-10 gap-2 rounded-lg bg-primary-gradient px-4 shadow-theme-md">
                  <Plus className="h-4 w-4" />
                  {de ? 'Neuer Einsatz' : 'New Assignment'}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {QUICK_PRESETS.map((preset) => {
                const Icon = preset.icon;
                const active = activePreset === preset.key;
                return (
                  <Button
                    key={preset.key}
                    type="button"
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPreset(preset.key)}
                    className={cn(
                      'h-9 gap-2 rounded-full px-3 text-xs transition-all',
                      !active && 'border-border/70 bg-background/70 hover:border-primary/30 hover:bg-primary/5',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(preset.labelKey, preset.fallback)}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background/70 p-4 shadow-theme-sm">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(16_185_129_/_0.18),transparent_58%)]" />
            <div className="relative flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {de ? 'Abschlussrate' : 'Completion Rate'}
                </p>
                <p className="mt-2 text-4xl font-bold tabular-nums leading-none">{completionRate}%</p>
                <p className="mt-2 text-xs text-muted-foreground">{formatSyncLabel(syncTimestamp, de)}</p>
              </div>
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/10">
                <Activity className="h-8 w-8 text-emerald-500" />
              </div>
            </div>
            <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-linear-to-r from-emerald-400 via-cyan-400 to-brand-400 transition-all duration-500"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <PremiumStatCard
          label={de ? 'Aktive sichtbar' : 'Visible Active'}
          value={metrics.active}
          icon={Activity}
          accent="blue"
        />
        <PremiumStatCard
          label={de ? 'Heute fällig' : 'Due Today'}
          value={metrics.dueToday}
          icon={CalendarClock}
          accent="emerald"
        />
        <PremiumStatCard
          label={de ? 'Hohe Priorität' : 'High Attention'}
          value={metrics.highAttention}
          icon={AlertTriangle}
          accent={metrics.highAttention > 0 ? 'amber' : 'violet'}
        />
        <PremiumStatCard
          label={de ? 'Berichte offen' : 'Reports Pending'}
          value={metrics.reportsPending}
          icon={FileWarning}
          accent={metrics.reportsPending > 0 ? 'rose' : 'emerald'}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {STATUS_PIPELINE.map((item) => (
          <StatusPipelineCard
            key={item.status}
            {...item}
            count={Number(summary?.[item.status] || 0)}
            total={summaryTotal}
            de={de}
            isLoading={isLoading}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5">
          <ListFilter className="h-3.5 w-3.5" />
          {de ? 'Sichtbar' : 'Visible'} {metrics.visible}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5">
          <Zap className="h-3.5 w-3.5" />
          {de ? 'Dringend' : 'Urgent'} {metrics.urgent}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {de ? 'Überfällig' : 'Overdue'} {metrics.overdue}
        </span>
      </div>
    </div>
  );
}
