import { create } from 'zustand';

export const useSyncStore = create((set) => ({
  syncStatus: 'idle',
  lastSyncAt: null,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  currentOperation: null,
  progress: null,

  setSyncing: (operation) =>
    set({ syncStatus: 'syncing', currentOperation: operation }),

  setSyncComplete: () =>
    set({
      syncStatus: 'idle',
      currentOperation: null,
      progress: null,
      lastSyncAt: new Date().toISOString(),
    }),

  setSyncError: () =>
    set({ syncStatus: 'error', currentOperation: null, progress: null }),

  setOffline: () =>
    set({ syncStatus: 'offline' }),

  setOnline: () =>
    set((state) => ({
      syncStatus: state.syncStatus === 'offline' ? 'idle' : state.syncStatus,
    })),

  setCounts: (pendingCount, failedCount, conflictCount) =>
    set((state) => ({
      pendingCount,
      failedCount,
      conflictCount: conflictCount ?? state.conflictCount,
    })),

  setProgress: (current, total) =>
    set({ progress: { current, total } }),
}));
