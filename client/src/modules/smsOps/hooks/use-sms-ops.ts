'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@/lib/toast';
import { getSocket } from '@/lib/socket/client';
import { smsOpsApi } from '../services/sms-ops-api';
import type { ContactPolicySettings, RecoveryActionName, ReviewDecision, SkipSource } from '../types/sms-ops-types';

export const smsOpsKeys = {
  all: ['sms-ops'] as const,
  devices: ['sms-ops', 'devices'] as const,
  device: (id: string) => ['sms-ops', 'device', id] as const,
  reviews: (params: Record<string, unknown>) => ['sms-ops', 'reviews', params] as const,
  reviewCounts: ['sms-ops', 'review-counts'] as const,
  recovery: (params: Record<string, unknown>) => ['sms-ops', 'recovery', params] as const,
  recoveryCounts: ['sms-ops', 'recovery-counts'] as const,
  callbacks: ['sms-ops', 'callbacks'] as const,
  policy: ['contact-policy', 'settings'] as const,
  lead: (leadId: string) => ['contact-policy', 'lead', leadId] as const,
  skips: (source: string, id: string) => ['contact-policy', 'skips', source, id] as const,
};

export const apiErrorMessage = (e: unknown) =>
  (e as { response?: { data?: { error?: { message?: string } } }; message?: string })?.response?.data?.error?.message
  ?? (e as Error)?.message ?? 'Request failed';
export const apiErrorStatus = (e: unknown) => (e as { response?: { status?: number }; status?: number })?.response?.status
  ?? (e as { status?: number })?.status ?? null;

/** Live refresh from the server's socket events (best-effort; polling still runs). */
export function useSmsOpsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    type SocketLike = { on: (e: string, f: () => void) => void; off: (e: string, f: () => void) => void };
    let socket: SocketLike | null;
    try { socket = (getSocket() as unknown as SocketLike | null) ?? null; } catch { socket = null; }
    if (!socket) return undefined;
    const devices = () => void qc.invalidateQueries({ queryKey: smsOpsKeys.devices });
    const recovery = () => { void qc.invalidateQueries({ queryKey: ['sms-ops', 'recovery'] }); void qc.invalidateQueries({ queryKey: smsOpsKeys.recoveryCounts }); };
    const reviews = () => { void qc.invalidateQueries({ queryKey: ['sms-ops', 'reviews'] }); void qc.invalidateQueries({ queryKey: smsOpsKeys.reviewCounts }); };
    socket.on('sim-sms:device', devices);
    socket.on('sim-sms:recovery', recovery);
    socket.on('sim-sms:review', reviews);
    return () => { socket?.off('sim-sms:device', devices); socket?.off('sim-sms:recovery', recovery); socket?.off('sim-sms:review', reviews); };
  }, [qc]);
}

export function useSmsDevices() {
  return useQuery({ queryKey: smsOpsKeys.devices, queryFn: () => smsOpsApi.devices(), refetchInterval: 60_000 });
}

export function useAnswerReviews(params: { status?: string; page?: number } = {}) {
  return useQuery({ queryKey: smsOpsKeys.reviews(params), queryFn: () => smsOpsApi.reviews({ limit: 25, ...params }), placeholderData: (p) => p });
}
export function useReviewCounts() {
  return useQuery({ queryKey: smsOpsKeys.reviewCounts, queryFn: () => smsOpsApi.reviewCounts(), refetchInterval: 120_000 });
}

export function useRecoveryItems(params: { type?: string; status?: string; page?: number } = {}) {
  return useQuery({ queryKey: smsOpsKeys.recovery(params), queryFn: () => smsOpsApi.recovery({ limit: 25, ...params }), placeholderData: (p) => p });
}
export function useRecoveryCounts(enabled = true) {
  return useQuery({ queryKey: smsOpsKeys.recoveryCounts, queryFn: () => smsOpsApi.recoveryCounts(), refetchInterval: 120_000, enabled, retry: false });
}

export function useSmsCallbacks() {
  return useQuery({ queryKey: smsOpsKeys.callbacks, queryFn: () => smsOpsApi.callbacks(), refetchInterval: 60_000 });
}

export function useContactPolicySettings() {
  return useQuery({ queryKey: smsOpsKeys.policy, queryFn: () => smsOpsApi.policy() });
}
export function useLeadContactStatus(leadId: string | null) {
  return useQuery({ queryKey: smsOpsKeys.lead(leadId || ''), queryFn: () => smsOpsApi.leadStatus(leadId as string), enabled: Boolean(leadId), retry: false });
}
export function useCampaignSkips(source: SkipSource, campaignId: string | null) {
  return useQuery({
    queryKey: smsOpsKeys.skips(source, campaignId || ''), queryFn: () => smsOpsApi.campaignSkips(source, campaignId as string),
    enabled: Boolean(campaignId), refetchInterval: 60_000, retry: false,
  });
}

export function useSmsOpsMutations() {
  const qc = useQueryClient();
  const onError = (e: unknown) => showError(apiErrorMessage(e));
  const invalidateRecovery = () => {
    void qc.invalidateQueries({ queryKey: ['sms-ops', 'recovery'] });
    void qc.invalidateQueries({ queryKey: smsOpsKeys.recoveryCounts });
  };
  return {
    resync: useMutation({
      mutationFn: (deviceId: string) => smsOpsApi.resync(deviceId),
      onSuccess: () => { showSuccess('Resync requested'); void qc.invalidateQueries({ queryKey: smsOpsKeys.devices }); },
      onError,
    }),
    recoveryAction: useMutation({
      mutationFn: ({ id, ...body }: { id: string; action: RecoveryActionName; leadId?: string; subscriptionId?: number | null; note?: string | null }) => smsOpsApi.recoveryAction(id, body),
      onSuccess: () => invalidateRecovery(),
      onError,
    }),
    bulkDismiss: useMutation({
      mutationFn: ({ ids, note }: { ids: string[]; note?: string | null }) => smsOpsApi.bulkDismiss(ids, note),
      onSuccess: () => invalidateRecovery(),
      onError,
    }),
    resolveReview: useMutation({
      mutationFn: ({ id, decisions, note }: { id: string; decisions: ReviewDecision[]; note?: string | null }) => smsOpsApi.resolveReview(id, { decisions, note }),
      onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sms-ops', 'reviews'] }); void qc.invalidateQueries({ queryKey: smsOpsKeys.reviewCounts }); },
      onError,
    }),
    savePolicy: useMutation({
      mutationFn: (body: Partial<ContactPolicySettings>) => smsOpsApi.savePolicy(body),
      onSuccess: (data) => { qc.setQueryData(smsOpsKeys.policy, data); void qc.invalidateQueries({ queryKey: ['contact-policy', 'lead'] }); },
    }),
  };
}
