'use client';

import { cn } from '@/lib/utils';
import { CONFIRMATION_STATUS_META } from '../../constants/deploy-constants';

export function AppointmentStatusBadge({ status, className }) {
  const meta = CONFIRMATION_STATUS_META[status];
  if (!meta) return null;

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', meta.bgColor, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotColor)} />
      {meta.label}
    </span>
  );
}
