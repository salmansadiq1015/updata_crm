'use client';

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';
import { aiAgentService } from '../services/ai-agent-service';
import { useAiHistory } from './use-ai-history';
import { useVoiceSession } from './use-voice-session';
import { useAudioRecorder } from './use-audio-recorder';
import {
  AGENT_POLL_INTERVAL_MS,
  isTerminalAgentStatus,
} from '../constants/ai-constants';
import { generateCorrelationId } from '../utils/uid';

export function useAiChat({ selectedThreadId, currentThreadId, onThreadSelected, onThreadDeleted }) {
  const queryClient = useQueryClient();
  const [pendingInput, setPendingInput] = useState(null);

  // ── Sidebar thread list ────────────────────────────────────────────
  const history = useAiHistory();

  // ── Thread runs (all messages in the selected thread) ─────────────
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

  // Clear pending once thread data arrives with a new run
  useEffect(() => {
    if (threadRuns.length > 0) setPendingInput(null);
  }, [threadRuns.length]);

  // ── Dispatch message into current thread ───────────────────────────
  const dispatchMutation = useMutation({
    mutationFn: ({ input, threadId, correlationId }) => aiAgentService.dispatch(input, threadId, correlationId),
    onSuccess: (result, { threadId }) => {
      onThreadSelected(threadId);
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentThread(threadId) });
    },
    onError: (err) => {
      setPendingInput(null);
      if (err?.code === 'AI_AGENT_RATE_LIMITED') {
        showError('Too many requests — please wait a moment before trying again.');
      } else {
        showError(err);
      }
    },
  });

  // ── Confirm / deny AWAITING_CONFIRMATION ──────────────────────────
  const confirmMutation = useMutation({
    mutationFn: ({ decision }) => aiAgentService.confirm(latestRun?._id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentThread(selectedThreadId) });
    },
    onError: (err) => {
      if (err?.code === 'AI_AGENT_INVALID_STATUS') {
        showError("Can't confirm — this run has already been settled.");
      } else {
        showError(err);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentThread(selectedThreadId) });
    },
  });

  // ── Archive thread ─────────────────────────────────────────────────
  const archiveMutation = useMutation({
    mutationFn: (threadId) => aiAgentService.archiveThread(threadId),
    onSuccess: (_, threadId) => {
      showSuccess('Chat archived');
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
      if (threadId === selectedThreadId && onThreadDeleted) onThreadDeleted();
    },
    onError: (err) => showError(err),
  });

  // ── Delete thread ──────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (threadId) => aiAgentService.deleteThread(threadId),
    onSuccess: (_, threadId) => {
      showSuccess('Chat deleted');
      queryClient.removeQueries({ queryKey: queryKeys.ai.agentThread(threadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
      if (threadId === selectedThreadId && onThreadDeleted) onThreadDeleted();
    },
    onError: (err) => showError(err),
  });

  // ── Voice ─────────────────────────────────────────────────────────
  const voiceSession = useVoiceSession();
  const recorder = useAudioRecorder({
    onUploadComplete: voiceSession.onAudioUploaded,
  });

  const dispatch = useCallback(
    (input, correlationId) => {
      const trimmed = input?.trim();
      if (!trimmed || trimmed.length < 3) return;
      setPendingInput(trimmed);
      dispatchMutation.mutate({
        input: trimmed,
        threadId: currentThreadId,
        correlationId: correlationId ?? generateCorrelationId(),
      });
    },
    [dispatchMutation, currentThreadId]
  );

  const confirm = useCallback(
    (decision) => confirmMutation.mutate({ decision }),
    [confirmMutation]
  );

  const isLoading = threadQuery.isLoading;
  const activePendingInput =
    pendingInput && (dispatchMutation.isPending || isLoading) ? pendingInput : null;

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
    isLoadingThread: isLoading,

    dispatch,
    isDispatching: dispatchMutation.isPending,
    pendingInput: activePendingInput,

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
