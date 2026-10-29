'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError } from '@/lib/toast';
import { governanceApi } from '../services/governance-api';
import type { AccessLogFilters, RevealField, RevealPurpose, TeamInput } from '../types/governance-types';

export const governanceKeys = {
  all: ['governance'] as const,
  settings: () => ['governance', 'settings'] as const,
  teams: (includeInactive = false) => ['governance', 'teams', { includeInactive }] as const,
  accessLog: (filters: AccessLogFilters) => ['governance', 'access-log', filters] as const,
  leadAccessLog: (leadId: string) => ['governance', 'lead-access-log', leadId] as const,
};

export function useGovernanceSettings(enabled = true) {
  return useQuery({ queryKey: governanceKeys.settings(), queryFn: () => governanceApi.settings(), staleTime: 300_000, enabled });
}

export function useTeams(includeInactive = false) {
  return useQuery({ queryKey: governanceKeys.teams(includeInactive), queryFn: () => governanceApi.listTeams({ includeInactive }) });
}

export function useSaveTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: TeamInput }) => (id ? governanceApi.updateTeam(id, input) : governanceApi.createTeam(input)),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['governance', 'teams'] }); },
    onError: (error) => showError(error),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => governanceApi.deleteTeam(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['governance', 'teams'] }); },
    onError: (error) => showError(error),
  });
}

/** Break-glass: state a reason, then refetch everything about that lead. */
export function useCreateAccessGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ leadId, reason }: { leadId: string; reason: string }) => governanceApi.createGrant(leadId, reason),
    onSuccess: (_grant, { leadId }) => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: governanceKeys.leadAccessLog(leadId) });
    },
  });
}

export function useRevealContact() {
  return useMutation({
    mutationFn: ({ leadId, purpose, fields }: { leadId: string; purpose: RevealPurpose; fields?: RevealField[] }) =>
      governanceApi.reveal(leadId, purpose, fields),
    onError: (error) => showError(error),
  });
}

export function useAccessLog(filters: AccessLogFilters) {
  return useInfiniteQuery({
    queryKey: governanceKeys.accessLog(filters),
    queryFn: ({ pageParam }) => governanceApi.accessLog({ ...filters, cursor: pageParam, limit: 50 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.pagination.hasNext ? last.pagination.nextCursor : undefined),
  });
}

export function useLeadAccessLog(leadId: string | null, enabled = true) {
  return useQuery({
    queryKey: governanceKeys.leadAccessLog(leadId ?? ''),
    queryFn: () => governanceApi.leadAccessLog(leadId as string),
    enabled: Boolean(leadId) && enabled,
  });
}
