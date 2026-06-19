'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { fieldTicketService } from '@/modules/field-ops/services/field-ticket-service';

function invalidateTickets(queryClient, id) {
  queryClient.invalidateQueries({ queryKey: queryKeys.fieldTickets.all() });
  queryClient.invalidateQueries({ queryKey: queryKeys.mobile.tickets.list({}) });
  if (id) queryClient.invalidateQueries({ queryKey: queryKeys.fieldTickets.detail(id) });
}

export function useFieldTicketMutations() {
  const queryClient = useQueryClient();

  const createTicket = useMutation({
    mutationFn: (data) => fieldTicketService.create(data),
    onSuccess: () => invalidateTickets(queryClient),
  });

  const updateTicket = useMutation({
    mutationFn: ({ id, data }) => fieldTicketService.update(id, data),
    onSuccess: (_data, vars) => invalidateTickets(queryClient, vars.id),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, status }) => fieldTicketService.changeStatus(id, status),
    onSuccess: (_data, vars) => invalidateTickets(queryClient, vars.id),
  });

  const assignTicket = useMutation({
    mutationFn: ({ id, data }) => fieldTicketService.assign(id, data),
    onSuccess: (_data, vars) => invalidateTickets(queryClient, vars.id),
  });

  const addComment = useMutation({
    mutationFn: ({ id, data }) => fieldTicketService.addComment(id, data),
    onSuccess: (_data, vars) => invalidateTickets(queryClient, vars.id),
  });

  const addAttachment = useMutation({
    mutationFn: ({ id, data }) => fieldTicketService.addAttachment(id, data),
    onSuccess: (_data, vars) => invalidateTickets(queryClient, vars.id),
  });

  const analyzeTicket = useMutation({
    mutationFn: (id) => fieldTicketService.analyze(id),
    onSuccess: (_data, id) => invalidateTickets(queryClient, id),
  });

  return {
    createTicket,
    updateTicket,
    changeStatus,
    assignTicket,
    addComment,
    addAttachment,
    analyzeTicket,
  };
}
