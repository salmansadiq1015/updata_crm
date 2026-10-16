import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys } from '@/constants/queryKeys';
import { telephony } from '@/services/telephony/telephonyService';

import { communicationApi } from '../api/communicationApi';
import type { LocalOperation } from '../domain/operations';
import { useOperationsStore } from '../store/operationsStore';
import type { Channel, DestinationField } from '../types';

/** Device capabilities change with permissions and SIM state: re-read on focus/refetch. */
export function useTelephonyCapabilities() {
  return useQuery({
    queryKey: queryKeys.communication.capabilities,
    queryFn: () => telephony.getCapabilities(),
    staleTime: 0,
    retry: false,
  });
}

export function useActiveSims(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.communication.sims,
    queryFn: () => telephony.getActiveSims(),
    enabled,
    staleTime: 0,
    retry: false,
  });
}

export function useEligibility(
  leadId: string,
  channel: Channel,
  destinationField: DestinationField,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.communication.eligibility(leadId, channel, destinationField),
    queryFn: ({ signal }) => communicationApi.eligibility(leadId, channel, destinationField, signal),
    enabled,
    // Eligibility is re-checked by the server at dispatch anyway; this is only a preview.
    staleTime: 0,
  });
}

export function useCommunicationHistory(leadId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.communication.history(leadId),
    queryFn: ({ pageParam, signal }) => communicationApi.list(leadId, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.pagination.hasNext ? (last.pagination.nextCursor ?? undefined) : undefined,
  });
}

export function useQualification(leadId: string) {
  return useQuery({
    queryKey: queryKeys.communication.qualification(leadId),
    queryFn: ({ signal }) => communicationApi.qualification(leadId, signal),
    staleTime: 5 * 60_000,
  });
}

export function useProposeQualification(leadId: string) {
  return useMutation({
    mutationKey: ['communication', 'propose', leadId],
    mutationFn: ({ notes, language }: { notes: string; language: string }) =>
      communicationApi.propose(leadId, notes, language),
  });
}

export function useSmsTemplates() {
  return useQuery({
    queryKey: queryKeys.communication.smsTemplates,
    queryFn: ({ signal }) => communicationApi.smsTemplates(signal),
    staleTime: 5 * 60_000,
  });
}

export function useInvalidateLeadCommunication() {
  const client = useQueryClient();
  return (leadId: string) => {
    void client.invalidateQueries({ queryKey: queryKeys.communication.history(leadId) });
    void client.invalidateQueries({ queryKey: queryKeys.communication.qualification(leadId) });
  };
}

export function useOperation(operationId: string): LocalOperation | null {
  return useOperationsStore((state) => state.operations[operationId] ?? null);
}

/** Local operations for one lead that still need the user or the outbox. */
export function useOpenLeadOperations(leadId: string): LocalOperation[] {
  const operations = useOperationsStore((state) => state.operations);
  return useMemo(
    () =>
      Object.values(operations)
        .filter((op) => op.leadId === leadId && op.phase !== 'done' && op.phase !== 'abandoned')
        .sort((a, b) => b.createdAt - a.createdAt),
    [operations, leadId],
  );
}

export function useAllOperations(): LocalOperation[] {
  const operations = useOperationsStore((state) => state.operations);
  return useMemo(() => Object.values(operations).sort((a, b) => b.createdAt - a.createdAt), [operations]);
}
