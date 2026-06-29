'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export function TablePagination({ page, pageSize, total, onPageChange, className }) {
  const { t } = useLanguage();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const go = (next) => {
    if (next < 1 || next > pageCount || next === page) return;
    onPageChange(next);
  };

  return (
    <div className={cn('flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3', className)}>
      <p className="text-xs text-muted-foreground">
        {start}–{end} {t('common.of', 'of')} {total}
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)} aria-label={t('common.previous', 'Previous')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs text-muted-foreground tabular-nums">{page} / {pageCount}</span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => go(page + 1)} aria-label={t('common.next', 'Next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
