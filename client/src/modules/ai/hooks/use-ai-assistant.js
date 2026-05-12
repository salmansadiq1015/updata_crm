'use client';

import { useAiStore } from '../store/ai-store';
import { useVoiceSession } from './use-voice-session';
import { useAgentRun } from './use-agent-run';
import { useAudioRecorder } from './use-audio-recorder';
import { PANEL_VIEWS, SESSION_TYPES, isTerminalAgentStatus } from '../constants/ai-constants';
import { showError } from '@/lib/toast';

/**
 * Top-level orchestrator combining voice session + agent run + recorder.
 * Single hook consumed by AiAssistantPanel.
 */
export function useAiAssistant() {
  const isPanelOpen  = useAiStore((s) => s.isPanelOpen);
  const panelView    = useAiStore((s) => s.panelView);
  const activeRunId  = useAiStore((s) => s.activeRunId);
  const openPanel    = useAiStore((s) => s.openPanel);
  const closePanel   = useAiStore((s) => s.closePanel);
  const setPanelView = useAiStore((s) => s.setPanelView);

  const voiceSession = useVoiceSession();
  const agentRun     = useAgentRun();

  const recorder = useAudioRecorder({
    onUploadComplete: () => {
      voiceSession.onAudioUploaded();
    },
    onError: (code) => {
      if (code === 'UPLOAD_FAILED') {
        showError('Upload failed — your recording was saved and will retry when connected.');
      } else if (code === 'MIC_DENIED') {
        showError('Microphone access denied. Please enable it in your browser settings.');
      } else if (code === 'MIC_NOT_SUPPORTED') {
        showError('Voice input is not supported in this browser. Please use text input.');
      } else if (code === 'EMPTY_AUDIO') {
        showError('No audio was captured. Please try again.');
      }
    },
  });

  const startVoiceSession = async () => {
    let sessionId = null;
    try {
      const session = await voiceSession.createSessionAsync(SESSION_TYPES.COMMAND);
      sessionId = session?._id || session?.id;
      if (!sessionId) {
        throw new Error('Voice session could not be started.');
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
    // Panel state
    isPanelOpen,
    panelView,
    openPanel,
    closePanel,
    resetToIdle,
    hasActiveRun,

    // Voice session
    session:          voiceSession.session,
    createSession:    startVoiceSession,
    isCreating:       voiceSession.isCreating,
    stopRecording:    stopVoiceRecording,
    submitCorrections: voiceSession.submitCorrections,
    confirmSession:   voiceSession.confirmSession,
    cancelSession:    voiceSession.cancelSession,
    isConfirmingSession: voiceSession.isConfirming,
    isCancellingSession: voiceSession.isCancelling,

    // Recorder
    recorder,

    // Agent run
    agentRun:       agentRun.agentRun,
    workflowLabel:  agentRun.workflowLabel,
    dispatch:       handleTextSubmit,
    isDispatching:  agentRun.isDispatching,
    confirmRun:     agentRun.confirmRun,
    isConfirmingRun: agentRun.isConfirming,
  };
}
