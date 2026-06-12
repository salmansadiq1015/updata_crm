'use client';

import { useAiStore } from '../store/ai-store';
import { useVoiceSession } from './use-voice-session';
import { useAgentRun } from './use-agent-run';
import { useAudioRecorder } from './use-audio-recorder';
import { PANEL_VIEWS, SESSION_TYPES, isTerminalAgentStatus } from '../constants/ai-constants';
import { showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useAiAssistant() {
  const { t } = useLanguage();
  const isPanelOpen = useAiStore((s) => s.isPanelOpen);
  const panelView = useAiStore((s) => s.panelView);
  const activeRunId = useAiStore((s) => s.activeRunId);
  const openPanel = useAiStore((s) => s.openPanel);
  const closePanel = useAiStore((s) => s.closePanel);
  const setPanelView = useAiStore((s) => s.setPanelView);

  const voiceSession = useVoiceSession();
  const agentRun = useAgentRun();

  const recorder = useAudioRecorder({
    onUploadComplete: () => {
      voiceSession.onAudioUploaded();
    },
    onError: (code) => {
      if (code === 'UPLOAD_FAILED') {
        showError(t('ai.error.uploadSavedLong'));
      } else if (code === 'MIC_DENIED') {
        showError(t('ai.error.micDeniedSettings'));
      } else if (code === 'MIC_NOT_SUPPORTED') {
        showError(t('ai.error.micNotSupported'));
      } else if (code === 'EMPTY_AUDIO') {
        showError(t('ai.error.emptyAudio'));
      }
    },
  });

  const startVoiceSession = async () => {
    let sessionId = null;
    try {
      const session = await voiceSession.createSessionAsync(SESSION_TYPES.COMMAND);
      sessionId = session?._id || session?.id;
      if (!sessionId) {
        throw new Error(t('ai.error.sessionStartFailed'));
      }
      await recorder.startRecording(sessionId);
    } catch (err) {
      if (sessionId) {
        await voiceSession.cancelSessionById(sessionId);
      } else {
        voiceSession.resetSession();
      }
      if (!['MIC_DENIED', 'MIC_NOT_SUPPORTED'].includes(err?.message)) {
        showError(err);
      }
    }
  };

  const stopVoiceRecording = async () => {
    try {
      const result = await recorder.stopRecording();
      if (result?.queued || result?.skipped) {
        voiceSession.resetSession();
      }
    } catch {
      voiceSession.resetSession();
    }
  };

  const handleTextSubmit = (input) => {
    openPanel();
    agentRun.dispatch(input);
  };

  const resetToIdle = () => {
    recorder.reset();
    voiceSession.resetSession();
    setPanelView(PANEL_VIEWS.IDLE);
  };

  const hasActiveRun =
    !!activeRunId &&
    agentRun.agentRun?.status &&
    !isTerminalAgentStatus(agentRun.agentRun.status);

  return {
    isPanelOpen,
    panelView,
    openPanel,
    closePanel,
    resetToIdle,
    hasActiveRun,

    session: voiceSession.session,
    createSession: startVoiceSession,
    isCreating: voiceSession.isCreating,
    stopRecording: stopVoiceRecording,
    submitCorrections: voiceSession.submitCorrections,
    confirmSession: voiceSession.confirmSession,
    cancelSession: voiceSession.cancelSession,
    isConfirmingSession: voiceSession.isConfirming,
    isCancellingSession: voiceSession.isCancelling,

    recorder,

    agentRun: agentRun.agentRun,
    workflowLabel: agentRun.workflowLabel,
    dispatch: handleTextSubmit,
    isDispatching: agentRun.isDispatching,
    confirmRun: agentRun.confirmRun,
    isConfirmingRun: agentRun.isConfirming,
  };
}
