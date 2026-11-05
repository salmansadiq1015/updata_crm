'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { FileText, Loader2, RadioTower } from 'lucide-react';
import { getSessionTranscript } from '../../utils/voice-session-transcript';

export function AiPanelProcessing({ session, uploadProgress, onCancel, isCancelling }) {
  const { t } = useLanguage();
  const showProgress = uploadProgress > 0 && uploadProgress < 100;
  const transcript = getSessionTranscript(session);

  return (
    <div className="flex min-h-full flex-col justify-center gap-5 px-5 py-8">
      <div className="rounded-2xl border border-brand-300/15 bg-brand-400/[0.06] p-5 text-center shadow-[0_18px_70px_rgba(14,165,233,0.12)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-300/10 text-brand-200 ring-1 ring-brand-200/20">
          {showProgress ? <RadioTower className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
        </div>
        <p className="mt-4 text-sm font-semibold text-white">
          {showProgress
            ? t('ai.panel.uploadingRecording', 'Uploading recording...')
            : t('ai.panel.transcribing', 'Transcribing...')}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          {t('ai.panel.processingHint', 'Keeping the session open while the assistant extracts intent and entities.')}
        </p>
      </div>

      {showProgress && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-500 transition-all duration-300"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {transcript.text ? (
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-emerald-200">
            <FileText className="h-4 w-4" />
            {t('ai.panel.transcriptReceived', 'Transcript received')}
          </div>
          <p className="line-clamp-5 text-sm leading-6 text-slate-200" data-testid="ai-processing-transcript">
            {transcript.text}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {t('ai.panel.extractingEntities', 'Extracting entities and workflow intent...')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-4/5 bg-white/10" />
          <Skeleton className="h-4 w-3/5 bg-white/10" />
        </div>
      )}

      {onCancel && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10 hover:text-white"
          onClick={onCancel}
          disabled={isCancelling}
        >
          {isCancelling ? t('common.canceling') : t('common.cancel')}
        </Button>
      )}
    </div>
  );
}
