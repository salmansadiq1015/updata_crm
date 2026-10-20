import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { queryKeys } from '@/constants/queryKeys';
import { i18next } from '@/i18n';
import { showApiErrorToast, showSuccessToast } from '@/utils/toast';

import { aiAgentApi, type SimulateInput } from '../api/aiAgentApi';
import {
  ACTIVE_CAMPAIGN_STATUSES,
  type AgentCampaignRow,
  type AgentChannel,
  type CallCampaign,
  type CallCampaignInput,
  type SmsCampaign,
  type SmsCampaignInput,
} from '../types';
import type { CampaignAction } from '../domain/agentDomain';

const POLL_MS = 5_000;
const pollWhileActive = (status: string | undefined) =>
  status && ACTIVE_CAMPAIGN_STATUSES.includes(status) ? POLL_MS : false;

/** Opens the AI agent flow for an explicit set of lead ids. */
export function useStartAiAgent() {
  const navigation = useNavigation();
  return useCallback(
    (leadIds: readonly string[]) => {
      const unique = [...new Set(leadIds)];
      if (unique.length > 0) navigation.navigate('AiAgentLaunch', { leadIds: unique });
    },
    [navigation],
  );
}

export function useAgentLanguages() {
  return useQuery({
    queryKey: queryKeys.aiAgent.languages,
    queryFn: ({ signal }) => aiAgentApi.languages(signal),
    staleTime: Infinity,
  });
}

/** Readiness must be fresh: never served from cache, never retried on 403. */
export function useTelephonyHealth(enabled = true) {
  return useQuery({
    queryKey: queryKeys.aiAgent.telephonyHealth,
    queryFn: ({ signal }) => aiAgentApi.telephonyHealth(signal),
    enabled,
    staleTime: 0,
    retry: false,
  });
}

export function useMessagingHealth(enabled = true) {
  return useQuery({
    queryKey: queryKeys.aiAgent.messagingHealth,
    queryFn: ({ signal }) => aiAgentApi.messagingHealth(signal),
    enabled,
    staleTime: 0,
    retry: false,
  });
}

export function useAgentSmsTemplates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.aiAgent.smsTemplates,
    queryFn: ({ signal }) => aiAgentApi.smsTemplates(signal),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** AI call + AI SMS campaigns, newest first. Polls only while one is active. */
export function useAgentCampaigns() {
  return useQuery({
    queryKey: queryKeys.aiAgent.campaigns,
    queryFn: async ({ signal }) => {
      // One module failing (e.g. a permission the user lacks) must not hide the other.
      const [callResult, smsResult] = await Promise.allSettled([
        aiAgentApi.listCallCampaigns(signal),
        aiAgentApi.listSmsCampaigns(signal),
      ]);
      if (callResult.status === 'rejected' && smsResult.status === 'rejected') throw callResult.reason;
      const calls = callResult.status === 'fulfilled' ? callResult.value : { items: [] };
      const sms = smsResult.status === 'fulfilled' ? smsResult.value : { items: [] };
      const rows: AgentCampaignRow[] = [
        ...calls.items.map((campaign) => ({ kind: 'call' as const, campaign })),
        ...sms.items.map((campaign) => ({ kind: 'sms' as const, campaign })),
      ];
      return rows.sort((a, b) => (b.campaign.createdAt ?? '').localeCompare(a.campaign.createdAt ?? ''));
    },
    refetchInterval: (query) =>
      query.state.data?.some((row) => ACTIVE_CAMPAIGN_STATUSES.includes(row.campaign.status))
        ? POLL_MS
        : false,
  });
}

export function useCallCampaign(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.aiAgent.campaign('call', id),
    queryFn: ({ signal }) => aiAgentApi.getCallCampaign(id, signal),
    enabled: enabled && Boolean(id),
    refetchInterval: (query) => pollWhileActive(query.state.data?.status),
  });
}

export function useSmsCampaign(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.aiAgent.campaign('sms', id),
    queryFn: ({ signal }) => aiAgentApi.getSmsCampaign(id, signal),
    enabled: enabled && Boolean(id),
    refetchInterval: (query) => pollWhileActive(query.state.data?.status),
  });
}

export function useCallRecipients(id: string, status: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.aiAgent.recipients('call', id),
    queryFn: ({ signal }) => aiAgentApi.callRecipients(id, signal),
    enabled: enabled && Boolean(id),
    refetchInterval: pollWhileActive(status),
  });
}

export function useAiCallHistory(leadId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.aiAgent.callHistory(leadId),
    queryFn: ({ pageParam, signal }) => aiAgentApi.callHistory(leadId, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: Boolean(leadId),
  });
}

export function useAiCall(id: string) {
  return useQuery({
    queryKey: queryKeys.aiAgent.call(id),
    queryFn: ({ signal }) => aiAgentApi.getCall(id, signal),
    enabled: Boolean(id),
  });
}

