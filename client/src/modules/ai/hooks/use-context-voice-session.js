'use client';

import { useCallback } from 'react';
import { useVoiceSession } from './use-voice-session';
import { useAudioRecorder } from './use-audio-recorder';
import { useAiLanguage } from './use-ai-language';
import { useVoiceCommandRouter } from './use-voice-command-router';
import { RECORDING_STATES, SESSION_TYPES } from '../constants/ai-constants';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useContextVoiceSession({
  sessionType = SESSION_TYPES.COMMAND,
  contextModule,
  contextRecordType,
  contextRecordId,
  deviceType = 'MOBILE',
  onComplete,
} = {}) {
  const { t } = useLanguage();
  const language = useAiLanguage();
  const voiceSession = useVoiceSession();
  const { executeCommand } = useVoiceCommandRouter();

  const recorder = useAudioRecorder({
    onUploadComplete: () => voiceSession.onAudioUploaded(),
    onError: (code) => {
      if (code === 'MIC_DENIED') showError(t('ai.error.micDenied'));
      else if (code === 'UPLOAD_FAILED') showError(t('ai.error.uploadSaved'));
    },
  });

  const buildSessionPayload = useCallback(() => ({
    sessionType,
    language,
    deviceType,
    ...(contextModule ? { contextModule } : {}),
    ...(contextRecordType ? { contextRecordType } : {}),
    ...(contextRecordId ? { contextRecordId } : {}),
  }), [sessionType, language, deviceType, contextModule, contextRecordType, contextRecordId]);

  const startRecording = useCallback(async () => {
    const session = await voiceSession.createSessionAsync(buildSessionPayload());
    const sessionId = session?._id || session?.id;
    if (!sessionId) throw new Error(t('ai.error.sessionStartFailed'));
    await recorder.startRecording(sessionId);
    return sessionId;
  }, [voiceSession, recorder, buildSessionPayload, t]);

  const stopAndProcess = useCallback(async () => {
    await recorder.stopRecording();
  }, [recorder]);

  const confirmAndFinish = useCallback(async () => {
    await voiceSession.confirmSession();
  }, [voiceSession]);

  const handleSessionComplete = useCallback((session) => {
    const result = session?.result;
    if (result && executeCommand(result)) {
      showSuccess(t('ai.command.executed'));
    }
    onComplete?.(session);
  }, [executeCommand, onComplete, t]);

  return {
    language,
    session: voiceSession.session,
    isRecording: recorder.recordingState === RECORDING_STATES.RECORDING,
    isUploading: recorder.recordingState === RECORDING_STATES.UPLOADING,
    isProcessing: voiceSession.isConfirming || voiceSession.isLoadingSession,
    startRecording,
    stopAndProcess,
    submitCorrections: voiceSession.submitCorrections,
    confirmSession: confirmAndFinish,
    cancelSession: voiceSession.cancelSession,
    handleSessionComplete,
    recorder,
    voiceSession,
  };
}
