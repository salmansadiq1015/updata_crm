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
  // Text a page hands the assistant ("Ask AI about this vehicle"). The panel
  // puts it in the input and clears it; it never sends on its own.
  pendingPrompt:   null,
};

export const useAiStore = create((set) => ({
  ...INITIAL_STATE,

  openPanel: () => set({ isPanelOpen: true }),

  openPanelWithPrompt: (text) => set({ isPanelOpen: true, pendingPrompt: text ? { text: String(text), at: Date.now() } : null }),

  consumePendingPrompt: () => set({ pendingPrompt: null }),

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
