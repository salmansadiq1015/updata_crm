import { useCallback, useRef } from 'react';

/**
 * Wrap an async action so repeated calls are ignored while one is running.
 * `disabled`/`loading` props only apply after a re-render; this guard holds
 * between a fast double tap and that render, so a write is never sent twice.
 */
export function useSingleFlight<Args extends unknown[]>(action: (...args: Args) => Promise<unknown>) {
  const running = useRef(false);
  return useCallback(
    (...args: Args) => {
      if (running.current) return;
      running.current = true;
      action(...args)
        .catch(() => undefined) // Errors are surfaced by the action itself (mutation onError).
        .finally(() => {
          running.current = false;
        });
    },
    [action],
  );
}
