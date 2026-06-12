'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

export function AiVoiceTranscriptPreview({ transcript, voiceState }) {
  const { t } = useLanguage();
  const finalText = transcript?.final ?? transcript?.text ?? '';
  const partialText = transcript?.partial ?? '';
  const show = voiceState
    ? voiceState === 'listening' && (partialText || finalText)
    : Boolean(partialText || finalText);
  if (!show) return null;

  const isLowConf = transcript.confidence !== null && transcript.confidence < 0.6;
  const displayText = `${finalText}${partialText}`;

  return (
    <div className="px-4 pt-2">
      <p
        className={cn(
          'text-sm text-muted-foreground italic',
          isLowConf && 'underline decoration-dotted decoration-amber-400',
        )}
      >
        {displayText}
      </p>
      {isLowConf && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          {t('ai.voice.lowConfidence')}
        </p>
      )}
    </div>
  );
}
