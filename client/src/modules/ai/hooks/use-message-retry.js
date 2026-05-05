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
  useEffect(() => { onRetryRef.current = onRetry; }, [onRetry]);

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setRetryState((s) => ({ ...s, isRetrying: false, nextRetryAt: null }));
  }, []);

  const scheduleRetry = useCallback(
    (runError, correlationId) => {
      const { isTransient } = classifyRunError(runError);
      if (!isTransient) return false;

      setRetryState((prev) => {
        const next = prev.attemptCount + 1;
        if (next > maxAttempts) return { ...prev, exhausted: true, isRetrying: false, nextRetryAt: null };

        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, prev.attemptCount);
        const nextRetryAt = Date.now() + backoffMs;

        timerRef.current = setTimeout(() => {
          setRetryState((s) => ({ ...s, isRetrying: true, nextRetryAt: null }));
          onRetryRef.current(correlationId);
        }, backoffMs);

        return { attemptCount: next, isRetrying: false, nextRetryAt, exhausted: false };
      });
      return true;
    },
    [maxAttempts]
  );

  const reset = useCallback(() => {
    cancel();
    setRetryState({ attemptCount: 0, isRetrying: false, nextRetryAt: null, exhausted: false });
  }, [cancel]);

  useEffect(() => () => cancel(), [cancel]);

  return { scheduleRetry, cancelRetry: cancel, resetRetry: reset, retryState, maxAttempts };
}
