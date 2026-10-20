import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { queryKeys } from '@/constants/queryKeys';
import { getEnv } from '@/config/env';
import { telephony } from '@/services/telephony/telephonyService';
import { showApiErrorToast } from '@/utils/toast';

import { simSmsApi } from '../api/simSmsApi';
import { smsAgentLoop, type LoopStatus } from '../domain/agentLoop';
import { ensureSmsAgentRunning } from '../services/agentControl';
import type { SimCampaignInput } from '../types';

const ACTIVE = new Set(['running']);

export const isPrivateBuild = () => getEnv().distribution === 'private';

export function useSimCampaigns() {
  return useQuery({
    queryKey: queryKeys.smsAgent.campaigns,
    queryFn: ({ signal }) => simSmsApi.campaigns(undefined, signal),
    enabled: isPrivateBuild(),
    refetchInterval: (q) => ((q.state.data ?? []).some((c) => ACTIVE.has(c.status)) ? 15_000 : false),
  });
}

export function useSimCampaign(id: string) {
  return useQuery({
    queryKey: queryKeys.smsAgent.campaign(id),
    queryFn: ({ signal }) => simSmsApi.campaign(id, signal),
    refetchInterval: (q) => (q.state.data && ACTIVE.has(q.state.data.status) ? 10_000 : false),
  });
}

export function useSimConversations(id: string, live: boolean) {
  return useQuery({
    queryKey: queryKeys.smsAgent.conversations(id),
    queryFn: ({ signal }) => simSmsApi.conversations(id, signal),
    refetchInterval: live ? 10_000 : false,
  });
}

export function useSimConversation(id: string) {
  return useQuery({
    queryKey: queryKeys.smsAgent.conversation(id),
    queryFn: ({ signal }) => simSmsApi.conversation(id, signal),
    refetchInterval: 15_000,
  });
}

export function useCreateSimCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SimCampaignInput) => simSmsApi.create(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.smsAgent.all }),
    onError: showApiErrorToast,
  });
}

export function useSimCampaignAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'pause' | 'cancel' }) =>
      simSmsApi.action(id, action),
    onSuccess: (campaign, { action }) => {
      client.setQueryData(queryKeys.smsAgent.campaign(campaign.id), campaign);
      void client.invalidateQueries({ queryKey: queryKeys.smsAgent.all });
      if (action === 'start') void ensureSmsAgentRunning();
      else smsAgentLoop.kick();
    },
    onError: showApiErrorToast,
  });
}

export function useResolveConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'resend' | 'mark_sent' | 'cancel' }) =>
      simSmsApi.resolve(id, action),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.smsAgent.all });
      smsAgentLoop.kick();
    },
    onError: showApiErrorToast,
  });
}

/** Device readiness for automatic SMS (private build), refreshed when the app returns to the foreground. */
export function useSmsReadiness() {
  const query = useQuery({
    queryKey: queryKeys.smsAgent.readiness,
    queryFn: async () => {
      const [caps, battery] = await Promise.all([
        telephony.getCapabilities(),
        telephony.isIgnoringBatteryOptimizations(),
      ]);
      return { ...caps, batteryUnrestricted: battery };
    },
    enabled: isPrivateBuild(),
  });
  const { refetch } = query;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);
  return query;
}

export function useAgentLoopStatus(): LoopStatus {
  const [status, setStatus] = useState<LoopStatus>(smsAgentLoop.getStatus());
  useEffect(() => smsAgentLoop.subscribe(setStatus), []);
  return status;
}
