import { create } from 'zustand';
// Reset AI store on logout without a circular import
let _resetAiStore = null;
export function registerAiStoreReset(fn) { _resetAiStore = fn; }

export const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user, accessToken) =>
    set({ user, accessToken, isAuthenticated: true, isLoading: false }),

  setTokens: (accessToken) =>
    set({ accessToken }),

  setUser: (user) =>
    set({ user }),

  clearAuth: () => {
    _resetAiStore?.();
    set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (isLoading) =>
    set({ isLoading }),
}));
