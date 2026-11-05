'use client';

import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { getSocket, onSocketConnect } from '@/lib/socket/client';
import { leadWorkflowApi } from '../services/lead-workflow-api';
import { leadCommunicationKeys } from './use-lead-communications';
import type {
  AnswerCorrectionInput,
  AssignmentPolicy,
  CreateFollowUpInput,
  FollowUp,
  FollowUpAiAction,
  FollowUpListParams,
  TimelineFilters,
} from '../types/lead-workflow-types';

export const leadWorkflowKeys = {
  root: ['lead-workflow'] as const,
  timeline: (leadId: string | null, filters: TimelineFilters) => [...leadWorkflowKeys.root, 'timeline', leadId, filters] as const,
  timelineRoot: (leadId: string | null) => [...leadWorkflowKeys.root, 'timeline', leadId] as const,
  transcript: (leadId: string, callId: string) => [...leadWorkflowKeys.root, 'transcript', leadId, callId] as const,
  fieldHistory: (leadId: string, fieldKey: string) => [...leadWorkflowKeys.root, 'field-history', leadId, fieldKey] as const,
  followUps: ['lead-follow-ups'] as const,
  followUpList: (params: FollowUpListParams) => ['lead-follow-ups', 'list', params] as const,
  followUpSummary: (scope: string, tz: string) => ['lead-follow-ups', 'summary', scope, tz] as const,
  followUpDetail: (id: string | null) => ['lead-follow-ups', 'detail', id] as const,
  // Outside the realtime-invalidated roots: agents / the org switch don't change per follow-up event.
  followUpAgents: ['lead-follow-up-ai', 'agents'] as const,
  followUpAutomationSettings: ['lead-follow-up-ai', 'settings'] as const,
  policy: [...['lead-workflow'], 'policy'] as const,
};

/** The browser's IANA timezone (falls back to UTC). */
export function viewerTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function useLeadTimeline(leadId: string | null, filters: TimelineFilters = {}) {
  return useInfiniteQuery({
    queryKey: leadWorkflowKeys.timeline(leadId, filters),
    queryFn: ({ pageParam }) => leadWorkflowApi.timeline(leadId ?? '', pageParam, filters),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.pagination.hasNext ? last.pagination.nextCursor : undefined),
    enabled: Boolean(leadId),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useCallTranscript(leadId: string, callId: string | null) {
  return useQuery({
    queryKey: leadWorkflowKeys.transcript(leadId, callId ?? ''),
    queryFn: () => leadWorkflowApi.transcript(leadId, callId ?? ''),
    enabled: Boolean(leadId && callId),
    staleTime: 60_000,
    retry: false,
  });
}

export function useFieldHistory(leadId: string, fieldKey: string, enabled: boolean) {
  return useQuery({
    queryKey: leadWorkflowKeys.fieldHistory(leadId, fieldKey),
    queryFn: () => leadWorkflowApi.fieldHistory(leadId, fieldKey),
    enabled: enabled && Boolean(leadId),
    staleTime: 10_000,
  });
}

export function useCorrectAnswer(leadId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AnswerCorrectionInput) => leadWorkflowApi.correct(leadId, input),
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: leadWorkflowKeys.fieldHistory(leadId, input.fieldKey) });
      void qc.invalidateQueries({ queryKey: leadCommunicationKeys.qualification(leadId) });
      void qc.invalidateQueries({ queryKey: leadWorkflowKeys.timelineRoot(leadId) });
    },
  });
}

export function useFollowUps(params: FollowUpListParams) {
  return useInfiniteQuery({
    queryKey: leadWorkflowKeys.followUpList(params),
    queryFn: ({ pageParam }) => leadWorkflowApi.followUps(params, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.pagination.hasNext ? last.pagination.nextCursor : undefined),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useFollowUpSummary(scope: string, tz: string) {
  return useQuery({
    queryKey: leadWorkflowKeys.followUpSummary(scope, tz),
    queryFn: () => leadWorkflowApi.followUpSummary(scope, tz),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

type FollowUpAction =
  | { id: string; action: 'complete'; body: { note?: string | null } }
  | { id: string; action: 'snooze'; body: { until: string } }
  | { id: string; action: 'reassign'; body: { ownerId: string } }
  | { id: string; action: 'cancel'; body: { reason: string } };

export function useFollowUpAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: FollowUpAction) => leadWorkflowApi.followUpAction(id, action, body),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: leadWorkflowKeys.followUps });
      void qc.invalidateQueries({ queryKey: [...leadWorkflowKeys.root, 'timeline'] });
    },
  });
}

