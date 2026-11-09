import { create } from 'zustand';

const VOICE_KEY = 'updata.liveVoice.voice';

function readVoice() {
  try { return window.localStorage.getItem(VOICE_KEY) || 'marin'; } catch { return 'marin'; }
}

/**
 * Whether the live voice conversation is open, and how. It lives at layout
 * level so a conversation survives navigation: "open my tasks" moves the
 * page underneath and shrinks the orb to a corner instead of hanging up.
 */
export const useLiveVoiceStore = create((set) => ({
  isOpen: false,
  minimized: false,
  /** thread the voice runs are written to (the chat thread it was opened from, if any) */
  threadId: null,
  voice: 'marin',
  /** bumped when a conversation ends, so the chat can jump to its thread */
  lastEnded: null,

  open: ({ threadId = null } = {}) => set({ isOpen: true, minimized: false, threadId, voice: readVoice() }),
  close: (endedThreadId = null) => set((s) => ({
    isOpen: false,
    minimized: false,
    lastEnded: endedThreadId ? { threadId: endedThreadId, at: Date.now() } : s.lastEnded,
  })),
  setMinimized: (minimized) => set({ minimized }),
  setVoice: (voice) => {
    try { window.localStorage.setItem(VOICE_KEY, voice); } catch { /* per-viewer convenience only */ }
    set({ voice });
  },
  reset: () => set({ isOpen: false, minimized: false, threadId: null, lastEnded: null }),
}));
