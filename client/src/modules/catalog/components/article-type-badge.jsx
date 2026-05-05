'use client';

import { cn } from '@/lib/utils';
import { ARTICLE_TYPE_CONFIG } from '../constants/catalog-constants';
import { useLanguage } from '@/lib/i18n/language-context';

export function ArticleTypeBadge({ type, size = 'md' }) {
  const { locale: language } = useLanguage();
  const cfg = ARTICLE_TYPE_CONFIG[type];
  if (!cfg) return null;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-medium',
      size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
      cfg.badge,
    )}>
      {language === 'de' ? cfg.label : cfg.labelEn}
    </span>
  );
}
