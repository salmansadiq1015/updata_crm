'use client';

import { ChevronLeft, ChevronRight, ChevronsLeft, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { DISCOVERY_PAGE_SIZE_OPTIONS } from '../hooks/use-discovery';

type ResultPaginationProps = {
  pageIndex: number;
  pageSize: number;
  total: number;
  loadedPages: number;
  hasNextPage?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onPageSizeChange: (pageSize: number) => void;
  onRetry?: () => void;
};

export function ResultPagination({
  pageIndex,
  pageSize,
  total,
  loadedPages,
  hasNextPage,
  isFetching,
  isError,
  onFirst,
  onPrevious,
  onNext,
  onPageSizeChange,
  onRetry,
}: ResultPaginationProps) {
  const { t } = useLanguage();
  const page = pageIndex + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, total);
  const canGoBack = pageIndex > 0 && !isFetching;
  const canGoNext = !isFetching && page < pageCount && (pageIndex + 1 < loadedPages || Boolean(hasNextPage));

  return (
    <nav
      aria-label={t('common.pagination', 'Pagination')}
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-3 py-2.5"
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="whitespace-nowrap tabular-nums" aria-live="polite">
          {t('leadgen.pagination.range', '{start}–{end} of {total}', { start, end, total })}
        </span>
        <Select value={String(pageSize)} onValueChange={(value: string) => onPageSizeChange(Number(value))}>
          <SelectTrigger
            className="h-7 w-[72px] rounded-lg text-[11px]"
            aria-label={t('common.rowsPerPage', 'Rows per page')}
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
        <span className="me-1 whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
          {t('common.pageOf', 'Page {page} of {total}', { page, total: pageCount })}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-lg"
          onClick={onFirst}
          disabled={!canGoBack}
          aria-label={t('common.firstPage', 'First page')}
        >
          <ChevronsLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-lg"
          onClick={onPrevious}
          disabled={!canGoBack}
          aria-label={t('common.previousPage', 'Previous page')}
        >
          <ChevronLeft className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-lg"
          onClick={onNext}
          disabled={!canGoNext}
          aria-label={t('common.nextPage', 'Next page')}
        >
          {isFetching
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />}
        </Button>
      </div>
    </nav>
  );
}
