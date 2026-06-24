'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';

const PAGE_SIZES = [10, 25, 50, 100];

export function useQopCursorPagination(resetKey) {
  const [cursor, setCursor] = useState(null);
  const [cursorStack, setCursorStack] = useState([]);
  const [limit, setLimitValue] = useState(25);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(null);
    setCursorStack([]);
  }, [resetKey, limit]);

  const goNext = useCallback((nextCursor) => {
    if (!nextCursor) return;
    setCursorStack((current) => [...current, cursor]);
    setCursor(nextCursor);
  }, [cursor]);

  const goPrevious = useCallback(() => {
    const previousCursor = cursorStack[cursorStack.length - 1] ?? null;
    setCursorStack((current) => current.slice(0, -1));
    setCursor(previousCursor);
  }, [cursorStack]);

  const setLimit = useCallback((nextLimit) => {
    setLimitValue(Number(nextLimit));
  }, []);

  return {
    cursor,
    limit,
    pageIndex: cursorStack.length + 1,
    canPrevious: cursorStack.length > 0,
    setLimit,
    goNext,
    goPrevious,
  };
}

export function QopPaginationControls({
  pagination,
  itemCount,
  limit,
  pageIndex,
  canPrevious,
  onLimitChange,
  onPrevious,
  onNext,
}) {
  const { t } = useLanguage();
  const hasNext = Boolean(pagination?.hasNext && pagination?.nextCursor);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-x border-b border-border/70 bg-card/70 px-3 py-2.5 text-xs text-muted-foreground dark:bg-slate-950/40">
      <div className="flex items-center gap-2">
        <span className="tabular-nums">
          {t('qop.pagination.page', 'Page')} {pageIndex}
        </span>
        <span className="h-1 w-1 rounded-full bg-border" />
        <span className="tabular-nums">
          {t('qop.pagination.visibleRows', '{count} visible', { count: itemCount })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Select value={String(limit)} onValueChange={onLimitChange}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {t('common.perPage', '{count} / page', { count: size })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={onPrevious}
          disabled={!canPrevious}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('common.previous', 'Previous')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={() => onNext(pagination?.nextCursor)}
          disabled={!hasNext}
        >
          {t('qop.pagination.next', 'Next')}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function QopBulkActionBar({ selectedCount, onClear, children }) {
  const { t } = useLanguage();
  if (!selectedCount) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground shadow-sm animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <span className="font-medium tabular-nums">
        {t('qop.bulk.selected', '{count} selected', { count: selectedCount })}
      </span>
      <div className="flex-1" />
      {children}
      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onClear}>
        {t('common.clearSelection', 'Clear selection')}
      </Button>
    </div>
  );
}