/** One follow-up, seeded from the list row so the detail panel renders instantly and stays live. */
export function useFollowUp(id: string | null, initial?: FollowUp | null) {
  return useQuery({
    queryKey: leadWorkflowKeys.followUpDetail(id),
    queryFn: () => leadWorkflowApi.followUp(id ?? ''),
    enabled: Boolean(id),
    initialData: initial ?? undefined,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

/** Assign / change the AI agent, call now, pause, resume, hand to a person. */
export function useFollowUpAiAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FollowUpAiAction) => leadWorkflowApi.followUpAiAction(input),
    onSuccess: (data, input) => { if (data) qc.setQueryData(leadWorkflowKeys.followUpDetail(input.id), data); },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: leadWorkflowKeys.followUps });
      void qc.invalidateQueries({ queryKey: [...leadWorkflowKeys.root, 'timeline'] });
    },
  });
}

/** Outbound AI agents a follow-up can be handed to (needs ai-calling:read). */
export function useFollowUpAgents(enabled: boolean) {
  return useQuery({
    queryKey: leadWorkflowKeys.followUpAgents,
    queryFn: () => leadWorkflowApi.followUpAgents(),
    enabled,
    staleTime: 60_000,
  });
}

/** Organisation switch for automatic AI follow-up calls (needs ai-calling:read). */
export function useFollowUpAutomationSettings(enabled: boolean) {
  return useQuery({
    queryKey: leadWorkflowKeys.followUpAutomationSettings,
    queryFn: () => leadWorkflowApi.followUpAutomationSettings(),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useCreateFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFollowUpInput) => leadWorkflowApi.createFollowUp(input),
    onSuccess: (_d, input) => {
      void qc.invalidateQueries({ queryKey: leadWorkflowKeys.followUps });
      void qc.invalidateQueries({ queryKey: leadWorkflowKeys.timelineRoot(input.leadId) });
    },
  });
}

export function useAssignmentPolicy(enabled: boolean) {
  return useQuery({ queryKey: leadWorkflowKeys.policy, queryFn: () => leadWorkflowApi.policy(), enabled, staleTime: 30_000 });
}

export function useSaveAssignmentPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AssignmentPolicy>) => leadWorkflowApi.savePolicy(input),
    onSuccess: (data) => qc.setQueryData(leadWorkflowKeys.policy, data),
  });
}

/**
 * Realtime refresh: the server emits `lead:follow-up` (inbox changes, overdue
 * alerts, AI follow-up `{ type: 'automation' }` state changes, evaluated calls)
 * and `lead:sla` (breach / escalation / response) to the user's room. Every
 * `lead:follow-up` payload refreshes the list, summary and open detail panel.
 */
export function useLeadWorkflowRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const onFollowUp = () => {
      void qc.invalidateQueries({ queryKey: leadWorkflowKeys.followUps });
      void qc.invalidateQueries({ queryKey: leadWorkflowKeys.root });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    };
    const onSla = () => { void qc.invalidateQueries({ queryKey: ['leads'] }); };
    let current: Socket | null = null;
    const register = (socket: Socket | null) => {
      if (!socket || socket === current) return;
      current?.off('lead:follow-up', onFollowUp);
      current?.off('lead:sla', onSla);
      socket.on('lead:follow-up', onFollowUp);
      socket.on('lead:sla', onSla);
      current = socket;
    };
    register(getSocket() as Socket | null);
    const off = onSocketConnect((socket: Socket) => register(socket));
    return () => {
      current?.off('lead:follow-up', onFollowUp);
      current?.off('lead:sla', onSla);
      if (typeof off === 'function') off();
    };
  }, [qc]);
}
