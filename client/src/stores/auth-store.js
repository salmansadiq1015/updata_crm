import { create } from 'zustand';

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

  clearAuth: () =>
    set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false }),

  setLoading: (isLoading) =>
    set({ isLoading }),
}));
