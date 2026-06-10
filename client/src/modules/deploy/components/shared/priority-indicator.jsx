'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { PRIORITY_META, translateMetaLabel } from '../../constants/deploy-constants';

export function PriorityIndicator({ priority, showLabel = true, className }) {
  const { t } = useLanguage();
  const meta = PRIORITY_META[priority];
  if (!meta || priority === 'NORMAL') return null;

  const Icon = meta.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', meta.color, className)}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {showLabel && translateMetaLabel(t, meta)}
    </span>
  );
}
