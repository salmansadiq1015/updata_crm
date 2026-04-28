'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export default function MobileError({ error, reset }) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-lg font-semibold mb-2">
        {t('mobile.error.title', 'Etwas ist schiefgelaufen')}
      </h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        {error?.message || t('mobile.error.defaultMessage', 'Ein unerwarteter Fehler ist aufgetreten.')}
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <RotateCcw className="h-4 w-4" />
        {t('mobile.error.retry', 'Erneut versuchen')}
      </button>
    </div>
  );
}
