import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/queryKeys';
import { i18next } from '@/i18n';
import { showApiErrorToast, showSuccessToast } from '@/utils/toast';

import { leadsApi } from '../api/leadsApi';
import type { AssignableLeadStatus, BulkLeadResult, Lead, LeadListFilters } from '../types';
import type { LeadCreateInput, LeadPatch } from '../utils/leadForm';

const RECENT_LEADS_LIMIT = 5;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export function isLeadId(value: unknown): value is string {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

export function useLeadList(filters: LeadListFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.leads.list(filters),
    // A new filter aborts the previous request through the signal.
    queryFn: ({ pageParam, signal }) => leadsApi.list(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.pagination.hasNext ? (last.pagination.nextCursor ?? undefined) : undefined,
  });
}

export function useRecentLeads() {
  return useQuery({
    queryKey: queryKeys.leads.recent,
    queryFn: async ({ signal }) => (await leadsApi.list({}, undefined, signal, RECENT_LEADS_LIMIT)).items,
  });
}

export function useLeadDirectory(enabled = true) {
  return useQuery({
    queryKey: queryKeys.leads.directory,
    queryFn: ({ signal }) => leadsApi.directory(signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** `id` comes from navigation (possibly a deep link): malformed ids never reach the API. */
export function useLead(id: string) {
  return useQuery({
    queryKey: queryKeys.leads.detail(id),
    queryFn: ({ signal }) => leadsApi.get(id, signal),
    enabled: isLeadId(id),
  });
}

export function useUpdateLeadStatus(id: string) {
  const client = useQueryClient();
  return useMutation({
    // One in-flight update per lead: a second tap while pending is ignored by the UI
    // (the button is busy) and TanStack never retries a mutation.
    mutationKey: ['leads', 'update-status', id],
    mutationFn: (status: AssignableLeadStatus) => leadsApi.updateStatus(id, status),
    onSuccess: (lead: Lead) => {
      client.setQueryData(queryKeys.leads.detail(id), lead);
      // Lists may now sort or filter differently; the detail is already fresh.
      void client.invalidateQueries({ queryKey: queryKeys.leads.lists });
      void client.invalidateQueries({ queryKey: queryKeys.leads.recent });
      showSuccessToast(
        i18next.t('leads.statusUpdated', { status: i18next.t(`leads.status.${lead.status}`) }),
      );
    },
    onError: showApiErrorToast,
  });
}

function useInvalidateLeadLists() {
  const client = useQueryClient();
  return (lead: Lead) => {
    client.setQueryData(queryKeys.leads.detail(lead.id), lead);
    void client.invalidateQueries({ queryKey: queryKeys.leads.lists });
    void client.invalidateQueries({ queryKey: queryKeys.leads.recent });
    // The agenda shows lead names.
    void client.invalidateQueries({ queryKey: queryKeys.followUps.all });
  };
}

/** Create a lead. Errors are left to the form (field errors), not toasted here. */
export function useCreateLead() {
  const refresh = useInvalidateLeadLists();
  return useMutation({
    mutationKey: ['leads', 'create'],
    mutationFn: (input: LeadCreateInput) => leadsApi.create(input),
    onSuccess: ({ lead }) => refresh(lead),
  });
}

export function useUpdateLead(id: string) {
  const refresh = useInvalidateLeadLists();
  return useMutation({
    mutationKey: ['leads', 'update', id],
    mutationFn: (patch: LeadPatch) => leadsApi.update(id, patch),
    onSuccess: refresh,
  });
}

function useBulkLeadMutation<TInput>(
  mutationKey: readonly unknown[],
  mutationFn: (input: TInput) => Promise<BulkLeadResult>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey,
    mutationFn,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.leads.lists });
      void client.invalidateQueries({ queryKey: queryKeys.leads.recent });
      void client.invalidateQueries({ queryKey: queryKeys.followUps.all });
    },
  });
}

export function useBulkDeleteLeads() {
  return useBulkLeadMutation(['leads', 'bulk-delete'], (ids: string[]) => leadsApi.bulkDelete(ids));
}

export function useBulkAssignLeads() {
  return useBulkLeadMutation(
    ['leads', 'bulk-assign'],
    ({ ids, assignedTo }: { ids: string[]; assignedTo: string | null }) =>
      leadsApi.bulkAssign(ids, assignedTo),
  );
}

export function useBulkUpdateLeadStatus() {
  return useBulkLeadMutation(
    ['leads', 'bulk-status'],
    ({ ids, status }: { ids: string[]; status: AssignableLeadStatus }) =>
      leadsApi.bulkUpdateStatus(ids, status),
  );
}
