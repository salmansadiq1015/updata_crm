'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { timeTrackingService } from '@/modules/field-ops/services/time-tracking-service';

export function useTimeTrackingOverview(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.timeTracking.overview(filters),
    queryFn: () => timeTrackingService.getOverview(filters),
    staleTime: 30_000,
    ...options,
  });
}

export function useTimeTrackingLeaveRequests(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.timeTracking.leaveRequests(filters),
    queryFn: () => timeTrackingService.getLeaveRequests(filters),
    staleTime: 30_000,
    ...options,
  });
}

export function useTimeTrackingVacationBalances(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.timeTracking.balances(filters),
    queryFn: () => timeTrackingService.getVacationBalances(filters),
    staleTime: 60_000,
    ...options,
  });
}

export function useTimeTrackingCalendar(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.timeTracking.calendar(filters),
    queryFn: () => timeTrackingService.getCalendar(filters),
    staleTime: 30_000,
    ...options,
  });
}

export function useTimeTrackingAnalytics(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.timeTracking.analytics(filters),
    queryFn: () => timeTrackingService.getAnalytics(filters),
    staleTime: 30_000,
    ...options,
  });
}

export function useTimeTrackingAiContext(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.timeTracking.aiContext(filters),
    queryFn: () => timeTrackingService.getAiContext(filters),
    staleTime: 30_000,
    ...options,
  });
}
