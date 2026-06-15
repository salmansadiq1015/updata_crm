'use client';

import { AlertTriangle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { getDisplayErrorCode, getDisplayErrorMessage } from '@/lib/errors/display-error';

/**
 * Reusable error fallback. Auto-translated.
 * - If the error carries a 403 statusCode, renders a friendlier "no access" state.
 */
export function ErrorFallback({ error, reset }) {
  const { t } = useLanguage();

  const isForbidden = error?.statusCode === 403 || error?.response?.status === 403;
  const errorCode = getDisplayErrorCode(error);
  const message = getDisplayErrorMessage(error, t('errors.unexpected', 'An unexpected error occurred.'));

  if (isForbidden) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Lock className="h-8 w-8 text-amber-500 mb-4" />
        <h3 className="text-sm font-medium">{t('errors.forbiddenTitle', 'No access')}</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          {t('errors.forbiddenDesc', 'You do not have permission to view this page. Contact your administrator if you believe this is a mistake.')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive mb-4" />
      <h3 className="text-sm font-medium">{t('errors.loadingTitle', 'Could not load')}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">
        {message}
      </p>
      {errorCode && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t('errors.code', 'Error code')}:</span>{' '}
          <code>{String(errorCode)}</code>
        </div>
      )}
      {reset && (
        <Button variant="outline" size="sm" onClick={reset} className="mt-4">
          {t('common.retry', 'Retry')}
        </Button>
      )}
    </div>
  );
}
