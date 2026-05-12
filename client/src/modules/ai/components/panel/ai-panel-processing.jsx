'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';

export function AiPanelProcessing({ uploadProgress, onCancel, isCancelling }) {
  const { t } = useLanguage();
  const showProgress = uploadProgress > 0 && uploadProgress < 100;

  return (
    <div className="flex flex-col gap-4 px-2 py-4">
      <p className="text-sm text-muted-foreground text-center">
        {showProgress
          ? t('ai.panel.uploadingRecording', 'Aufnahme wird hochgeladen...')
          : t('ai.panel.transcribing', 'Transkription laeuft...')}
      </p>

      {showProgress && (
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 mt-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>

      {onCancel && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          onClick={onCancel}
          disabled={isCancelling}
        >
          {isCancelling ? t('common.canceling', 'Wird abgebrochen...') : t('common.cancel', 'Abbrechen')}
        </Button>
      )}
    </div>
  );
}
