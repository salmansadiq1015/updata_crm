// Device health (from the latest heartbeat answer) and SMS callback requests.
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { queryKeys } from '@/constants/queryKeys';

import { simSmsApi } from '../api/simSmsApi';
import { deviceHeartbeat } from '../services/heartbeatService';
import type { HeartbeatResponse } from '../types';
import { isPrivateBuild } from './useSmsAgent';

export function useSmsCallbacks() {
  return useQuery({
    queryKey: queryKeys.smsAgent.callbacks,
    queryFn: ({ signal }) => simSmsApi.callbacks(signal),
    enabled: isPrivateBuild(),
    refetchInterval: 60_000,
  });
}

/** The CRM's view of this phone, as returned by the last heartbeat (null until one answered). */
export function useDeviceHealth(): HeartbeatResponse | null {
  return useSyncExternalStore(
    (onChange) => deviceHeartbeat.subscribe(onChange),
    () => deviceHeartbeat.getLatest(),
    () => null,
  );
}
