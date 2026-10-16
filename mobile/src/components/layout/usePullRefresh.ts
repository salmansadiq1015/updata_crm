import { useCallback, useEffect, useRef, useState } from 'react';

/** If a pull starts no fetch at all (cache still fresh), release the spinner after this. */
const IDLE_RELEASE_MS = 600;

/**
 * Pull-to-refresh state that only reflects a refresh the *user* started.
 *
 * Passing a query's `isRefetching` straight to a RefreshControl makes Android draw
 * its spinner disc at the top of the screen on every background refetch (focus,
 * reconnect, invalidation after a mutation) — a stray "circle with a dot" the user
 * never asked for. This keeps the spinner for the pull gesture only: it shows from
 * the pull until the fetch it started settles.
 */
export function usePullRefresh(busy: boolean, refresh?: () => unknown) {
  const [pulled, setPulled] = useState(false);
  const sawBusy = useRef(false);

  useEffect(() => {
    if (!pulled) return undefined;
    if (busy) {
      sawBusy.current = true;
      return undefined;
    }
    if (sawBusy.current) {
      sawBusy.current = false;
      setPulled(false);
      return undefined;
    }
    const timer = setTimeout(() => setPulled(false), IDLE_RELEASE_MS);
    return () => clearTimeout(timer);
  }, [busy, pulled]);

  const onRefresh = useCallback(() => {
    if (!refresh) return;
    sawBusy.current = false;
    setPulled(true);
    refresh();
  }, [refresh]);

  return { refreshing: pulled, onRefresh: refresh ? onRefresh : undefined };
}
