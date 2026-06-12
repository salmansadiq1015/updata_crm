'use client';

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { aiSessionService } from '../services/ai-session-service';
import { useAiStore } from '../store/ai-store';
import {
  PANEL_VIEWS,
  SESSION_STATUSES,
  SESSION_POLL_INTERVAL_MS,
  SESSION_PROCESSING_TIMEOUT_MS,
  isTerminalSessionStatus,
  normalizeSessionStatus,
} from '../constants/ai-constants';
import { useAiLanguage } from './use-ai-language';
import { useVoiceCommandRouter } from './use-voice-command-router';

export function useVoiceSession() {
  const { t } = useLanguage();
  const defaultLanguage = useAiLanguage();
  const { executeCommand } = useVoiceCommandRouter();
  const queryClient    = useQueryClient();
  const activeSessionId = useAiStore((s) => s.activeSessionId);
  const panelView = useAiStore((s) => s.panelView);
  const setActiveSessionId = useAiStore((s) => s.setActiveSessionId);
  const setPanelView   = useAiStore((s) => s.setPanelView);

  // Poll session while in a non-terminal, non-idle state
  const sessionQuery = useQuery({
    queryKey: queryKeys.ai.session(activeSessionId),
    queryFn:  () => aiSessionService.getById(activeSessionId),
    enabled:  !!activeSessionId,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = normalizeSessionStatus(query.state.data?.status);
      if (!status) return SESSION_POLL_INTERVAL_MS;
      if (isTerminalSessionStatus(status)) return false;
      if (status === SESSION_STATUSES.AWAITING_CONFIRMATION) return false;
      return SESSION_POLL_INTERVAL_MS;
    },
  });

  // Auto-advance panel view based on polled status
  const sessionStatus = normalizeSessionStatus(sessionQuery.data?.status);
  useEffect(() => {
    if (
      sessionStatus === SESSION_STATUSES.AWAITING_CONFIRMATION &&
      panelView === PANEL_VIEWS.PROCESSING
    ) {
      setPanelView(PANEL_VIEWS.ENTITIES);
    }
  }, [panelView, sessionStatus, setPanelView]);

  useEffect(() => {
    if (!sessionStatus || sessionStatus === SESSION_STATUSES.AWAITING_CONFIRMATION) return;
    if (!isTerminalSessionStatus(sessionStatus)) return;
    if (![PANEL_VIEWS.RECORDING, PANEL_VIEWS.UPLOADING, PANEL_VIEWS.PROCESSING, PANEL_VIEWS.ENTITIES].includes(panelView)) return;

    if (sessionStatus === SESSION_STATUSES.FAILED) {
      showError(sessionQuery.data?.result?.message || t('ai.error.processingFailed'));
    }

    setActiveSessionId(null);
    setPanelView(PANEL_VIEWS.IDLE);
  }, [panelView, sessionQuery.data?.result?.message, sessionStatus, setActiveSessionId, setPanelView, t]);

  useEffect(() => {
    if (!activeSessionId || panelView !== PANEL_VIEWS.PROCESSING) return undefined;

    const timeoutId = window.setTimeout(() => {
      showError(t('ai.error.processingTimeout'));
      setActiveSessionId(null);
      setPanelView(PANEL_VIEWS.IDLE);
    }, SESSION_PROCESSING_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeSessionId, panelView, setActiveSessionId, setPanelView, t]);

  // Create session
  const createMutation = useMutation({
    mutationFn: (data) => aiSessionService.create(data),
    onSuccess: (session) => {
      setActiveSessionId(session._id || session.id);
      queryClient.setQueryData(queryKeys.ai.session(session._id || session.id), session);
    },
    onError: (err) => {
      setActiveSessionId(null);
      setPanelView(PANEL_VIEWS.IDLE);
      showError(err);
    },
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
    onSuccess: (session) => {
      const result = session?.result || session?.data?.result;
      if (result && executeCommand(result)) {
        setPanelView(PANEL_VIEWS.RESULT);
      } else {
        setPanelView(PANEL_VIEWS.AGENT);
      }
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

  const createSession = useCallback((typeOrPayload, language) => {
    setPanelView(PANEL_VIEWS.RECORDING);
    const payload = typeof typeOrPayload === 'object'
      ? { language: defaultLanguage, ...typeOrPayload }
      : { sessionType: typeOrPayload, language: language || defaultLanguage };
    createMutation.mutate(payload);
  }, [createMutation, setPanelView, defaultLanguage]);

  const createSessionAsync = useCallback(async (typeOrPayload, language) => {
    setPanelView(PANEL_VIEWS.RECORDING);
    const payload = typeof typeOrPayload === 'object'
      ? { language: defaultLanguage, ...typeOrPayload }
      : { sessionType: typeOrPayload, language: language || defaultLanguage };
    return createMutation.mutateAsync(payload);
  }, [createMutation, setPanelView, defaultLanguage]);

  const submitCorrections = useCallback(async (corrections) => {
    if (!activeSessionId) return;
    return correctMutation.mutateAsync({ id: activeSessionId, corrections });
  }, [activeSessionId, correctMutation]);

  const confirmSession = useCallback(async () => {
    if (!activeSessionId) return;
    return confirmMutation.mutateAsync(activeSessionId);
  }, [activeSessionId, confirmMutation]);

  const cancelSession = useCallback(() => {
    if (!activeSessionId) return;
    cancelMutation.mutate(activeSessionId);
  }, [activeSessionId, cancelMutation]);

  const cancelSessionById = useCallback((id) => {
    if (!id) return Promise.resolve();
    return aiSessionService.cancel(id)
      .catch(() => {})
      .finally(() => {
        setActiveSessionId(null);
        setPanelView(PANEL_VIEWS.IDLE);
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.sessions({}) });
      });
  }, [queryClient, setActiveSessionId, setPanelView]);

  const resetSession = useCallback(() => {
    setActiveSessionId(null);
    setPanelView(PANEL_VIEWS.IDLE);
  }, [setActiveSessionId, setPanelView]);

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
    cancelSessionById,
    resetSession,
    isCancelling:     cancelMutation.isPending,
  };
}
