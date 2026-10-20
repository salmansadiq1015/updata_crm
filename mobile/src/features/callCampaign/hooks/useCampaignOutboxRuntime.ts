// Loads the signed-in user's campaign outbox and keeps syncing it: on sign-in, when the
// network returns, when the app comes to the foreground, and every 30 s while items wait.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { queryKeys } from '@/constants/queryKeys';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { logger } from '@/services/logging/logger';

import { callCampaignApi } from '../api/callCampaignApi';
import { useCampaignOutbox, type OutboxItem, type Sender } from '../store/campaignOutbox';
import type { AnswerInput, CompleteInput } from '../types';

export const outboxSender: Sender = {
  answers: (item: OutboxItem) => {
    const body = item.body as { answers: AnswerInput[]; deviceId?: string | null };
    return callCampaignApi.saveAnswers(item.taskId, {
      attemptId: item.attemptId,
      deviceId: body.deviceId ?? null,
      answers: body.answers,
    });
  },
  complete: (item: OutboxItem) => callCampaignApi.complete(item.taskId, item.body as CompleteInput),
};

export async function flushCampaignOutbox(onSent?: () => void) {
  const result = await useCampaignOutbox.getState().flush(outboxSender);
  if (result.sent) onSent?.();
  if (result.failed || result.conflicts) logger.warn('callCampaign.outbox.unresolved', { ...result });
  return result;
}

export function useCampaignOutboxRuntime() {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const online = useIsOnline();
  const loaded = useCampaignOutbox((s) => s.loaded);
  const waiting = useCampaignOutbox((s) => Object.values(s.items).some((i) => i.status === 'pending'));
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) {
      useCampaignOutbox.getState().deactivate();
      return;
    }
    void useCampaignOutbox.getState().activate(userId);
  }, [userId]);

  useEffect(() => {
    if (!loaded || !online || !waiting) return;
    const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.callCampaigns.all });
    void flushCampaignOutbox(refresh);
    const timer = setInterval(() => void flushCampaignOutbox(refresh), 30_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void flushCampaignOutbox(refresh);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [loaded, online, waiting, qc]);
}
