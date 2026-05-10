'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export default function GlobalError({ error, reset }) {
  let t;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  try { t = useLanguage().t; } catch { t = (_, fb) => fb; }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>{t('errors.somethingWentWrong', 'Something went wrong')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            {error?.message || t('errors.unexpected', 'An unexpected error occurred. Please try again.')}
          </p>
        </CardContent>
        <CardFooter className="justify-center gap-2">
          <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
            {t('errors.goToDashboard', 'Go to dashboard')}
          </Button>
          <Button onClick={reset}>
            {t('errors.tryAgain', 'Try again')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
