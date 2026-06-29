'use client';

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { aiAgentService } from '../services/ai-agent-service';
import { useAiStore } from '../store/ai-store';
import {
  PANEL_VIEWS,
  AGENT_STATUSES,
  AGENT_POLL_INTERVAL_MS,
  WORKFLOW_LABELS,
  MIN_AGENT_INPUT_LENGTH,
  isTerminalAgentStatus,
} from '../constants/ai-constants';

export function useAgentRun() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const isPanelOpen = useAiStore((s) => s.isPanelOpen);
  const activeRunId = useAiStore((s) => s.activeRunId);
  const setActiveRunId = useAiStore((s) => s.setActiveRunId);
  const setPanelView = useAiStore((s) => s.setPanelView);

  const runQuery = useQuery({
    queryKey: queryKeys.ai.agentRun(activeRunId),
    queryFn: () => aiAgentService.getStatus(activeRunId),
    enabled: !!activeRunId,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || isTerminalAgentStatus(status)) return false;
      if (!isPanelOpen) return false;
      return AGENT_POLL_INTERVAL_MS;
    },
  });

  const runStatus = runQuery.data?.status;

  useEffect(() => {
    if (!runStatus) return;
    const currentView = useAiStore.getState().panelView;
    if (runStatus === AGENT_STATUSES.AWAITING_CONFIRMATION && currentView === PANEL_VIEWS.AGENT) {
      setPanelView(PANEL_VIEWS.AGENT_CONFIRMATION);
    } else if (
      isTerminalAgentStatus(runStatus) &&
      (currentView === PANEL_VIEWS.AGENT || currentView === PANEL_VIEWS.AGENT_CONFIRMATION)
    ) {
      setPanelView(PANEL_VIEWS.RESULT);
    }
  }, [runStatus, setPanelView]);

  const dispatchMutation = useMutation({
    mutationFn: async (input) => {
      const result = await aiAgentService.dispatch(input);
      const agentRunId = result?.agentRunId || result?._id;

      if (!agentRunId) {
        throw new Error(t('ai.error.agentStartFailed', 'The assistant could not start this request. Please try again.'));
      }

      return {
        ...result,
        agentRunId,
        status: result?.status?.toUpperCase?.() || AGENT_STATUSES.PENDING,
      };
    },
    onSuccess: (result) => {
      setActiveRunId(result.agentRunId);
      setPanelView(PANEL_VIEWS.AGENT);
      queryClient.setQueryData(queryKeys.ai.agentRun(result.agentRunId), (old) => ({
        ...(old || {}),
        _id: result.agentRunId,
        status: result.status || AGENT_STATUSES.PENDING,
        workflowType: result.workflowType,
        threadId: result.threadId,
      }));
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
    },
    onError: (err) => {
      if (err?.code === 'AI_AGENT_RATE_LIMITED') {
        showError(t('ai.chat.tooManyRequests'));
      } else {
        showError(err);
      }
    },
  });

  const confirmMutation = useMutation({
    mutationFn: ({ runId, decision }) => aiAgentService.confirm(runId, decision),
    onSuccess: (_, { decision }) => {
      setPanelView(decision ? PANEL_VIEWS.AGENT : PANEL_VIEWS.RESULT);
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRun(activeRunId) });
    },
    onError: (err) => {
      if (err?.code === 'AI_AGENT_INVALID_STATUS') {
        showError(t('ai.agent.alreadySettled', 'Cannot confirm this run because it has already been cancelled or completed.'));
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRun(activeRunId) });
      } else {
        showError(err);
      }
    },
  });

  const dispatch = useCallback((input) => {
    const trimmed = input?.trim();
    if (!trimmed || trimmed.length < MIN_AGENT_INPUT_LENGTH) return;
    return dispatchMutation.mutateAsync(trimmed);
  }, [dispatchMutation]);

  const confirmRun = useCallback((decision) => {
    if (!activeRunId) return;
    confirmMutation.mutate({ runId: activeRunId, decision });
  }, [activeRunId, confirmMutation]);

  const onAgentRunStarted = useCallback((runId) => {
    setActiveRunId(runId);
    setPanelView(PANEL_VIEWS.AGENT);
  }, [setActiveRunId, setPanelView]);

  const workflowType = runQuery.data?.workflowType;
  const workflowLabel = t(`ai.workflow.${workflowType}`, WORKFLOW_LABELS[workflowType] || t('ai.chat.working'));

  return {
    agentRun: runQuery.data,
    isLoadingRun: runQuery.isLoading,
    workflowLabel,
    dispatch,
    isDispatching: dispatchMutation.isPending,
    confirmRun,
    isConfirming: confirmMutation.isPending,
    onAgentRunStarted,
  };
}
