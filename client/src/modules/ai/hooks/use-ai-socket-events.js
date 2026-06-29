'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onSocketConnect } from '@/lib/socket/client';
import { queryKeys } from '@/lib/query/keys';
import { useAiStore } from '../store/ai-store';
import { PANEL_VIEWS, AGENT_STATUSES } from '../constants/ai-constants';

/**
 * Registers Socket.io listeners for AI agent lifecycle events.
 * Should be mounted once inside AiAssistantPanel.
 */
export function useAiSocketEvents() {
  const queryClient  = useQueryClient();
  const setActiveRunId = useAiStore((s) => s.setActiveRunId);
  const setPanelView = useAiStore((s) => s.setPanelView);

  useEffect(() => {
    const unsubscribe = onSocketConnect((socket) => {
      // Agent run started (dispatched from voice session confirm or text input)
      socket.on('ai:agent:started', ({ agentRunId, workflowType }) => {
        setActiveRunId(agentRunId);
        queryClient.setQueryData(queryKeys.ai.agentRun(agentRunId), (old) => ({
          ...(old || {}),
          _id: agentRunId,
          status: old?.status || AGENT_STATUSES.PENDING,
          workflowType: workflowType || old?.workflowType,
        }));
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });

        if (useAiStore.getState().isPanelOpen) {
          setPanelView(PANEL_VIEWS.AGENT);
        }
      });

      // Agent is paused waiting for user confirmation
      socket.on('ai:agent:awaiting_confirmation', ({ agentRunId, summary }) => {
        setActiveRunId(agentRunId);
        queryClient.setQueryData(queryKeys.ai.agentRun(agentRunId), (old) => ({
          ...(old || {}),
          _id: agentRunId,
          status: AGENT_STATUSES.AWAITING_CONFIRMATION,
          summary,
        }));
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRun(agentRunId) });

        if (!useAiStore.getState().isPanelOpen) {
          useAiStore.getState().openPanel();
        }
        setPanelView(PANEL_VIEWS.AGENT_CONFIRMATION);
      });

      // Agent completed successfully
      socket.on('ai:agent:completed', ({ agentRunId, output }) => {
        const state = useAiStore.getState();
        const isFocusedRun = state.activeRunId === agentRunId;
        queryClient.setQueryData(queryKeys.ai.agentRun(agentRunId), (old) =>
          ({ ...(old || {}), _id: agentRunId, status: AGENT_STATUSES.COMPLETED, output })
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
        if (isFocusedRun) {
          setActiveRunId(agentRunId);
          setPanelView(PANEL_VIEWS.RESULT);
        }
      });

      // Agent failed
      socket.on('ai:agent:failed', ({ agentRunId, error }) => {
        const state = useAiStore.getState();
        const isFocusedRun = state.activeRunId === agentRunId;
        queryClient.setQueryData(queryKeys.ai.agentRun(agentRunId), (old) =>
          ({ ...(old || {}), _id: agentRunId, status: AGENT_STATUSES.FAILED, error })
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
        if (isFocusedRun) {
          setActiveRunId(agentRunId);
          setPanelView(PANEL_VIEWS.RESULT);
        }
      });

      // Agent cancelled (timeout or user decision)
      socket.on('ai:agent:cancelled', ({ agentRunId }) => {
        const state = useAiStore.getState();
        const isFocusedRun = state.activeRunId === agentRunId;
        queryClient.setQueryData(queryKeys.ai.agentRun(agentRunId), (old) =>
          ({ ...(old || {}), _id: agentRunId, status: AGENT_STATUSES.CANCELLED })
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
        if (isFocusedRun) {
          setActiveRunId(agentRunId);
          setPanelView(PANEL_VIEWS.RESULT);
        }
      });

      return () => {
        socket.off('ai:agent:started');
        socket.off('ai:agent:awaiting_confirmation');
        socket.off('ai:agent:completed');
        socket.off('ai:agent:failed');
        socket.off('ai:agent:cancelled');
      };
    });

    return () => unsubscribe();
  }, [queryClient, setActiveRunId, setPanelView]);
}
