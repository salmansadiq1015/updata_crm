'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Users, Gauge, BatteryCharging, AlertTriangle } from 'lucide-react';

function StatCard({ icon: Icon, label, value, suffix, tone = 'default', hint }) {
  const tones = {
    default: 'text-foreground',
    primary: 'text-primary',
    emerald: 'text-emerald-500',
    red: 'text-red-500',
  };
  const ring = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary ring-1 ring-primary/15',
    emerald: 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/15',
    red: 'bg-red-500/10 text-red-500 ring-1 ring-red-500/15',
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 shadow-sm backdrop-blur-sm transition-colors hover:border-border">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ring[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={cn('flex items-baseline gap-0.5 text-xl font-bold tabular-nums leading-tight', tones[tone])}>
          {value}
          {suffix && <span className="text-sm font-semibold opacity-70">{suffix}</span>}
        </p>
        {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function CoarseSummary({ kpis, viewMode, weekCount }) {
  const { t } = useLanguage();
  const isProject = viewMode === 'PROJECT_CENTRIC';

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={Users}
        tone="primary"
        label={isProject ? t('deploy.coarse.projectsInRange', 'Projekte') : t('deploy.coarse.employeesInRange', 'Mitarbeiter')}
        value={kpis.rowCount}
        hint={`${weekCount} ${t('deploy.coarse.weeks', 'Wochen')}`}
      />
      <StatCard
        icon={Gauge}
        label={t('deploy.coarse.avgUtilization', 'Ø Auslastung')}
        value={kpis.avgUtilization}
        suffix="%"
        hint={t('deploy.coarse.acrossRange', 'über den Zeitraum')}
      />
      <StatCard
        icon={BatteryCharging}
        tone="emerald"
        label={t('deploy.coarse.freeCapacity', 'Freie Kapazität')}
        value={kpis.freeCapacity}
        suffix="%"
        hint={t('deploy.coarse.freeCapacityHint', 'in der meistbelegten Woche')}
      />
      <StatCard
        icon={AlertTriangle}
        tone={kpis.overAllocatedRows > 0 ? 'red' : 'default'}
        label={t('deploy.coarse.overAllocated', 'Überbelegt')}
        value={kpis.overAllocatedRows}
        hint={kpis.overAllocatedRows > 0 ? t('deploy.coarse.needsAttention', 'Aufmerksamkeit nötig') : t('deploy.coarse.allClear', 'Alles im grünen Bereich')}
      />
    </div>
  );
}
