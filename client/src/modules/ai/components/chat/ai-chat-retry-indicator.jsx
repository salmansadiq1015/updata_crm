'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

export function AiChatRetryIndicator({ retryState, maxAttempts = 3 }) {
  const { t } = useLanguage();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!retryState.nextRetryAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [retryState.nextRetryAt]);

  if (!retryState.nextRetryAt && !retryState.isRetrying && !retryState.exhausted) return null;
  const countdown = retryState.nextRetryAt
    ? Math.max(0, Math.ceil((retryState.nextRetryAt - now) / 1000))
    : 0;

  const label = retryState.exhausted
    ? t('ai.retry.failed', null, { max: maxAttempts })
    : retryState.isRetrying
      ? t('ai.retry.retrying', null, { attempt: retryState.attemptCount, max: maxAttempts })
      : t('ai.retry.in', null, { seconds: countdown });

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-xs mt-2',
        retryState.exhausted
          ? 'bg-destructive/10 text-destructive'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {retryState.isRetrying && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
      {retryState.nextRetryAt && !retryState.isRetrying && (
        <AlertCircle className="h-3 w-3 shrink-0" />
      )}
      {label}
    </div>
  );
}
