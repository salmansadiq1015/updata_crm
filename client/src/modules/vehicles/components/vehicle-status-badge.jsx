'use client';

import { TriangleAlert, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { STATUS_TONES, ASSET_TYPE_ICONS, useFleetFormat } from '../lib/fleet-meta';

export function VehicleStatusBadge({ status, className }) {
  const { t } = useLanguage();
  const tone = STATUS_TONES[status] || STATUS_TONES.available;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', tone.badge, className)}>
      <span className={cn('size-1.5 rounded-full', tone.dot)} aria-hidden="true" />
      {t(`fleet.status.${status}`, status)}
    </span>
  );
}

/** A license plate rendered like one: the identifier people actually recognise. */
export function PlateBadge({ plate, size = 'md', className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-slate-300/80 bg-gradient-to-b from-white to-slate-100 font-mono font-semibold uppercase tracking-[0.08em] text-slate-900 shadow-[inset_0_-1px_0_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.08)] dark:border-white/20',
        size === 'lg' ? 'px-3 py-1 text-base' : size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[13px]',
        className,
      )}
    >
      {plate || '—'}
    </span>
  );
}

/** Photo when there is one, otherwise the asset-type glyph on a brand tile. */
export function VehicleAvatar({ vehicle, className, iconClassName, rounded = 'rounded-xl' }) {
  const Icon = ASSET_TYPE_ICONS[vehicle?.assetType] || ASSET_TYPE_ICONS.other;
  if (vehicle?.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- presigned storage URL, already WebP-compressed server-side
      <img src={vehicle.imageUrl} alt="" loading="lazy" decoding="async" className={cn('object-cover', rounded, className)} />
    );
  }
  return (
    <span className={cn('grid place-items-center bg-gradient-to-br from-sky-500/15 via-cyan-400/10 to-transparent ring-1 ring-inset ring-sky-500/20', rounded, className)}>
      <Icon className={cn('text-sky-600 dark:text-sky-300', iconClassName)} aria-hidden="true" />
    </span>
  );
}

const ALERT_KEYS = {
  service: 'fleet.alert.service',
  inspectionDue: 'fleet.alert.inspectionDue',
  insuranceExpiry: 'fleet.alert.insuranceExpiry',
  registrationExpiry: 'fleet.alert.registrationExpiry',
  emissionTestDue: 'fleet.alert.emissionTestDue',
  contractEnd: 'fleet.alert.contractEnd',
};

export function useAlertText() {
  const { t } = useLanguage();
  const f = useFleetFormat();
  return (a) => {
    const what = t(ALERT_KEYS[a.kind] || 'fleet.alert.service', a.kind);
    if (a.field === 'nextServiceKm') {
      return a.remaining < 0
        ? t('fleet.alert.meterOver', '{what} · {value} over', { what, value: f.meter(-a.remaining, a.unit) })
        : t('fleet.alert.meterIn', '{what} · in {value}', { what, value: f.meter(a.remaining, a.unit) });
    }
    return `${what} · ${f.relativeDays(a.daysLeft)}`;
  };
}

/** Compact alert chips; `max` caps how many are shown before "+n". */
export function VehicleAlertChips({ alerts = [], max = 2, className }) {
  const text = useAlertText();
  if (!alerts.length) return null;
  const shown = alerts.slice(0, max);
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map((a) => (
        <span
          key={`${a.field}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            a.level === 'overdue'
              ? 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
          )}
        >
          {a.level === 'overdue' ? <TriangleAlert className="size-3" aria-hidden="true" /> : <CalendarClock className="size-3" aria-hidden="true" />}
          {text(a)}
        </span>
      ))}
      {alerts.length > max ? <span className="text-[11px] text-muted-foreground">+{alerts.length - max}</span> : null}
    </div>
  );
}
