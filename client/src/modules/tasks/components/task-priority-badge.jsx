'use client';

import { cn } from '@/lib/utils';
import { TASK_PRIORITY_CONFIG } from '../constants/task-constants';
import { useLanguage } from '@/lib/i18n/language-context';

export function TaskPriorityBadge({ priority, size = 'md' }) {
  const { locale: language } = useLanguage();
  const cfg = TASK_PRIORITY_CONFIG[priority] || TASK_PRIORITY_CONFIG.NONE;
  if (priority === 'NONE') return null;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium',
      size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
      cfg.badge,
    )}>
      <span className="font-bold">{cfg.icon}</span>
      {language === 'de' ? cfg.label : cfg.labelEn}
    </span>
  );
}
