'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { attributionApi } from '../services/attribution-api';
import type { AttributionParams } from '../types/attribution-types';

export const attributionKeys = {
  report: (params: AttributionParams) => ['analytics', 'attribution', params] as const,
};

export function useAttributionReport(params: AttributionParams) {
  return useQuery({
    queryKey: attributionKeys.report(params),
    queryFn: () => attributionApi.report(params),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
