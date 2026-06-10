'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ASSIGNMENT_STATUS_META, translateMetaLabel } from '../../constants/deploy-constants';

export function AssignmentStatusBadge({ status, className }) {
  const { t } = useLanguage();
  const meta = ASSIGNMENT_STATUS_META[status];
  if (!meta) return null;

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', meta.bgColor, meta.textColor, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotColor)} />
      {translateMetaLabel(t, meta)}
    </span>
  );
}
