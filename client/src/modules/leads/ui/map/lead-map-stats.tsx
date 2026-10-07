'use client';

import { CheckSquare, MapPin, MapPinOff, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '../lead-ui-kit';

type StatItem = {
  key: string;
  icon: LucideIcon;
  label: string;
  value: number;
  tone: 'default' | 'primary' | 'muted' | 'accent';
};

const TONE: Record<StatItem['tone'], string> = {
  default: 'text-foreground',
  primary: 'text-primary',
  muted: 'text-muted-foreground',
  accent: 'text-emerald-600 dark:text-emerald-400',
};

/**
 * Floating map summary: total / mapped / missing-location / selected. Values are
 * driven by the live filtered set, so they update as filters or selection change.
 */
export function LeadMapStats({
  total,
  mapped,
  missing,
  selected,
  limited,
  className,
}: {
  total: number;
  mapped: number;
  missing: number;
  selected: number;
  limited?: boolean;
  className?: string;
}) {
  const { t } = useLanguage();
  const items: StatItem[] = [
    { key: 'total', icon: Users, label: t('leads.map.stats.total', 'Total'), value: total, tone: 'default' },
    { key: 'mapped', icon: MapPin, label: t('leads.map.stats.mapped', 'Mapped'), value: mapped, tone: 'primary' },
    { key: 'missing', icon: MapPinOff, label: t('leads.map.stats.missing', 'No location'), value: missing, tone: 'muted' },
    { key: 'selected', icon: CheckSquare, label: t('leads.map.stats.selected', 'Selected'), value: selected, tone: 'accent' },
  ];

  return (
    <div
      role="group"
      aria-label={t('leads.map.stats.label', 'Leads on map')}
      className={cn(
        'pointer-events-auto flex items-stretch divide-x divide-border overflow-hidden rounded-xl border border-border bg-card/95 shadow-theme-md backdrop-blur rtl:divide-x-reverse',
        className,
      )}
    >
      {items.map(({ key, icon: Icon, label, value, tone }) => (
        <div key={key} className="flex min-w-[64px] flex-col items-center gap-0.5 px-3.5 py-2">
          <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {label}
          </span>
          <span className={cn('text-base font-semibold tabular-nums leading-none', TONE[tone])}>
            {value.toLocaleString()}
            {key === 'total' && limited ? <span className="align-top text-[10px] text-muted-foreground">+</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}
