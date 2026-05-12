'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowUp, Square, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { RECORDING_STATES, SESSION_STATUSES } from '../../constants/ai-constants';
import { AiRecordingTimer } from '../recorder/ai-recording-timer';
import { AiWaveform } from '../recorder/ai-waveform';
import { AiEntityList } from '../entity/ai-entity-list';
import { AiVoiceTranscriptPreview } from '../voice/ai-voice-transcript-preview';

export function AiChatInput({
  onSubmit,
  isDispatching,
  recorder,
  voiceSession,
  onVoiceStart,
  // STT voice props
  voiceState,
  transcript,
  onStartListening,
  onStopListening,
  isSTTSupported,
}) {
  const { t } = useLanguage();
  const [value, setValue] = useState('');
  const [corrections, setCorrections] = useState({});
  const textareaRef = useRef(null);

  const isListening = voiceState === 'listening';
  const isVoiceProcessing = voiceState === 'processing';

  // Mirror partial STT transcript into textarea
  useEffect(() => {
    if (!isListening) return;
    const sttText = (transcript?.final ?? '') + (transcript?.partial ?? '');
    setValue(sttText);
  }, [isListening, transcript?.partial, transcript?.final]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 3 || isDispatching) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, isDispatching, onSubmit]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isRecording = recorder?.recordingState === RECORDING_STATES.RECORDING;
  const isUploading = recorder?.recordingState === RECORDING_STATES.UPLOADING;
  const sessionStatus = voiceSession?.session?.status;
  const isEntityReview = sessionStatus === SESSION_STATUSES.AWAITING_CONFIRMATION;
  const isVoiceBusy = isRecording || isUploading || isEntityReview;

  return (
    <div className="border-t border-border bg-background/80 backdrop-blur-sm shrink-0">
      {/* Entity review card */}
      {isEntityReview && voiceSession?.session?.entities?.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
              {t('ai.chat.extracted', 'Extracted from your recording')}
            </p>
            <AiEntityList
              entities={voiceSession.session.entities}
              onCorrectionsChange={setCorrections}
            />
            <div className="flex gap-2 mt-4 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => voiceSession.cancelSession()}
                disabled={voiceSession.isCancelling}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => voiceSession.confirmSession()}
                disabled={voiceSession.isConfirming}
              >
                {voiceSession.isConfirming ? 'Confirming…' : 'Confirm →'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 space-y-2">
        {/* Legacy audio recording mode */}
        {isRecording && (
          <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-destructive animate-pulse shrink-0" />
            <AiRecordingTimer
              elapsed={recorder.elapsed}
              isWarning={recorder.isWarning}
            />
            <div className="flex-1 min-w-0">
              <AiWaveform
                getWaveformData={recorder.getWaveformData}
                stopWaveform={recorder.stopWaveform}
                isActive={isRecording}
              />
            </div>
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 shrink-0"
              onClick={() => recorder.stopRecording()}
              title={t('ai.panel.stopRecording', 'Stop recording')}
            >
              <Square className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Upload progress */}
        {isUploading && (
          <div className="space-y-1.5 px-1">
            <p className="text-xs text-muted-foreground">Uploading recording…</p>
            <Progress value={recorder.uploadProgress} className="h-1.5" />
          </div>
        )}

        {/* Text input */}
        {!isVoiceBusy && (
          <div
            className={cn(
              'relative rounded-xl border bg-card shadow-sm focus-within:border-primary/50 transition-colors',
              isListening && 'ring-2 ring-primary/40'
            )}
          >
            {/* Live STT transcript preview inside input */}
            {isListening && transcript && (
              <AiVoiceTranscriptPreview transcript={transcript} voiceState={voiceState} />
            )}

            <Textarea
              ref={textareaRef}
              value={isListening ? '' : value}
              onChange={(e) => !isListening && setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening
                  ? 'Listening…'
                  : isVoiceProcessing
                  ? 'Processing…'
                  : 'Type a command or question…'
              }
              className={cn(
                'resize-none border-0 bg-transparent',
                'px-4 pt-3 pb-10',
                'min-h-[52px] max-h-36',
                'focus-visible:ring-0 shadow-none text-sm'
              )}
              rows={1}
              disabled={isDispatching || isListening || isVoiceProcessing}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              {isSTTSupported !== false && (
                <Button
                  size="icon"
                  variant={isListening ? 'destructive' : 'ghost'}
                  className={cn(
                    'h-7 w-7',
                    !isListening && 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={isListening ? onStopListening : (onStartListening ?? onVoiceStart)}
                  title={isListening ? t('ai.chat.stopListening', 'Stop listening') : t('ai.chat.startVoiceInput', 'Start voice input')}
                  type="button"
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <Button
                size="icon"
                className="h-7 w-7"
                onClick={handleSubmit}
                disabled={!value.trim() || value.trim().length < 3 || isDispatching || isListening}
                type="button"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {value.trim().length > 0 && value.trim().length < 3 ? (
          <p className="text-xs text-destructive text-center">
            {t('ai.chat.minimumChars', 'Minimum 3 characters required')}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground text-center">
            AI can make mistakes — always verify important actions.
          </p>
        )}
      </div>
    </div>
  );
}
