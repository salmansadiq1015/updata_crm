import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { leadQualityApi } from '../services/lead-quality-api';
import type { FieldSelections, LeadScoringConfigInput } from '../types/lead-quality-types';

export const leadQualityKeys = {
  root: ['lead-quality'] as const,
  score: (leadId: string | null) => [...leadQualityKeys.root, 'score', leadId] as const,
  scoringConfig: () => [...leadQualityKeys.root, 'scoring-config'] as const,
  duplicates: (minConfidence: number) => [...leadQualityKeys.root, 'duplicates', minConfidence] as const,
  mergePreview: (survivorId: string | null, loserId: string | null) => [...leadQualityKeys.root, 'merge-preview', survivorId, loserId] as const,
  merges: () => [...leadQualityKeys.root, 'merges'] as const,
};

// The leads list/detail caches live under ['leads', …] (use-leads.ts).
const LEADS_ROOT = ['leads'];

export function useLeadScore(leadId: string | null) {
  return useQuery({
    queryKey: leadQualityKeys.score(leadId),
    queryFn: () => leadQualityApi.getScore(leadId ?? ''),
    enabled: Boolean(leadId),
    staleTime: 30_000,
  });
}

export function useRecalculateLeadScore(leadId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => leadQualityApi.recalculateScore(leadId ?? ''),
    onSuccess: (data) => {
      qc.setQueryData(leadQualityKeys.score(leadId), data);
      qc.invalidateQueries({ queryKey: LEADS_ROOT });
    },
  });
}

export function useScoringConfig(enabled = true) {
  return useQuery({
    queryKey: leadQualityKeys.scoringConfig(),
    queryFn: () => leadQualityApi.getScoringConfig(),
    enabled,
  });
}

export function useSaveScoringConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LeadScoringConfigInput) => leadQualityApi.saveScoringConfig(input),
    onSuccess: (data) => {
      qc.setQueryData(leadQualityKeys.scoringConfig(), data);
      qc.invalidateQueries({ queryKey: [...leadQualityKeys.root, 'score'] });
    },
  });
}

export function useScoringPreview() {
  return useMutation({
    mutationFn: ({ leadId, config }: { leadId: string; config: LeadScoringConfigInput }) => leadQualityApi.previewScoringConfig(leadId, config),
  });
}

export function useDuplicateGroups(minConfidence = 0) {
  return useQuery({
    queryKey: leadQualityKeys.duplicates(minConfidence),
    queryFn: () => leadQualityApi.listDuplicates({ minConfidence, limit: 100 }),
    staleTime: 15_000,
  });
}

export function useScanDuplicates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => leadQualityApi.scanDuplicates(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...leadQualityKeys.root, 'duplicates'] }),
  });
}

export function useDismissDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ candidateIds, reason }: { candidateIds: string[]; reason?: string }) => {
      for (const id of candidateIds) await leadQualityApi.dismissDuplicate(id, reason);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...leadQualityKeys.root, 'duplicates'] }),
  });
}

export function useMergePreview(survivorId: string | null, loserId: string | null) {
  return useQuery({
    queryKey: leadQualityKeys.mergePreview(survivorId, loserId),
    queryFn: () => leadQualityApi.previewMerge(survivorId ?? '', loserId ?? ''),
    enabled: Boolean(survivorId && loserId && survivorId !== loserId),
    staleTime: 0,
  });
}

function useInvalidateAfterMerge() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: leadQualityKeys.root });
    qc.invalidateQueries({ queryKey: LEADS_ROOT });
  };
}

export function useMergeLeads() {
  const invalidate = useInvalidateAfterMerge();
  return useMutation({
    mutationFn: (input: { survivorId: string; loserId: string; candidateId?: string | null; fieldSelections: FieldSelections }) => leadQualityApi.merge(input),
    onSettled: invalidate,
  });
}

export function useLeadMerges() {
  return useInfiniteQuery({
    queryKey: leadQualityKeys.merges(),
    queryFn: ({ pageParam }) => leadQualityApi.listMerges({ limit: 20, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useUndoMerge() {
  const invalidate = useInvalidateAfterMerge();
  return useMutation({ mutationFn: (mergeId: string) => leadQualityApi.undoMerge(mergeId), onSettled: invalidate });
}

export function useResumeMerge() {
  const invalidate = useInvalidateAfterMerge();
  return useMutation({ mutationFn: (mergeId: string) => leadQualityApi.resumeMerge(mergeId), onSettled: invalidate });
}
