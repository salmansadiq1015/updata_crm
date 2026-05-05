'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { classifyRunError } from '../utils/retry-classifier';

const BASE_BACKOFF_MS = 1000;

export function useMessageRetry({ onRetry, maxAttempts = 3 }) {
  const [retryState, setRetryState] = useState({
    attemptCount: 0,
    isRetrying: false,
    nextRetryAt: null,
    exhausted: false,
  });
  const timerRef = useRef(null);
  const onRetryRef = useRef(onRetry);
  const pendingCorrelationIdRef = useRef(null);
  useEffect(() => { onRetryRef.current = onRetry; }, [onRetry]);

  // Reactive timer: fires when nextRetryAt is set
  useEffect(() => {
    if (!retryState.nextRetryAt) return;
    const delay = Math.max(0, retryState.nextRetryAt - Date.now());
    timerRef.current = setTimeout(() => {
      setRetryState((s) => ({ ...s, isRetrying: true, nextRetryAt: null }));
      onRetryRef.current(pendingCorrelationIdRef.current);
    }, delay);
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [retryState.nextRetryAt]);

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setRetryState((s) => ({ ...s, isRetrying: false, nextRetryAt: null }));
  }, []);

  const scheduleRetry = useCallback(
    (runError, correlationId) => {
      const { isTransient } = classifyRunError(runError);
      if (!isTransient) return false;

      pendingCorrelationIdRef.current = correlationId;
      setRetryState((prev) => {
        const next = prev.attemptCount + 1;
        if (next > maxAttempts) {
          return { ...prev, exhausted: true, isRetrying: false, nextRetryAt: null };
        }
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, prev.attemptCount);
        return { attemptCount: next, isRetrying: false, nextRetryAt: Date.now() + backoffMs, exhausted: false };
      });
      return true;
    },
    [maxAttempts]
  );

  const reset = useCallback(() => {
    cancel();
    pendingCorrelationIdRef.current = null;
    setRetryState({ attemptCount: 0, isRetrying: false, nextRetryAt: null, exhausted: false });
  }, [cancel]);

  return { scheduleRetry, cancelRetry: cancel, resetRetry: reset, retryState, maxAttempts };
}
