// Who is signed in and what the navigator should show. Tokens are not here
// (see services/auth/tokenManager); the user profile is small and needed
// synchronously by navigation, so it lives here rather than in the query cache.
import { create } from 'zustand';

import type { User } from '../types';

export type SessionStatus = 'restoring' | 'authenticated' | 'unauthenticated' | 'restore_failed';

/** Why the last session ended, so the UI can tell the user (once). */
export type SessionEndReason = 'signed_out' | 'expired' | null;

type SessionState = {
  status: SessionStatus;
  user: User | null;
  endReason: SessionEndReason;
  setAuthenticated: (user: User) => void;
  setUnauthenticated: (reason: SessionEndReason) => void;
  setRestoring: () => void;
  setRestoreFailed: () => void;
  acknowledgeEndReason: () => void;
};

export const useSessionStore = create<SessionState>()((set) => ({
  status: 'restoring',
  user: null,
  endReason: null,
  setAuthenticated: (user) => set({ status: 'authenticated', user, endReason: null }),
  setUnauthenticated: (endReason) => set({ status: 'unauthenticated', user: null, endReason }),
  setRestoring: () => set({ status: 'restoring' }),
  setRestoreFailed: () => set({ status: 'restore_failed', user: null }),
  acknowledgeEndReason: () => set({ endReason: null }),
}));
