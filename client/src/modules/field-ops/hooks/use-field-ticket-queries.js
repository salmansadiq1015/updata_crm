'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { fieldTicketService } from '@/modules/field-ops/services/field-ticket-service';

export function useFieldTickets(filters = {}) {
  return useQuery({
    queryKey: queryKeys.fieldTickets.list(filters),
    queryFn: () => fieldTicketService.list(filters),
    staleTime: 30_000,
  });
}

export function useFieldTicketDetail(id) {
  return useQuery({
    queryKey: queryKeys.fieldTickets.detail(id),
    queryFn: () => fieldTicketService.getById(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}
