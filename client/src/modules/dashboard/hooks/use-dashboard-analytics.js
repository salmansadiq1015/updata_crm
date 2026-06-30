'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/modules/dashboard/services/dashboard-service';
import { queryKeys } from '@/lib/query/keys';

const RANGE_GRANULARITY_DEFAULTS = Object.freeze({
  '7d': 'day',
  '30d': 'day',
  '90d': 'week',
  '12m': 'month',
});

export function getDefaultGranularity(range) {
  return RANGE_GRANULARITY_DEFAULTS[range] || 'day';
}

export function useDashboardAnalytics(filters) {
  const stableFilters = useMemo(
    () => ({
      range: filters?.range || '30d',
      granularity: filters?.granularity || getDefaultGranularity(filters?.range || '30d'),
    }),
    [filters?.granularity, filters?.range],
  );

  return useQuery({
    queryKey: queryKeys.dashboard.analytics(stableFilters),
    queryFn: () => dashboardService.getAnalytics(stableFilters),
    staleTime: 60_000,
    refetchInterval: 120_000,
    placeholderData: (previous) => previous,
  });
}
