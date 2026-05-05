'use client';

import { cn } from '@/lib/utils';
import { ARTICLE_STATUS_CONFIG } from '../constants/catalog-constants';
import { useLanguage } from '@/lib/i18n/language-context';

export function ArticleStatusBadge({ status, size = 'md' }) {
  const { locale: language } = useLanguage();
  const cfg = ARTICLE_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
      cfg.badge,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {language === 'de' ? cfg.label : cfg.labelEn}
    </span>
  );
}
