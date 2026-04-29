'use client';

import { cn } from '@/lib/utils';
import { PRIORITY_META } from '../../constants/deploy-constants';

export function PriorityIndicator({ priority, showLabel = true, className }) {
  const meta = PRIORITY_META[priority];
  if (!meta || priority === 'NORMAL') return null;

  const Icon = meta.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', meta.color, className)}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {showLabel && meta.label}
    </span>
  );
}
