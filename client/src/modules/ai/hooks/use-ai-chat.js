'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { aiAgentService } from '../services/ai-agent-service';
import { useAiHistory } from './use-ai-history';
import { useVoiceSession } from './use-voice-session';
import { useAudioRecorder } from './use-audio-recorder';
import {
  AGENT_POLL_INTERVAL_MS,
  AGENT_STATUSES,
  MIN_AGENT_INPUT_LENGTH,
  isTerminalAgentStatus,
} from '../constants/ai-constants';
import { generateCorrelationId } from '../utils/uid';

function hasMatchingRun(runs, pendingRun) {
  if (!pendingRun) return false;
  return runs.some((run) =>
    (pendingRun._id && run._id === pendingRun._id) ||
    (pendingRun.correlationId && run.correlationId === pendingRun.correlationId)
  );
}

export function useAiChat({ selectedThreadId, currentThreadId, onThreadSelected, onThreadDeleted }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [pendingRuns, setPendingRuns] = useState([]);

  const history = useAiHistory();

  const threadQuery = useQuery({
    queryKey: queryKeys.ai.agentThread(selectedThreadId),
    queryFn: () => aiAgentService.getThread(selectedThreadId),
    enabled: !!selectedThreadId,
    staleTime: 0,
    refetchInterval: (q) => {
      const runs = q.state.data;
      if (!runs?.length) return AGENT_POLL_INTERVAL_MS;
      const latest = runs[runs.length - 1];
      return !latest || isTerminalAgentStatus(latest.status) ? false : AGENT_POLL_INTERVAL_MS;
    },
  });

  const threadRuns = Array.isArray(threadQuery.data) ? threadQuery.data : [];
  const latestRun = threadRuns[threadRuns.length - 1] ?? null;

  const dispatchMutation = useMutation({
    mutationFn: ({ input, threadId, correlationId }) => aiAgentService.dispatch(input, threadId, correlationId),
    onSuccess: (result, { threadId, correlationId }) => {
      const resolvedThreadId = result?.threadId || threadId;
      const resolvedRunId = result?.agentRunId || result?._id;

      setPendingRuns((runs) =>
        runs.map((run) => {
          if (run.correlationId !== correlationId) return run;
          return {
            ...run,
            _id: resolvedRunId || run._id,
            threadId: resolvedThreadId,
            status: result?.status?.toUpperCase?.() || AGENT_STATUSES.PENDING,
          };
        })
      );

      if (selectedThreadId !== resolvedThreadId) {
        onThreadSelected(resolvedThreadId);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentThread(resolvedThreadId) });
    },
    onError: (err, { correlationId } = {}) => {
      setPendingRuns((runs) => runs.filter((run) => run.correlationId !== correlationId));
      if (err?.code === 'AI_AGENT_RATE_LIMITED') {
        showError(t('ai.chat.tooManyRequests'));
      } else {
        showError(err);
      }
    },
  });

  const confirmMutation = useMutation({
    mutationFn: ({ decision }) => aiAgentService.confirm(latestRun?._id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentThread(selectedThreadId) });
    },
    onError: (err) => {
      if (err?.code === 'AI_AGENT_INVALID_STATUS') {
        showError(t('ai.chat.alreadySettled'));
      } else {
        showError(err);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentThread(selectedThreadId) });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (threadId) => aiAgentService.archiveThread(threadId),
    onSuccess: (_, threadId) => {
      showSuccess(t('ai.chat.archived'));
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
      if (threadId === selectedThreadId && onThreadDeleted) onThreadDeleted();
    },
    onError: (err) => showError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: (threadId) => aiAgentService.deleteThread(threadId),
    onSuccess: (_, threadId) => {
      showSuccess(t('ai.chat.deleted'));
      queryClient.removeQueries({ queryKey: queryKeys.ai.agentThread(threadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
      if (threadId === selectedThreadId && onThreadDeleted) onThreadDeleted();
    },
    onError: (err) => showError(err),
  });

  const voiceSession = useVoiceSession();
  const recorder = useAudioRecorder({
    onUploadComplete: voiceSession.onAudioUploaded,
  });

  const dispatch = useCallback(
    (input, correlationId) => {
      const trimmed = input?.trim();
      if (!trimmed || trimmed.length < MIN_AGENT_INPUT_LENGTH) return;
      const nextCorrelationId = correlationId ?? generateCorrelationId();
      const optimisticRun = {
        _id: `pending-${nextCorrelationId}`,
        threadId: currentThreadId,
        correlationId: nextCorrelationId,
        input: trimmed,
        output: null,
        steps: [],
        status: AGENT_STATUSES.PENDING,
        createdAt: new Date().toISOString(),
        __optimistic: true,
      };
      setPendingRuns((runs) => [
        ...runs.filter((run) => run.correlationId !== nextCorrelationId),
        optimisticRun,
      ]);
      dispatchMutation.mutate({
        input: trimmed,
        threadId: currentThreadId,
        correlationId: nextCorrelationId,
      });
    },
    [dispatchMutation, currentThreadId],
  );

  const confirm = useCallback(
    (decision) => confirmMutation.mutate({ decision }),
    [confirmMutation],
  );

  const activePendingRuns = pendingRuns.filter((run) =>
    run.threadId === currentThreadId && !hasMatchingRun(threadRuns, run)
  );

  return {
    threads: history.threads,
    isLoadingHistory: history.isLoading,
    isFetchingHistory: history.isFetching,
    hasMore: history.hasMore,
    hasPrev: history.hasPrev,
    nextPage: history.nextPage,
    prevPage: history.prevPage,

    threadRuns,
    latestRun,
    isLoadingThread: threadQuery.isLoading,

    dispatch,
    isDispatching: dispatchMutation.isPending,
    pendingRuns: activePendingRuns,

    confirm,
    isConfirming: confirmMutation.isPending,

    archiveThread: archiveMutation.mutate,
    isArchiving: archiveMutation.isPending,
    deleteThread: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,

    voiceSession,
    recorder,
  };
}
