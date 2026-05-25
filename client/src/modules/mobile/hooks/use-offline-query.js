'use client';

import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNetworkStatus } from './use-network-status';

export function useOfflineQuery({
  queryKey,
  queryFn,
  offlineFn,
  onServerData,
  staleTime,
  enabled = true,
  ...options
}) {
  const isOnline = useNetworkStatus();

  const rqResult = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await queryFn();
      if (onServerData) await onServerData(data);
      return data;
    },
    staleTime: staleTime ?? 5 * 60 * 1000,
    enabled: isOnline && enabled,
    retry: (failureCount, error) => {
      if (error?.isOffline || error?.isNetworkError) return false;
      return failureCount < 2;
    },
    networkMode: 'offlineFirst',
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    ...options,
  });

  const offlineData = useLiveQuery(
    () => (!isOnline && enabled && offlineFn ? offlineFn() : undefined),
    [isOnline, enabled, ...queryKey]
  );

  if (!isOnline && offlineFn) {
    return {
      data: offlineData,
      isLoading: offlineData === undefined,
      isError: false,
      error: null,
      isOffline: true,
      refetch: () => {},
    };
  }

  return {
    ...rqResult,
    isOffline: false,
  };
}
