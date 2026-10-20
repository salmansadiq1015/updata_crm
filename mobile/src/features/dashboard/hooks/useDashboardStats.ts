import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/queryKeys';

import { dashboardApi } from '../api/dashboardApi';

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: ({ signal }) => dashboardApi.stats(signal),
    // The server caches these counts for 30-60 s; refetching sooner gains nothing.
    staleTime: 60_000,
  });
}

export function useMobileCrmStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.mobileCrm,
    queryFn: ({ signal }) => dashboardApi.mobileCrm(signal),
    staleTime: 60_000,
  });
}
