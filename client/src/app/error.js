'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { getDisplayErrorCode, getDisplayErrorMessage } from '@/lib/errors/display-error';

export default function GlobalError({ error, reset, unstable_retry }) {
  let t;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  try { t = useLanguage().t; } catch { t = (_, fb) => fb; }
  const errorCode = getDisplayErrorCode(error);
  const message = getDisplayErrorMessage(
    error,
    t('errors.unexpected', 'An unexpected error occurred. Please try again.'),
  );
  const retry = reset || unstable_retry || (() => window.location.reload());

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>{t('errors.somethingWentWrong', 'Something went wrong')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            {message}
          </p>
          {errorCode && (
            <div className="mx-auto w-fit rounded-md border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t('errors.code', 'Error code')}:</span>{' '}
              <code>{String(errorCode)}</code>
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-center gap-2">
          <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
            {t('errors.goToDashboard', 'Go to dashboard')}
          </Button>
          <Button onClick={retry}>
            {t('errors.tryAgain', 'Try again')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
