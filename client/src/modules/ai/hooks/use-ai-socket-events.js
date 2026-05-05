'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { onSocketConnect } from '@/lib/socket/client';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess } from '@/lib/toast';
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
  const isPanelOpen  = useAiStore((s) => s.isPanelOpen);
  const openPanel    = useAiStore((s) => s.openPanel);

  useEffect(() => {
    const unsubscribe = onSocketConnect((socket) => {
      // Agent run started (dispatched from voice session confirm or text input)
      socket.on('ai:agent:started', ({ agentRunId, workflowType }) => {
        setActiveRunId(agentRunId);
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
      });

      // Agent is paused waiting for user confirmation
      socket.on('ai:agent:awaiting_confirmation', ({ agentRunId }) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRun(agentRunId) });
        // If panel is closed, open it so user can confirm
        if (!isPanelOpen) {
          openPanel();
        }
        setPanelView(PANEL_VIEWS.AGENT_CONFIRMATION);
      });

      // Agent completed successfully
      socket.on('ai:agent:completed', ({ agentRunId, output }) => {
        queryClient.setQueryData(queryKeys.ai.agentRun(agentRunId), (old) =>
          old ? { ...old, status: AGENT_STATUSES.COMPLETED, output } : old
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.ai.agentRuns({}) });
        setPanelView(PANEL_VIEWS.RESULT);
      });

      // Agent failed
      socket.on('ai:agent:failed', ({ agentRunId, error }) => {
        queryClient.setQueryData(queryKeys.ai.agentRun(agentRunId), (old) =>
          old ? { ...old, status: AGENT_STATUSES.FAILED, error } : old
        );
        setPanelView(PANEL_VIEWS.RESULT);
      });

      // Agent cancelled (timeout or user decision)
      socket.on('ai:agent:cancelled', ({ agentRunId }) => {
        queryClient.setQueryData(queryKeys.ai.agentRun(agentRunId), (old) =>
          old ? { ...old, status: AGENT_STATUSES.CANCELLED } : old
        );
        setPanelView(PANEL_VIEWS.RESULT);
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
  }, [queryClient, setActiveRunId, setPanelView, isPanelOpen, openPanel]);
}
