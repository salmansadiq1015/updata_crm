'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { deployDashboardService } from '../services/dashboard-service';

export function useDashboardSummary(date) {
  return useQuery({
    queryKey: queryKeys.deploy.dashboard.summary(date),
    queryFn: () => deployDashboardService.getSummary(date ? { date } : {}),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useDashboardUtilization(params = {}) {
  return useQuery({
    queryKey: queryKeys.deploy.dashboard.utilization(params),
    queryFn: () => deployDashboardService.getUtilization(params),
    staleTime: 30_000,
  });
}

export function useDashboardAlerts() {
  return useQuery({
    queryKey: queryKeys.deploy.dashboard.alerts(),
    queryFn: () => deployDashboardService.getAlerts(),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
