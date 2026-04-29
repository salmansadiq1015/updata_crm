import { create } from 'zustand';

export const usePresenceStore = create((set) => ({
  onlineIds: new Set(),
  setOnline: (userId) =>
    set((s) => ({ onlineIds: new Set([...s.onlineIds, String(userId)]) })),
  setOffline: (userId) =>
    set((s) => {
      const next = new Set(s.onlineIds);
      next.delete(String(userId));
      return { onlineIds: next };
    }),
  initBulk: (userIds) =>
    set({ onlineIds: new Set(userIds.map(String)) }),
}));
