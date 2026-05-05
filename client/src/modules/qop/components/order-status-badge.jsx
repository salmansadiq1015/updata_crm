'use client';

import { cn } from '@/lib/utils';
import { ORDER_STATUS_CONFIG } from '../constants/qop-constants';
import { useLanguage } from '@/lib/i18n/language-context';

export function OrderStatusBadge({ status, size = 'md' }) {
  const { locale: language } = useLanguage();
  const cfg = ORDER_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
      cfg.badge,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dot)} />
      {language === 'de' ? cfg.label : cfg.labelEn}
    </span>
  );
}
