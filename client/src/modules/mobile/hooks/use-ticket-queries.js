'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { ticketService } from '@/modules/mobile/services/ticket-service';

export function useTickets(filters = {}) {
  return useQuery({
    queryKey: queryKeys.mobile.tickets.list(filters),
    queryFn: () => ticketService.list(filters),
    staleTime: 30_000,
  });
}

export function useTicketDetail(id) {
  return useQuery({
    queryKey: queryKeys.mobile.tickets.detail(id),
    queryFn: () => ticketService.getById(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useTicketMutations() {
  const queryClient = useQueryClient();
  const invalidate = (id) => {
    queryClient.invalidateQueries({ queryKey: ['mobile', 'tickets'] });
    queryClient.invalidateQueries({ queryKey: ['fieldTickets'] });
    if (id) queryClient.invalidateQueries({ queryKey: queryKeys.mobile.tickets.detail(id) });
  };

  const createTicket = useMutation({
    mutationFn: (data) => ticketService.create(data),
    onSuccess: () => invalidate(),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }) => ticketService.changeStatus(id, status),
    onSuccess: (_data, vars) => invalidate(vars.id),
  });

  const addComment = useMutation({
    mutationFn: ({ id, data }) => ticketService.addComment(id, data),
    onSuccess: (_data, vars) => invalidate(vars.id),
  });

  return { createTicket, changeStatus, addComment };
}
