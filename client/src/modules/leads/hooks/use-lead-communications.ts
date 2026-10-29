import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { leadCommunicationApi } from '../services/lead-communication-api';

export const leadCommunicationKeys = {
  root: ['lead-communications'] as const,
  list: (leadId: string | null) => [...leadCommunicationKeys.root, 'list', leadId] as const,
  qualification: (leadId: string | null) => [...leadCommunicationKeys.root, 'qualification', leadId] as const,
};

/** Mobile SIM calls / SMS for a lead, newest first, cursor-paginated. */
export function useLeadCommunications(leadId: string | null) {
  return useInfiniteQuery({
    queryKey: leadCommunicationKeys.list(leadId),
    queryFn: ({ pageParam }) => leadCommunicationApi.list(leadId ?? '', pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.pagination.hasNext ? lastPage.pagination.nextCursor : undefined),
    enabled: Boolean(leadId),
    staleTime: 20_000,
  });
}

/** The qualification schema plus the lead's merged qualification fields. */
export function useLeadQualification(leadId: string | null) {
  return useQuery({
    queryKey: leadCommunicationKeys.qualification(leadId),
    queryFn: () => leadCommunicationApi.getQualification(leadId ?? ''),
    enabled: Boolean(leadId),
    staleTime: 20_000,
  });
}

export function useLeadQualificationHistory(leadId: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...leadCommunicationKeys.qualification(leadId), 'history'],
    queryFn: ({ pageParam }) => leadCommunicationApi.getQualificationHistory(leadId ?? '', pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.hasNext ? lastPage.nextOffset : undefined,
    enabled: Boolean(leadId) && enabled,
  });
}
