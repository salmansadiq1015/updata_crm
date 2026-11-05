import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showError, showSuccess } from '@/lib/toast';
import { followUpCallingApi } from '../services/follow-up-calling-api';
import { useIntelT } from './use-intel-t';

/** Keys live under ['ai-calling'] so every existing agent mutation also refreshes them. */
export const followUpKeys = {
  settings: ['ai-calling', 'follow-up', 'settings'] as const,
  types: ['ai-calling', 'follow-up', 'agent-types'] as const,
  summary: (agentId?: string) => ['ai-calling', 'follow-up', 'summary', agentId ?? 'all'] as const,
  campaignSummary: (campaignId: string) => ['ai-calling', 'follow-up', 'campaign-summary', campaignId] as const,
  queue: (agentId: string, state?: string) => ['ai-calling', 'follow-up', 'queue', agentId, state ?? 'all'] as const,
};
const readable = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'The request could not be completed.');

export const useFollowUpSettings = () => useQuery({ queryKey: followUpKeys.settings, queryFn: followUpCallingApi.settings, staleTime: 15_000 });
export const useAgentTemplates = () => useQuery({ queryKey: followUpKeys.types, queryFn: followUpCallingApi.agentTypes, staleTime: 60 * 60_000 });
export const useFollowUpSummary = (agentId?: string) => useQuery({ queryKey: followUpKeys.summary(agentId), queryFn: () => followUpCallingApi.summary(agentId ? { agentId } : {}), refetchInterval: 20_000 });
export const useCampaignFollowUpSummary = (campaignId: string, enabled = true) => useQuery({ queryKey: followUpKeys.campaignSummary(campaignId), queryFn: () => followUpCallingApi.campaignSummary(campaignId), enabled, refetchInterval: 30_000 });
export const useAgentFollowUpQueue = (agentId: string, state?: string) => useQuery({ queryKey: followUpKeys.queue(agentId, state), queryFn: () => followUpCallingApi.agentQueue(agentId, state), refetchInterval: 10_000 });

export function useFollowUpActions() {
  const client = useQueryClient();
  const t = useIntelT();
  const refresh = () => { void client.invalidateQueries({ queryKey: ['ai-calling', 'follow-up'] }); void client.invalidateQueries({ queryKey: ['lead-follow-ups'] }); };
  const onError = (e: unknown) => showError(readable(e));
  const callNow = useMutation({ mutationFn: followUpCallingApi.callNow, onSuccess: () => { refresh(); showSuccess(t('aiFollowUp.toast.callStarted', 'Follow-up call started')); }, onError });
  const pause = useMutation({ mutationFn: followUpCallingApi.pause, onSuccess: () => { refresh(); showSuccess(t('aiFollowUp.toast.paused', 'Follow-up paused')); }, onError });
  const resume = useMutation({ mutationFn: followUpCallingApi.resume, onSuccess: () => { refresh(); showSuccess(t('aiFollowUp.toast.resumed', 'Follow-up resumed')); }, onError });
  const setAutomation = useMutation({
    mutationFn: ({ enabled, reason }: { enabled: boolean; reason?: string }) => followUpCallingApi.setSettings(enabled, reason),
    onSuccess: (s) => { refresh(); showSuccess(s.enabled ? t('aiFollowUp.toast.automationOn', 'Automatic follow-up calls are on') : t('aiFollowUp.toast.automationOff', 'Automatic follow-up calls are off')); },
    onError,
  });
  const setEscalationRecipients = useMutation({
    mutationFn: (ids: string[]) => followUpCallingApi.setEscalationRecipients(ids),
    onSuccess: () => { refresh(); showSuccess(t('aiFollowUp.toast.recipientsSaved', 'Escalation recipients saved')); },
    onError,
  });
  return { callNow, pause, resume, setAutomation, setEscalationRecipients };
}
