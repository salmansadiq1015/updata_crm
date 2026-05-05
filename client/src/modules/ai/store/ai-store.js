import { create } from 'zustand';
import { PANEL_VIEWS, RECORDING_STATES } from '../constants/ai-constants';
import { registerAiStoreReset } from '@/stores/auth-store';

const INITIAL_STATE = {
  isPanelOpen:     false,
  recordingState:  RECORDING_STATES.IDLE,
  activeSessionId: null,
  activeRunId:     null,
  panelView:       PANEL_VIEWS.IDLE,
  voiceMode:       'manual',
  autoPlay:        false,
};

export const useAiStore = create((set) => ({
  ...INITIAL_STATE,

  openPanel: () => set({ isPanelOpen: true }),

  closePanel: () =>
    set({
      isPanelOpen:     false,
      panelView:       PANEL_VIEWS.IDLE,
      activeSessionId: null,
      activeRunId:     null,
      recordingState:  RECORDING_STATES.IDLE,
      voiceMode:       'manual',
    }),

  setPanelView: (view) => set({ panelView: view }),

  setRecordingState: (recordingState) => set({ recordingState }),

  setActiveSessionId: (id) => set({ activeSessionId: id }),

  setActiveRunId: (id) => set({ activeRunId: id }),

  setVoiceMode: (voiceMode) => set({ voiceMode }),

  setAutoPlay: (autoPlay) => set({ autoPlay }),

  resetAll: () => set(INITIAL_STATE),
}));

// Wire up logout reset (runs once at module load)
registerAiStoreReset(() => useAiStore.getState().resetAll());
