'use client';

import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';
import { aiAgentService } from '../services/ai-agent-service';
import { useAiStore } from '../store/ai-store';
import {
  PANEL_VIEWS,
  AGENT_STATUSES,
  AGENT_POLL_INTERVAL_MS,
  WORKFLOW_LABELS,
  isTerminalAgentStatus,
} from '../constants/ai-constants';

export function useAgentRun() {
  const queryClient  = useQueryClient();
  const isPanelOpen  = useAiStore((s) => s.isPanelOpen);
  const activeRunId  = useAiStore((s) => s.activeRunId);
  const setActiveRunId = useAiStore((s) => s.setActiveRunId);
  const setPanelView = useAiStore((s) => s.setPanelView);

  // Poll agent run while in non-terminal state and panel is open
  const runQuery = useQuery({
    queryKey: queryKeys.ai.agentRun(activeRunId),
    queryFn:  () => aiAgentService.getStatus(activeRunId),
    enabled:  !!activeRunId,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || isTerminalAgentStatus(status)) return false;
      if (!isPanelOpen) return false;
      return AGENT_POLL_INTERVAL_MS;
    },
  });

  const runStatus = runQuery.data?.status;

  // Auto-advance panel based on agent run status
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

  // Dispatch new agent run from text input
  const dispatchMutation = useMutation({
    mutationFn: (input) => aiAgentService.dispatch(input),
    onSuccess: (result) => {
      setActiveRunId(result.agentRunId);
      setPanelView(PANEL_VIEWS.AGENT);
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
    },
    onError: (err) => {
      const code = err?.code;
      if (code === 'AI_AGENT_RATE_LIMITED') {
        showError('Too many requests — please wait a minute before trying again.');
      } else {
        showError(err);
      }
    },
  });

  // Confirm or cancel an awaiting agent run
  const confirmMutation = useMutation({
    mutationFn: ({ runId, decision }) => aiAgentService.confirm(runId, decision),
    onSuccess: (result, { decision }) => {
      if (decision) {
        setPanelView(PANEL_VIEWS.AGENT);
      } else {
        setPanelView(PANEL_VIEWS.RESULT);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRun(activeRunId) });
    },
    onError: (err) => {
      const code = err?.code;
      if (code === 'AI_AGENT_INVALID_STATUS') {
        showError("Can't confirm this run — it may have already been cancelled or completed.");
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRun(activeRunId) });
      } else {
        showError(err);
      }
    },
  });

  const dispatch = useCallback((input) => {
    const trimmed = input?.trim();
    if (!trimmed || trimmed.length < 3) return;
    dispatchMutation.mutate(trimmed);
  }, [dispatchMutation]);

  const confirmRun = useCallback((decision) => {
    if (!activeRunId) return;
    confirmMutation.mutate({ runId: activeRunId, decision });
  }, [activeRunId, confirmMutation]);

  const onAgentRunStarted = useCallback((runId) => {
    setActiveRunId(runId);
    setPanelView(PANEL_VIEWS.AGENT);
  }, [setActiveRunId, setPanelView]);

  const workflowLabel = WORKFLOW_LABELS[runQuery.data?.workflowType] || 'Working on it';

  return {
    agentRun:       runQuery.data,
    isLoadingRun:   runQuery.isLoading,
    workflowLabel,
    dispatch,
    isDispatching:  dispatchMutation.isPending,
    confirmRun,
    isConfirming:   confirmMutation.isPending,
    onAgentRunStarted,
  };
}
