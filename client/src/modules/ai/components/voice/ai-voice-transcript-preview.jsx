'use client';

import { cn } from '@/lib/utils';

export function AiVoiceTranscriptPreview({ transcript, voiceState }) {
  const show = voiceState === 'listening' && (transcript.partial || transcript.final);
  if (!show) return null;

  const isLowConf = transcript.confidence !== null && transcript.confidence < 0.6;
  const displayText = transcript.final + transcript.partial;

  return (
    <div className="px-4 pt-2">
      <p
        className={cn(
          'text-sm text-muted-foreground italic',
          isLowConf && 'underline decoration-dotted decoration-amber-400'
        )}
      >
        {displayText}
      </p>
      {isLowConf && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          Low confidence — tap to edit before sending
        </p>
      )}
    </div>
  );
}
