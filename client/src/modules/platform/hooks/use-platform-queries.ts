import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { platformService } from '../services/platform-service';
import { healthService } from '../services/health-service';

export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.platform.health(),
    queryFn: () => healthService.getStatus(),
    refetchInterval: 30_000, // Auto-refresh every 30s
  });
}

export function useSystemJobs(params?: { queue?: string; status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.platform.jobs(params),
    queryFn: () => platformService.getJobs(params),
    refetchInterval: 10_000, // Auto-refresh every 10s
  });
}

export function useSystemFiles(params?: { bucket?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.platform.files(params),
    queryFn: () => platformService.getFiles(params),
  });
}
