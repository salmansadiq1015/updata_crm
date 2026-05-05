'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AiChatRetryIndicator({ retryState, maxAttempts = 3 }) {
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    if (!retryState.nextRetryAt) { setCountdown(null); return; }
    const tick = () => setCountdown(Math.max(0, Math.ceil((retryState.nextRetryAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [retryState.nextRetryAt]);

  if (!retryState.nextRetryAt && !retryState.isRetrying && !retryState.exhausted) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs mt-2',
        retryState.exhausted
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {retryState.isRetrying && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
      {retryState.nextRetryAt && !retryState.isRetrying && (
        <AlertCircle className="h-3 w-3 shrink-0" />
      )}

      {retryState.exhausted
        ? `Failed after ${maxAttempts} attempts`
        : retryState.isRetrying
        ? `Retrying (${retryState.attemptCount}/${maxAttempts})…`
        : `Retrying in ${countdown}s…`}
    </div>
  );
}
