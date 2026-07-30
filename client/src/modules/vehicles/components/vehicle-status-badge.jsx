'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { VEHICLE_STATUS_META } from '../hooks/use-vehicles';

export function VehicleStatusBadge({ status, className }) {
  const { t } = useLanguage();
  const meta = VEHICLE_STATUS_META[status] || VEHICLE_STATUS_META.available;
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', meta.cls, className)}>
      {t(meta.labelKey, meta.label)}
    </span>
  );
}
