'use client';

import { cn } from '@/lib/utils';
import { TASK_STATUS_CONFIG } from '../constants/task-constants';
import { useLanguage } from '@/lib/i18n/language-context';

export function TaskStatusBadge({ status, size = 'md' }) {
  const { locale: language } = useLanguage();
  const cfg = TASK_STATUS_CONFIG[status] || TASK_STATUS_CONFIG.OPEN;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      cfg.badge,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dot)} />
      {language === 'de' ? cfg.label : cfg.labelEn}
    </span>
  );
}
