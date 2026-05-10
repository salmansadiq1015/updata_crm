import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { ighService } from '../services/igh-service';

export function useIghConfig() {
  return useQuery({
    queryKey: queryKeys.catalog.ighConfig(),
    queryFn: () => ighService.getConfig().then((r) => r.data ?? r),
    staleTime: 5 * 60_000,
  });
}

export function useIghImportHistory() {
  return useQuery({
    queryKey: queryKeys.catalog.ighImportHistory(),
    queryFn: () => ighService.getImportHistory().then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    staleTime: 30_000,
  });
}

export function useIghImportJob(jobId) {
  return useQuery({
    queryKey: queryKeys.catalog.ighImportDetail(jobId),
    queryFn: () => ighService.getImportJob(jobId).then((r) => r.data ?? r),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'RUNNING' || status === 'PENDING' ? 3000 : false;
    },
  });
}
