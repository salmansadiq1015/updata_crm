'use client';

import { ChevronDown, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { DISCOVERY_PAGE_SIZE_OPTIONS } from '../hooks/use-discovery';

type ResultPaginationProps = {
  pageSize: number;
  total: number;
  loadedCount: number;
  hasNextPage?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  onLoadMore: () => void;
  onPageSizeChange: (pageSize: number) => void;
  onRetry?: () => void;
};

export function ResultPagination({
  pageSize,
  total,
  loadedCount,
  hasNextPage,
  isFetching,
  isError,
  onLoadMore,
  onPageSizeChange,
  onRetry,
}: ResultPaginationProps) {
  const { t } = useLanguage();
  const loaded = Math.min(loadedCount, total || loadedCount);
  const canLoadMore = !isFetching && Boolean(hasNextPage);

  return (
    <nav
      aria-label={t('common.pagination', 'Pagination')}
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2.5"
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="whitespace-nowrap tabular-nums" aria-live="polite">
          {t('leadgen.pagination.loaded', 'Showing {loaded} of {total}', { loaded, total })}
        </span>
        <Select value={String(pageSize)} onValueChange={(value: string) => onPageSizeChange(Number(value))}>
          <SelectTrigger
            className="h-7 w-[72px] rounded-lg text-[11px]"
            aria-label={t('common.rowsPerBatch', 'Rows per batch')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {DISCOVERY_PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1">
        {isError && onRetry && (
          <Button variant="outline" size="sm" className="me-1 h-7 gap-1 px-2 text-[11px]" onClick={onRetry}>
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            {t('common.retry', 'Retry')}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 rounded-lg px-2 text-[11px]"
          onClick={onLoadMore}
          disabled={!canLoadMore}
          aria-label={t('leadgen.pagination.loadMore', 'Load more results')}
        >
          {isFetching
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
          {t('leadgen.pagination.loadMore', 'Load more')}
        </Button>
      </div>
    </nav>
  );
}