export function useCallAnalytics(from?: string, to?: string) {
  return useQuery({
    queryKey: queryKeys.aiAgent.analytics(from, to),
    queryFn: ({ signal }) => aiAgentApi.callAnalytics({ from, to }, signal),
  });
}

export function useSmsRecipients(id: string, status: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.aiAgent.recipients('sms', id),
    queryFn: ({ signal }) => aiAgentApi.smsRecipients(id, signal),
    enabled: enabled && Boolean(id),
    refetchInterval: pollWhileActive(status),
  });
}

/** Server preview of a draft call campaign (eligibility, estimate, live telephony state). */
export function useCallPreview(id: string | null) {
  return useQuery({
    queryKey: queryKeys.aiAgent.callPreview(id ?? ''),
    queryFn: () => aiAgentApi.previewCallCampaign(id!),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

/**
 * Draft creation. Calls: create once, then PATCH the same draft when the user
 * edits and reviews again. SMS (no PATCH on the server): cancel the stale draft
 * and create a new one, so the snapshot always matches what will be sent.
 */
export function useSaveCallDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ draftId, input }: { draftId: string | null; input: CallCampaignInput }) => {
      if (draftId) {
        const { selection: _selection, ...patch } = input;
        return aiAgentApi.updateCallCampaign(draftId, patch);
      }
      return aiAgentApi.createCallCampaign(input);
    },
    onSuccess: (campaign) => {
      client.setQueryData(queryKeys.aiAgent.campaign('call', campaign.id), campaign);
      void client.invalidateQueries({ queryKey: queryKeys.aiAgent.callPreview(campaign.id) });
      void client.invalidateQueries({ queryKey: queryKeys.aiAgent.campaigns });
    },
    onError: showApiErrorToast,
  });
}

export function useSaveSmsDraft() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ staleDraftId, input }: { staleDraftId: string | null; input: SmsCampaignInput }) => {
      if (staleDraftId) await aiAgentApi.cancelSmsCampaign(staleDraftId).catch(() => undefined);
      return aiAgentApi.createSmsCampaign(input);
    },
    onSuccess: (campaign) => {
      client.setQueryData(queryKeys.aiAgent.campaign('sms', campaign.id), campaign);
      void client.invalidateQueries({ queryKey: queryKeys.aiAgent.recipients('sms', campaign.id) });
      void client.invalidateQueries({ queryKey: queryKeys.aiAgent.campaigns });
    },
    onError: showApiErrorToast,
  });
}

/** The one explicit Start. Never auto-retried (writes never retry). */
export function useStartCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: AgentChannel; id: string }): Promise<CallCampaign | SmsCampaign> =>
      kind === 'call' ? aiAgentApi.startCallCampaign(id) : aiAgentApi.startSmsCampaign(id),
    onSuccess: (campaign, { kind }) => {
      client.setQueryData(queryKeys.aiAgent.campaign(kind, campaign.id), campaign);
      void client.invalidateQueries({ queryKey: queryKeys.aiAgent.all });
    },
    onError: showApiErrorToast,
  });
}

export function useRetryFailedCalls() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => aiAgentApi.retryFailedCalls(id),
    onSuccess: ({ retried }) => {
      showSuccessToast(
        i18next.t(retried ? 'aiAgent.detail.retried' : 'aiAgent.detail.retryNone', { count: retried }),
      );
      void client.invalidateQueries({ queryKey: queryKeys.aiAgent.all });
    },
    onError: showApiErrorToast,
  });
}

export function useCampaignAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      id,
      action,
    }: {
      kind: AgentChannel;
      id: string;
      action: CampaignAction;
    }): Promise<CallCampaign | SmsCampaign> => {
      if (kind === 'call') {
        if (action === 'pause') return aiAgentApi.pauseCallCampaign(id);
        if (action === 'resume') return aiAgentApi.resumeCallCampaign(id);
        return aiAgentApi.cancelCallCampaign(id);
      }
      if (action === 'pause') return aiAgentApi.pauseSmsCampaign(id);
      if (action === 'resume') return aiAgentApi.resumeSmsCampaign(id);
      return aiAgentApi.cancelSmsCampaign(id);
    },
    onSuccess: (campaign, { kind }) => {
      client.setQueryData(queryKeys.aiAgent.campaign(kind, campaign.id), campaign);
      void client.invalidateQueries({ queryKey: queryKeys.aiAgent.all });
    },
    onError: showApiErrorToast,
  });
}

export function useSimulate(id: string) {
  return useMutation({
    mutationKey: ['ai-agent', 'simulate', id],
    mutationFn: (input: SimulateInput) => aiAgentApi.simulate(id, input),
    onError: showApiErrorToast,
  });
}
