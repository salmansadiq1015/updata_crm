'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@/lib/toast';
import { aiCallingApi } from '../services/ai-calling-api';
import type { Campaign, CallListFilters, CreateCampaignInput, ReconcileResolution } from '../types/ai-calling-types';

const keys = {
  all: ['ai-calling'] as const,
  campaigns: (params: Record<string, unknown> = {}) => ['ai-calling', 'campaigns', params] as const,
  campaign: (id: string) => ['ai-calling', 'campaign', id] as const,
  recipients: (id: string) => ['ai-calling', 'recipients', id] as const,
  analytics: () => ['ai-calling', 'analytics'] as const,
  telephony: () => ['ai-calling', 'telephony'] as const,
  languages: () => ['ai-calling', 'languages'] as const,
  leadHistory: (leadId: string) => ['ai-calling', 'lead-history', leadId] as const,
  calls: () => ['ai-calling', 'calls'] as const,
  consent: (leadId: string) => ['ai-calling', 'consent', leadId] as const,
};

export function useCampaigns(params: { status?: string; page?: number; limit?: number; agentId?: string } = {}) {
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
      return status === 'completed' || status === 'cancelled' ? 15000 : 5000;
    },
  });
}

export function useCampaignRunStatus(id: string, enabled = true) {
  return useQuery({ queryKey: ['ai-calling', 'run-status', id], queryFn: () => aiCallingApi.runStatus(id), enabled, refetchInterval: 5000, retry: false });
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
    refetchInterval: query => !query.state.data || query.state.error ? 3000 : !query.state.data.endedAt && ['queued', 'initiating', 'ringing', 'in_progress', 'processing_results'].includes(query.state.data.state) ? 1500 : false,
  });
}

export function useCalls(params: CallListFilters = {}) {
  return useQuery({
    queryKey: [...keys.calls(), params],
    queryFn: () => aiCallingApi.listCalls(params),
    placeholderData: (previous) => previous,
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
      qc.invalidateQueries({ queryKey: ['ai-calling', 'calls'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: unknown) => showError(e),
  });
}

/** Resolve a call whose outcome is unknown: the only way it leaves review (never redialed on its own). */
export function useReconcileCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; resolution: ReconcileResolution; qualification?: string | null; note?: string }) =>
      aiCallingApi.reconcileCall(id, payload),
    onSuccess: (_data, vars) => {
      showSuccess(vars.resolution === 'retry' ? 'Outcome resolved · the lead will be called again' : 'Outcome resolved');
      qc.invalidateQueries({ queryKey: ['ai-calling'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: unknown) => showError(e),
  });
}

export function usePreviewEligibility(leadIds: string[], channel: 'voice' | 'web_link', enabled = true) {
  return useQuery({
    // Keyed on the sorted lead set so re-ordering the selection does not refetch.
    queryKey: ['ai-calling', 'eligibility-preview', channel, [...leadIds].sort().join(',')],
    queryFn: () => aiCallingApi.previewEligibility(leadIds, channel),
    enabled: enabled && leadIds.length > 0,
    staleTime: 15_000,
  });
}

export function useRemoveRecipients(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipientIds: string[]) => aiCallingApi.removeRecipients(campaignId, recipientIds),
    onSuccess: (result) => {
      const skippedInCall = result.skipped.filter((s) => s.reason === 'in_call').length;
      if (result.removed) {
        showSuccess(skippedInCall
          ? `Removed ${result.removed}; ${skippedInCall} kept (currently in a call)`
          : `Removed ${result.removed} recipient${result.removed === 1 ? '' : 's'}`);
      } else if (skippedInCall) {
        showError(`Nothing removed: ${skippedInCall} recipient${skippedInCall === 1 ? ' is' : 's are'} currently in a call`);
      }
      qc.invalidateQueries({ queryKey: ['ai-calling', 'recipients', campaignId] });
      qc.invalidateQueries({ queryKey: ['ai-calling', 'campaign'] });
      qc.invalidateQueries({ queryKey: ['ai-calling', 'campaigns'] });
      qc.invalidateQueries({ queryKey: ['ai-calling', 'analytics'] });
    },
    onError: (e: unknown) => showError(e),
  });
}

export function useLeadCallHistory(leadId: string | null, page = 1, campaignId?: string) {
  return useQuery({
    queryKey: [...keys.leadHistory(leadId || ''), page, campaignId || 'all'],
    queryFn: () => aiCallingApi.leadHistory(leadId as string, page, campaignId),
    enabled: Boolean(leadId),
    refetchInterval: 15_000,
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

export function useDeleteCampaigns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campaignIds: string[]) => aiCallingApi.deleteCampaigns(campaignIds),
    onSuccess: (result) => {
      if (result.deleted) showSuccess(`Deleted ${result.deleted} campaign${result.deleted === 1 ? '' : 's'}`);
      if (result.skipped.length) showError(`${result.skipped.length} could not be deleted: ${result.skipped[0]?.reason}`);
      qc.invalidateQueries({ queryKey: ['ai-calling'] });
    },
    onError: (e: unknown) => showError(e),
  });
}

export function useCampaignMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: keys.all });
  };
  const syncCampaign = (campaign: Campaign) => {
    qc.setQueryData(keys.campaign(campaign._id), campaign);
    qc.setQueriesData<{ data: Campaign[] }>({ queryKey: ['ai-calling', 'campaigns'] }, old => old ? { ...old, data: old.data.map(c => c._id === campaign._id ? campaign : c) } : old);
    invalidate();
  };

  const create = useMutation({
    mutationFn: (input: CreateCampaignInput) => aiCallingApi.createCampaign(input),
    onSuccess: () => { showSuccess('Campaign created'); invalidate(); },
    onError: (e: unknown) => showError(e),
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateCampaignInput> }) => aiCallingApi.updateCampaign(id, input),
    onSuccess: () => { showSuccess('Campaign updated'); invalidate(); },
    onError: (e: unknown) => showError(e),
  });
  const start = useMutation({
    mutationFn: ({ id, scheduledAt, startNow = true }: { id: string; scheduledAt?: string | null; startNow?: boolean }) => aiCallingApi.start(id, scheduledAt ?? null, startNow),
    onSuccess: (campaign) => { syncCampaign(campaign); showSuccess(campaign.channel === 'web_link' ? 'Campaign started' : campaign.runMode === 'immediate' ? 'Calling started now' : 'Calling scheduled · calls follow your calling hours'); },
    onError: (e: unknown) => showError(e),
  });
  const pause = useMutation({
    mutationFn: (id: string) => aiCallingApi.pause(id),
    onSuccess: (campaign) => { syncCampaign(campaign); showSuccess('Campaign paused · the current call can finish'); },
    onError: (e: unknown) => showError(e),
  });
  const resume = useMutation({
    mutationFn: (id: string) => aiCallingApi.resume(id),
    onSuccess: (campaign) => { syncCampaign(campaign); showSuccess(campaign.runMode === 'immediate' ? 'Calling resumed now' : 'Calling queue resumed'); },
    onError: (e: unknown) => showError(e),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => aiCallingApi.cancel(id),
    onSuccess: (campaign) => { syncCampaign(campaign); showSuccess('Campaign cancelled'); },
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

  return { create, update, start, pause, resume, cancel, retry };
}
