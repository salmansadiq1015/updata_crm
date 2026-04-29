'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNetworkStatus } from './use-network-status';
import { enqueueSync } from '../db/mobile-db';
import { SYNC_PRIORITY } from '../constants/mobile-constants';
import { useSyncStore } from '../stores/sync-store';
import { getPendingSyncCount, getFailedSyncCount } from '../db/mobile-db';

async function updateSyncCounts() {
  const pending = await getPendingSyncCount();
  const failed = await getFailedSyncCount();
  useSyncStore.getState().setCounts(pending, failed);
}

export function useOfflineMutation({
  mutationFn,
  entityType,
  onOfflineWrite,
  invalidateKeys = [],
  onSuccess,
  onError,
}) {
  const isOnline = useNetworkStatus();
  const queryClient = useQueryClient();
  const [offlinePending, setOfflinePending] = useState(false);

  const invalidate = useCallback(() => {
    invalidateKeys.forEach((key) =>
      queryClient.invalidateQueries({ queryKey: key })
    );
  }, [queryClient, invalidateKeys]);

  const onlineMutation = useMutation({
    mutationFn,
    onSuccess: (data) => {
      invalidate();
      onSuccess?.(data);
    },
    onError,
  });

  const offlineMutate = useCallback(async (data) => {
    setOfflinePending(true);
    try {
      const result = await onOfflineWrite(data);

      const priority = SYNC_PRIORITY[entityType] ?? 50;
      await enqueueSync(
        entityType,
        result.entityId,
        result.operation,
        result.payload,
        priority
      );
      await updateSyncCounts();
      invalidate();
      onSuccess?.(result);
      return result;
    } catch (err) {
      onError?.(err);
      throw err;
    } finally {
      setOfflinePending(false);
    }
  }, [entityType, onOfflineWrite, invalidate, onSuccess, onError]);

  return {
    mutate: isOnline ? onlineMutation.mutate : (data) => offlineMutate(data).catch(() => {}),
    mutateAsync: isOnline ? onlineMutation.mutateAsync : offlineMutate,
    isPending: isOnline ? onlineMutation.isPending : offlinePending,
    isError: onlineMutation.isError,
    error: onlineMutation.error,
    isOffline: !isOnline,
    reset: onlineMutation.reset,
  };
}
