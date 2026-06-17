'use client';

import { cn } from '@/lib/utils';
import { ARTICLE_STATUS_CONFIG } from '../constants/catalog-constants';
import { useLanguage } from '@/lib/i18n/language-context';

const STATUS_LABEL_KEYS = {
  ACTIVE: 'catalog.articles.statusActive',
  INACTIVE: 'catalog.articles.statusInactive',
};

export function ArticleStatusBadge({ status, size = 'md' }) {
  const { t } = useLanguage();
  const cfg = ARTICLE_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
      cfg.badge,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {t(STATUS_LABEL_KEYS[status], cfg.labelEn)}
    </span>
  );
}
