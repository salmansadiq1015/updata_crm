'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

/**
 * Cursor-paginated list hook.
 *
 * Manages a stack of cursors so the user can page forward and backward
 * without re-fetching intermediate pages. The cursor string returned by the
 * current response is pushed onto the stack when the user clicks "Next",
 * and popped when they click "Prev".
 *
 * Arguments:
 *   queryKey    — React Query key factory fn that takes `{ cursor, ...params }`
 *   queryFn     — async fn that takes `{ cursor, ...params }` and returns
 *                 `{ data: T[], pagination: { cursor, hasMore, count } }`
 *   params      — any non-cursor params (filters, limit, sort)
 *   initialSize — initial pageSize (default 25)
 *
 * Returns:
 *   { items, pageSize, setPageSize, hasNext, hasPrev, isFetching,
 *     onNext, onPrev, reset, refetch }
 *
 * Why cursor stack (not page indexes)?
 *   Cursor pagination is stateless on the server — there's no "go to page 5"
 *   without walking forward. The stack preserves user navigation so the Prev
 *   button works against the already-fetched page history.
 */
export function useCursorList({ queryKey, queryFn, params = {}, initialSize = 25, refetchInterval }) {
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const [cursorState, setCursorState] = useState({ paramsKey, stack: [null] }); // null = first page
  const [pageSize, setPageSize] = useState(initialSize);

  const cursorStack = cursorState.paramsKey === paramsKey ? cursorState.stack : [null];
  const currentCursor = cursorStack[cursorStack.length - 1];

  const merged = useMemo(
    () => ({ cursor: currentCursor || undefined, limit: pageSize, ...params }),
    [currentCursor, pageSize, params],
  );

  const { data, isFetching, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: queryKey(merged),
    queryFn: () => queryFn(merged),
    placeholderData: keepPreviousData,
    ...(refetchInterval ? { refetchInterval } : {}),
  });

  const items = data?.data || [];
  const nextCursor = data?.pagination?.nextCursor || data?.pagination?.cursor || null;
  const hasMore = !isPlaceholderData && !!(data?.pagination?.hasNext ?? data?.pagination?.hasMore);

  const onNext = useCallback(() => {
    if (!hasMore || !nextCursor) return;
    setCursorState((prev) => ({
      paramsKey,
      stack: prev.paramsKey === paramsKey ? [...prev.stack, nextCursor] : [null, nextCursor],
    }));
  }, [hasMore, nextCursor, paramsKey]);

  const onPrev = useCallback(() => {
    setCursorState((prev) => ({
      paramsKey,
      stack: prev.paramsKey === paramsKey && prev.stack.length > 1 ? prev.stack.slice(0, -1) : [null],
    }));
  }, [paramsKey]);

  const reset = useCallback(() => {
    setCursorState({ paramsKey, stack: [null] });
  }, [paramsKey]);

  const handleSetPageSize = useCallback((size) => {
    setPageSize(size);
    setCursorState({ paramsKey, stack: [null] });
  }, [paramsKey]);

  return {
    items,
    pageSize,
    setPageSize: handleSetPageSize,
    hasNext: hasMore,
    hasPrev: cursorStack.length > 1,
    isFetching,
    isError,
    error,
    onNext,
    onPrev,
    reset,
    refetch,
  };
}
