'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Square, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { AUDIO_RECORDER_ERRORS, useAudioRecorder } from '../hooks/use-audio-recorder';

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function getRecorderErrorMessage(error, t) {
  if (error === AUDIO_RECORDER_ERRORS.UPLOAD_FAILED) {
    return t('chat.uploadFailed', 'Upload failed. Please try again.');
  }
  if (error === AUDIO_RECORDER_ERRORS.MICROPHONE_DENIED) {
    return t('chat.microphoneDenied', 'Microphone access denied.');
  }
  return error;
}

export function ChatAudioRecorder({ onComplete, onCancel }) {
  const { t } = useLanguage();
  const {
    isRecording,
    duration,
    error,
    result,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  } = useAudioRecorder();

  useEffect(() => {
    startRecording();
  }, [startRecording]);

  useEffect(() => {
    if (result) {
      onComplete(result);
      reset();
    }
  }, [result, onComplete, reset]);

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2">
      <div className="flex h-6 items-center gap-0.5">
        {[0.4, 0.7, 1, 0.7, 0.4, 0.6, 0.9, 0.5].map((height, index) => (
          <span
            key={index}
            className="w-1 animate-pulse rounded-full bg-destructive"
            style={{ height: `${height * 24}px`, animationDelay: `${index * 80}ms` }}
          />
        ))}
      </div>

      <span className="min-w-12 font-mono text-sm font-semibold text-destructive">
        {formatDuration(duration)}
      </span>

      <span className="flex-1 text-xs text-muted-foreground">{t('chat.recording', 'Recording...')}</span>
      {error && <span className="text-xs text-destructive">{getRecorderErrorMessage(error, t)}</span>}

      <Button
        size="sm"
        variant="destructive"
        className="h-7 gap-1 px-2"
        onClick={() => stopRecording(false)}
        disabled={!isRecording}
      >
        <Square className="h-3 w-3" />
        {t('common.send', 'Send')}
      </Button>

      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={() => {
          cancelRecording();
          onCancel();
        }}
        aria-label={t('common.cancel', 'Cancel')}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
