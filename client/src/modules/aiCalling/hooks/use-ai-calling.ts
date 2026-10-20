'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@/lib/toast';
import { aiCallingApi } from '../services/ai-calling-api';
import type { CreateCampaignInput } from '../types/ai-calling-types';

const keys = {
  all: ['ai-calling'] as const,
  campaigns: (params: Record<string, unknown> = {}) => ['ai-calling', 'campaigns', params] as const,
  campaign: (id: string) => ['ai-calling', 'campaign', id] as const,
  recipients: (id: string) => ['ai-calling', 'recipients', id] as const,
  analytics: () => ['ai-calling', 'analytics'] as const,
  telephony: () => ['ai-calling', 'telephony'] as const,
  languages: () => ['ai-calling', 'languages'] as const,
  leadHistory: (leadId: string) => ['ai-calling', 'lead-history', leadId] as const,
  consent: (leadId: string) => ['ai-calling', 'consent', leadId] as const,
};

export function useCampaigns(params: { status?: string } = {}) {
  return useQuery({
    queryKey: keys.campaigns(params),
    queryFn: () => aiCallingApi.listCampaigns(params),
    refetchInterval: 15000, // dashboard stays live without a manual refresh
  });
}

export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: keys.campaign(id || ''),
    queryFn: () => aiCallingApi.getCampaign(id as string),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'queued' ? 5000 : false;
    },
  });
}

export function useRecipients(id: string | null, state?: string, page = 1) {
  return useQuery({
    queryKey: [...keys.recipients(id || ''), state, page],
    queryFn: () => aiCallingApi.recipients(id as string, { limit: 100, state, page }),
    enabled: Boolean(id),
    placeholderData: (previous) => previous, // keep the table steady while paging
  });
}

export function useActiveCalls(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ['ai-calling', 'active-calls', id || ''],
    queryFn: () => aiCallingApi.activeCalls(id as string),
    enabled: Boolean(id) && enabled,
    refetchInterval: enabled ? 3000 : false, // tight poll while something is live
  });
}

export function useAnalytics(params: { from?: string; to?: string; campaignId?: string } = {}) {
  return useQuery({
    queryKey: [...keys.analytics(), params],
    queryFn: () => aiCallingApi.analytics(params),
    refetchInterval: 20000,
    placeholderData: (previous) => previous, // keep the panel (and its date inputs) mounted while refetching
  });
}

/** The AI agent language allow-list rarely changes: cache it for the session. */
export function useAgentLanguages() {
  return useQuery({ queryKey: keys.languages(), queryFn: () => aiCallingApi.languages(), staleTime: Infinity });
}

export function useTelephonyHealth() {
  return useQuery({ queryKey: keys.telephony(), queryFn: () => aiCallingApi.telephonyHealth(), staleTime: 60000 });
}

export function useCall(callId: string | null) {
  return useQuery({
    queryKey: ['ai-calling', 'call', callId || ''],
    queryFn: () => aiCallingApi.getCall(callId as string),
    enabled: Boolean(callId),
  });
}

export function useReviewCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; answers?: Array<{ questionFieldKey: string; normalizedValue?: unknown; validation?: string }>; qualification?: string | null }) =>
      aiCallingApi.reviewCall(id, payload),
    onSuccess: (_data, vars) => {
      showSuccess('Review saved');
      // A review can change the lead's status and the campaign's qualification counts.
      qc.invalidateQueries({ queryKey: ['ai-calling', 'call', vars.id] });
      qc.invalidateQueries({ queryKey: ['ai-calling', 'lead-history'] });
      qc.invalidateQueries({ queryKey: ['ai-calling', 'campaigns'] });
      qc.invalidateQueries({ queryKey: ['ai-calling', 'campaign'] });
      qc.invalidateQueries({ queryKey: ['ai-calling', 'recipients'] });
      qc.invalidateQueries({ queryKey: ['ai-calling', 'analytics'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: unknown) => showError(e),
  });
}

export function useLeadCallHistory(leadId: string | null) {
  return useQuery({
    queryKey: keys.leadHistory(leadId || ''),
    queryFn: () => aiCallingApi.leadHistory(leadId as string),
    enabled: Boolean(leadId),
  });
}

export function useCallConsent(leadId: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.consent(leadId || ''), queryFn: () => aiCallingApi.callConsent(leadId as string), enabled: Boolean(leadId),
  });
  const update = useMutation({
    mutationFn: (input: { status: 'granted' | 'denied' | 'revoked'; evidence: string; confirmation?: boolean }) => aiCallingApi.updateCallConsent(leadId as string, { ...input, source: 'crm_user', capturedAt: new Date().toISOString() }),
    onSuccess: () => { showSuccess('Call consent updated'); void qc.invalidateQueries({ queryKey: keys.consent(leadId || '') }); },
    onError: (error: unknown) => showError(error),
  });
  const suppress = useMutation({
    mutationFn: (input: { note?: string } = {}) => aiCallingApi.suppress({ ...input, leadId, reason: 'do_not_contact' }),
    onSuccess: () => {
      showSuccess('Number added to the do-not-call list');
      void qc.invalidateQueries({ queryKey: keys.consent(leadId || '') });
      void qc.invalidateQueries({ queryKey: ['ai-calling', 'recipients'] });
    },
    onError: (error: unknown) => showError(error),
  });
  return { ...query, update, suppress };
}

export function useCampaignMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: keys.all });
  };

  const create = useMutation({
    mutationFn: (input: CreateCampaignInput) => aiCallingApi.createCampaign(input),
    onSuccess: () => { showSuccess('Campaign created'); invalidate(); },
    onError: (e: unknown) => showError(e),
  });
  const start = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt?: string | null }) => aiCallingApi.start(id, scheduledAt ?? null),
    onSuccess: () => { showSuccess('Campaign started'); invalidate(); },
    onError: (e: unknown) => showError(e),
  });
  const pause = useMutation({
    mutationFn: (id: string) => aiCallingApi.pause(id),
    onSuccess: () => { showSuccess('Campaign paused'); invalidate(); },
    onError: (e: unknown) => showError(e),
  });
  const resume = useMutation({
    mutationFn: (id: string) => aiCallingApi.resume(id),
    onSuccess: () => { showSuccess('Campaign resumed'); invalidate(); },
    onError: (e: unknown) => showError(e),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => aiCallingApi.cancel(id),
    onSuccess: () => { showSuccess('Campaign cancelled'); invalidate(); },
    onError: (e: unknown) => showError(e),
  });
  const retry = useMutation({
    mutationFn: (id: string) => aiCallingApi.retry(id),
    onSuccess: (res) => {
      const n = res?.retried ?? 0;
      showSuccess(n ? `${n} recipient${n === 1 ? '' : 's'} re-queued` : 'No failed or exhausted recipients to retry');
      invalidate();
    },
    onError: (e: unknown) => showError(e),
  });

  return { create, start, pause, resume, cancel, retry };
}
