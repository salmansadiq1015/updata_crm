'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callingIntelligenceApi as api } from '../services/calling-intelligence-api';
import type { KnowledgeContent } from '../types/calling-intelligence-types';

const keys = {
  review: (category?: string, page = 1) => ['ai-calling', 'intelligence-review', category || 'all', page] as const,
  knowledge: (filters: object) => ['ai-calling', 'knowledge', filters] as const,
  versions: ['ai-calling', 'knowledge-versions'] as const,
  version: (id: string) => ['ai-calling', 'knowledge-version', id] as const,
  diff: (id: string, from?: string) => ['ai-calling', 'knowledge-diff', id, from || ''] as const,
  presence: ['ai-calling', 'transfer-presence'] as const,
  targets: ['ai-calling', 'transfer-targets'] as const,
};

export function useReviewQueue(category?: string, page = 1) {
  return useQuery({ queryKey: keys.review(category, page), queryFn: () => api.reviewQueue({ category, page }) });
}

/** accept / edit / reject an extracted item; refreshes the call and the queue. */
export function useDecideItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, itemId, ...body }: { recordId: string; itemId: string; decision: 'accept' | 'edit' | 'reject'; value?: string; normalized?: string | number | null; note?: string }) => api.decide(recordId, itemId, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['ai-calling', 'intelligence-review'] });
      qc.invalidateQueries({ queryKey: ['ai-calling', 'call', vars.recordId] });
    },
  });
}

export function useRerunIntelligence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => api.rerun(recordId),
    onSuccess: (_d, recordId) => { qc.invalidateQueries({ queryKey: ['ai-calling', 'call', recordId] }); qc.invalidateQueries({ queryKey: ['ai-calling', 'intelligence-review'] }); },
  });
}

export function useKnowledge(filters: { status?: string; type?: string; search?: string } = {}) {
  return useQuery({ queryKey: keys.knowledge(filters), queryFn: () => api.knowledge(filters) });
}
export function useKnowledgeVersions() {
  return useQuery({ queryKey: keys.versions, queryFn: () => api.versions() });
}
export function useKnowledgeDiff(id: string | null, from?: string) {
  return useQuery({ queryKey: keys.diff(id || '', from), queryFn: () => api.diff(id as string, from), enabled: Boolean(id) });
}
export function useKnowledgeVersion(id: string | null) {
  return useQuery({ queryKey: keys.version(id || ''), queryFn: () => api.version(id as string), enabled: Boolean(id) });
}

export function useKnowledgeMutations() {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ['ai-calling', 'knowledge'] }); qc.invalidateQueries({ queryKey: keys.versions }); };
  return {
    create: useMutation({ mutationFn: (input: KnowledgeContent) => api.createEntry(input), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, ...input }: Partial<KnowledgeContent> & { id: string; revision: number }) => api.updateEntry(id, input), onSuccess: refresh }),
    action: useMutation({ mutationFn: ({ id, action, body }: { id: string; action: 'submit' | 'approve' | 'reject' | 'archive' | 'restore'; body?: Record<string, unknown> }) => api.entryAction(id, action, body), onSuccess: refresh }),
    publish: useMutation({ mutationFn: (note: string) => api.publish(note), onSuccess: refresh }),
    rollback: useMutation({ mutationFn: ({ id, note }: { id: string; note?: string }) => api.rollback(id, note), onSuccess: refresh }),
  };
}

export function useAgentIntelligenceSettings(agentId: string) {
  const qc = useQueryClient();
  const refresh = () => { qc.invalidateQueries({ queryKey: ['ai-calling', 'agent'] }); qc.invalidateQueries({ queryKey: ['ai-calling', 'agents'] }); };
  return {
    knowledge: useMutation({ mutationFn: (body: { mode: 'latest' | 'pinned' | 'none'; versionId?: string | null; version?: number }) => api.setAgentKnowledge(agentId, body), onSuccess: refresh }),
    transfer: useMutation({ mutationFn: (body: { enabled: boolean; targetUserIds: string[]; timeoutSeconds: number; allowPhoneTransfer: boolean; version?: number }) => api.setAgentTransfer(agentId, body), onSuccess: refresh }),
  };
}

export function useTransferPresence() {
  return useQuery({ queryKey: keys.presence, queryFn: () => api.presence(), refetchInterval: 60_000 });
}
export function useSetTransferPresence() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.setPresence, onSuccess: data => { qc.setQueryData(keys.presence, data); qc.invalidateQueries({ queryKey: keys.targets }); } });
}
export function useTransferTargets(enabled = true) {
  return useQuery({ queryKey: keys.targets, queryFn: () => api.targets(), enabled });
}
