'use client';

import { AlertTriangle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function GlassPanel({ children, className }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-border bg-card shadow-theme-lg backdrop-blur-xl',
        'before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,0.11),transparent_34%,rgba(34,211,238,0.06))]',
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function PanelHeader({ icon: Icon = BarChart3, title, description, action }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.12)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyAnalyticsState({ title, description, className }) {
  return (
    <div className={cn('flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center', className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
        <BarChart3 className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

export function DashboardChartSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <GlassPanel className="xl:col-span-8">
        <div className="space-y-4 p-4">
          <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-72 animate-pulse rounded-lg bg-card" />
        </div>
      </GlassPanel>
      <GlassPanel className="xl:col-span-4">
        <div className="space-y-4 p-4">
          <div className="h-5 w-36 animate-pulse rounded-md bg-muted" />
          <div className="h-72 animate-pulse rounded-lg bg-card" />
        </div>
      </GlassPanel>
    </div>
  );
}

export function WarningStrip({ warnings, t }) {
  if (!warnings?.length) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.08)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">
          {t('dashboard.analytics.partialData', 'Some analytics sources returned partial data.')}
        </p>
        <p className="mt-1 truncate text-amber-100/75">
          {warnings.map((warning) => warning.source).join(', ')}
        </p>
      </div>
    </div>
  );
}
