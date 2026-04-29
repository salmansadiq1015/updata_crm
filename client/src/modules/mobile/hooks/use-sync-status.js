'use client';

import { useEffect } from 'react';
import { useSyncStore } from '../stores/sync-store';
import { useNetworkStatus } from './use-network-status';
import { getPendingSyncCount, getFailedSyncCount } from '../db/mobile-db';

export function useSyncStatus() {
  const isOnline = useNetworkStatus();
  const store = useSyncStore();

  useEffect(() => {
    if (!isOnline) {
      useSyncStore.getState().setOffline();
    } else {
      useSyncStore.getState().setOnline();
    }
  }, [isOnline]);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const pending = await getPendingSyncCount();
      const failed = await getFailedSyncCount();
      if (mounted) useSyncStore.getState().setCounts(pending, failed);
    };
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return {
    syncStatus: store.syncStatus,
    lastSyncAt: store.lastSyncAt,
    pendingCount: store.pendingCount,
    failedCount: store.failedCount,
    currentOperation: store.currentOperation,
    progress: store.progress,
    isOnline,
  };
}
