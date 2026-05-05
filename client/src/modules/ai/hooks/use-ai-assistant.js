'use client';

import { useAiStore } from '../store/ai-store';
import { useVoiceSession } from './use-voice-session';
import { useAgentRun } from './use-agent-run';
import { useAudioRecorder } from './use-audio-recorder';
import { PANEL_VIEWS, RECORDING_STATES, SESSION_TYPES, isTerminalAgentStatus } from '../constants/ai-constants';
import { showError } from '@/lib/toast';

/**
 * Top-level orchestrator combining voice session + agent run + recorder.
 * Single hook consumed by AiAssistantPanel.
 */
export function useAiAssistant() {
  const isPanelOpen  = useAiStore((s) => s.isPanelOpen);
  const panelView    = useAiStore((s) => s.panelView);
  const activeSessionId = useAiStore((s) => s.activeSessionId);
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
      }
    },
  });

  const startVoiceSession = async () => {
    try {
      const session = await voiceSession.createSessionAsync(SESSION_TYPES.COMMAND);
      const sid = session._id || session.id;
      await recorder.startRecording(sid);
    } catch {
      // onError in the mutation handles the toast
    }
  };

  const stopVoiceRecording = () => {
    recorder.stopRecording();
  };

  const handleTextSubmit = (input) => {
    openPanel();
    agentRun.dispatch(input);
  };

  const resetToIdle = () => {
    recorder.reset();
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
    stopRecording:    stopVoiceRecording,
    submitCorrections: voiceSession.submitCorrections,
    confirmSession:   voiceSession.confirmSession,
    cancelSession:    voiceSession.cancelSession,
    isConfirmingSession: voiceSession.isConfirming,

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
