'use client';

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError } from '@/lib/toast';
import { aiSessionService } from '../services/ai-session-service';
import { useAiStore } from '../store/ai-store';
import {
  PANEL_VIEWS,
  SESSION_STATUSES,
  SESSION_POLL_INTERVAL_MS,
  isTerminalSessionStatus,
} from '../constants/ai-constants';

export function useVoiceSession() {
  const queryClient    = useQueryClient();
  const activeSessionId = useAiStore((s) => s.activeSessionId);
  const setActiveSessionId = useAiStore((s) => s.setActiveSessionId);
  const setPanelView   = useAiStore((s) => s.setPanelView);

  // Poll session while in a non-terminal, non-idle state
  const sessionQuery = useQuery({
    queryKey: queryKeys.ai.session(activeSessionId),
    queryFn:  () => aiSessionService.getById(activeSessionId),
    enabled:  !!activeSessionId,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return SESSION_POLL_INTERVAL_MS;
      if (isTerminalSessionStatus(status)) return false;
      if (status === SESSION_STATUSES.AWAITING_CONFIRMATION) return false;
      return SESSION_POLL_INTERVAL_MS;
    },
  });

  // Auto-advance panel view based on polled status
  const sessionStatus = sessionQuery.data?.status;
  useEffect(() => {
    if (
      sessionStatus === SESSION_STATUSES.AWAITING_CONFIRMATION &&
      useAiStore.getState().panelView === PANEL_VIEWS.PROCESSING
    ) {
      setPanelView(PANEL_VIEWS.ENTITIES);
    }
  }, [sessionStatus, setPanelView]);

  // Create session
  const createMutation = useMutation({
    mutationFn: (data) => aiSessionService.create(data),
    onSuccess: (session) => {
      setActiveSessionId(session._id || session.id);
      queryClient.setQueryData(queryKeys.ai.session(session._id || session.id), session);
    },
    onError: (err) => showError(err),
  });

  // Submit corrections
  const correctMutation = useMutation({
    mutationFn: ({ id, corrections }) => aiSessionService.correct(id, corrections),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.ai.session(activeSessionId), updated);
    },
    onError: (err) => showError(err),
  });

  // Confirm session
  const confirmMutation = useMutation({
    mutationFn: (id) => aiSessionService.confirm(id),
    onSuccess: () => {
      setPanelView(PANEL_VIEWS.AGENT);
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.session(activeSessionId) });
    },
    onError: (err) => {
      showError(err);
      // Refresh session to get correct status
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.session(activeSessionId) });
    },
  });

  // Cancel session
  const cancelMutation = useMutation({
    mutationFn: (id) => aiSessionService.cancel(id),
    onSuccess: () => {
      setActiveSessionId(null);
      setPanelView(PANEL_VIEWS.IDLE);
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.sessions({}) });
    },
    onError: (err) => showError(err),
  });

  const createSession = useCallback((type, language = 'de-CH') => {
    setPanelView(PANEL_VIEWS.RECORDING);
    createMutation.mutate({ sessionType: type, language });
  }, [createMutation, setPanelView]);

  const createSessionAsync = useCallback(async (type, language = 'de-CH') => {
    setPanelView(PANEL_VIEWS.RECORDING);
    return createMutation.mutateAsync({ sessionType: type, language });
  }, [createMutation, setPanelView]);

  const submitCorrections = useCallback((corrections) => {
    if (!activeSessionId) return;
    correctMutation.mutate({ id: activeSessionId, corrections });
  }, [activeSessionId, correctMutation]);

  const confirmSession = useCallback(() => {
    if (!activeSessionId) return;
    confirmMutation.mutate(activeSessionId);
  }, [activeSessionId, confirmMutation]);

  const cancelSession = useCallback(() => {
    if (!activeSessionId) return;
    cancelMutation.mutate(activeSessionId);
  }, [activeSessionId, cancelMutation]);

  const onAudioUploaded = useCallback(() => {
    setPanelView(PANEL_VIEWS.PROCESSING);
  }, [setPanelView]);

  return {
    session:          sessionQuery.data,
    isLoadingSession: sessionQuery.isLoading,
    createSession,
    createSessionAsync,
    isCreating:       createMutation.isPending,
    onAudioUploaded,
    submitCorrections,
    isSubmittingCorrections: correctMutation.isPending,
    confirmSession,
    isConfirming:     confirmMutation.isPending,
    cancelSession,
    isCancelling:     cancelMutation.isPending,
  };
}
