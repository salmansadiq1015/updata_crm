'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ASSIGNMENT_TYPE_META, translateMetaLabel } from '../../constants/deploy-constants';

export function AssignmentTypeBadge({ type, className }) {
  const { t } = useLanguage();
  const meta = ASSIGNMENT_TYPE_META[type];
  if (!meta) return null;

  const Icon = meta.icon;

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', meta.bg, meta.color, className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {translateMetaLabel(t, meta)}
    </span>
  );
}
