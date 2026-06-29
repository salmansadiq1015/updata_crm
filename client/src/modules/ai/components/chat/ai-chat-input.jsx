'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { ArrowUp, Square, Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { MIN_AGENT_INPUT_LENGTH, RECORDING_STATES, SESSION_STATUSES } from '../../constants/ai-constants';
import { AiRecordingTimer } from '../recorder/ai-recording-timer';
import { AiWaveform } from '../recorder/ai-waveform';
import { AiEntityList } from '../entity/ai-entity-list';
import { AiVoiceTranscriptPreview } from '../voice/ai-voice-transcript-preview';
import {
  buildVoiceCorrectionPayload,
  getSessionTranscript,
  hasVoiceCorrectionPayload,
} from '../../utils/voice-session-transcript';

function AiVoiceSessionReview({ voiceSession, compact, onVoiceConfirmed }) {
  const { t } = useLanguage();
  const session = voiceSession?.session;
  const transcript = getSessionTranscript(session);
  const [corrections, setCorrections] = useState([]);
  const [transcriptText, setTranscriptText] = useState(transcript.text);
  const entities = session?.entities ?? [];
  const hasTranscript = transcriptText.trim().length >= MIN_AGENT_INPUT_LENGTH;

  const handleVoiceConfirm = useCallback(async () => {
    const entityCorrections = corrections
      .filter((correction) => correction.entityId && correction.correctedValue)
      .map((correction) => ({
        entityId: correction.entityId,
        correctedValue: correction.correctedValue,
      }));
    const correctionPayload = buildVoiceCorrectionPayload({
      entityCorrections,
      transcriptText,
      originalTranscript: transcript.text,
    });

    if (hasVoiceCorrectionPayload(correctionPayload)) {
      await voiceSession.submitCorrections(correctionPayload);
    }
    const confirmedSession = await voiceSession.confirmSession();
    onVoiceConfirmed?.({ session: confirmedSession, transcriptText });
  }, [corrections, onVoiceConfirmed, transcript.text, transcriptText, voiceSession]);

  return (
    <div className={compact ? 'px-4 pt-4' : 'mx-auto max-w-[980px] px-4 pt-4 md:px-6 lg:px-8'}>
      <div className="rounded-2xl border border-border/80 bg-card/95 p-4 shadow-lg shadow-black/5">
        <label
          htmlFor="ai-chat-transcript-review"
          className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {t('ai.panel.voiceTranscript', 'Voice transcript')}
        </label>
        <Textarea
          id="ai-chat-transcript-review"
          data-testid="ai-chat-transcript-review"
          value={transcriptText}
          onChange={(event) => setTranscriptText(event.target.value)}
          placeholder={t('ai.panel.transcriptPlaceholder', 'Review or correct the transcript before confirming...')}
          className="min-h-24 resize-none text-sm leading-6"
          maxLength={10000}
        />
        {!hasTranscript && (
          <p className="mt-2 text-xs leading-5 text-amber-600 dark:text-amber-300">
            {t('ai.panel.transcriptRequired', 'A transcript is required before the assistant can continue.')}
          </p>
        )}
        {transcript.confidence !== null && transcript.confidence < 0.6 && (
          <p className="mt-2 text-xs leading-5 text-amber-600 dark:text-amber-300">
            {t('ai.voice.lowConfidence', 'Low confidence transcript. Please review before confirming.')}
          </p>
        )}

        {entities.length > 0 ? (
          <div className="mt-4 border-t border-border/70 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('ai.chat.extracted')}
            </p>
            <AiEntityList
              entities={entities}
              onCorrectionsChange={setCorrections}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-border/70 bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">
            {t('ai.panel.noEntitiesDescription', 'Confirm the transcript to continue with a general assistant action.')}
          </div>
        )}

        <div className="mt-4 flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => voiceSession.cancelSession()}
            disabled={voiceSession.isCancelling || voiceSession.isConfirming}
          >
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleVoiceConfirm}
            disabled={!hasTranscript || voiceSession.isConfirming}
          >
            {voiceSession.isConfirming ? t('ai.confirm.confirming') : t('ai.confirm.confirmArrow')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AiChatInput({
  onSubmit,
  isDispatching,
  recorder,
  voiceSession,
  onVoiceStart,
  voiceState,
  transcript,
  onStartListening,
  onStopListening,
  isSTTSupported,
  compact = false,
  variant = 'default',
  onVoiceConfirmed,
}) {
  const { t } = useLanguage();
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);
  const isPanel = variant === 'panel';

  const isListening = voiceState === 'listening';
  const isVoiceProcessing = voiceState === 'processing';
  const sttText = useMemo(
    () => `${transcript?.final ?? ''}${transcript?.partial ?? ''}`,
    [transcript?.partial, transcript?.final],
  );

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < MIN_AGENT_INPUT_LENGTH || isDispatching) return;
    onSubmit(trimmed);
    setValue('');
  }, [value, isDispatching, onSubmit]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const isRecording = recorder?.recordingState === RECORDING_STATES.RECORDING;
  const isUploading = recorder?.recordingState === RECORDING_STATES.UPLOADING;
  const sessionStatus = voiceSession?.session?.status;
  const isEntityReview = sessionStatus === SESSION_STATUSES.AWAITING_CONFIRMATION;
  const isVoiceBusy = isRecording || isUploading || isEntityReview;

  return (
    <div className={cn(
      'shrink-0 border-t backdrop-blur-md',
      isPanel ? 'border-white/10 bg-slate-950/80' : 'border-border bg-background/90',
    )}>
      {isEntityReview && (
        <AiVoiceSessionReview
          key={voiceSession?.session?._id || voiceSession?.session?.id || 'voice-review'}
          voiceSession={voiceSession}
          compact={compact}
          onVoiceConfirmed={onVoiceConfirmed}
        />
      )}

      <div className={cn(
        'space-y-2 px-4 py-3',
        compact ? 'max-w-none' : 'mx-auto max-w-[980px] md:px-6 lg:px-8',
      )}>
        {isRecording && (
          <div className={cn(
            'flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg shadow-black/5',
            isPanel ? 'border-white/10 bg-white/[0.05]' : 'border-border/80 bg-card/95',
          )}>
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
              title={t('ai.panel.stopRecording')}
            >
              <Square className="h-3 w-3" />
            </Button>
          </div>
        )}

        {isUploading && (
          <div className="space-y-1.5 px-1">
            <p className="text-xs text-muted-foreground">{t('ai.chat.uploadingRecording')}</p>
            <Progress value={recorder.uploadProgress} className="h-1.5" />
          </div>
        )}

        {!isVoiceBusy && (
          <div
            className={cn(
              'relative rounded-2xl border shadow-lg shadow-black/5 transition-colors',
              isPanel
                ? 'border-white/10 bg-white/[0.06] focus-within:border-cyan-300/45 focus-within:shadow-cyan-500/10'
                : 'border-border/80 bg-card/95 focus-within:border-primary/50 focus-within:shadow-primary/10',
              isListening && 'ring-2 ring-primary/35',
            )}
          >
            {isListening && transcript && (
              <AiVoiceTranscriptPreview transcript={transcript} voiceState={voiceState} />
            )}

            <Textarea
              ref={textareaRef}
              value={isListening ? sttText : value}
              onChange={(event) => !isListening && setValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isListening
                  ? t('ai.chat.listening')
                  : isVoiceProcessing
                    ? t('ai.chat.processing')
                    : t('ai.chat.commandPlaceholder')
              }
              className={cn(
                'resize-none border-0 bg-transparent',
                'px-4 pt-4 pb-12',
                'min-h-[64px] max-h-36',
                'focus-visible:ring-0 shadow-none text-sm',
                isPanel && 'text-slate-100 placeholder:text-slate-500',
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
                    'h-8 w-8 rounded-xl',
                    !isListening && 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={isListening ? onStopListening : (onStartListening ?? onVoiceStart)}
                  title={isListening ? t('ai.chat.stopListening') : t('ai.chat.startVoiceInput')}
                  type="button"
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              <Button
                size="icon"
                className="h-8 w-8 rounded-xl shadow-sm"
                onClick={handleSubmit}
                disabled={!value.trim() || value.trim().length < MIN_AGENT_INPUT_LENGTH || isDispatching || isListening}
                type="button"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {value.trim().length > 0 && value.trim().length < MIN_AGENT_INPUT_LENGTH ? (
          <p className="text-xs text-destructive text-center">
            {t('ai.chat.minimumChars')}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground text-center">
            {t('ai.chat.disclaimer')}
          </p>
        )}
      </div>
    </div>
  );
}
