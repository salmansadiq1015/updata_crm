'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { onSocketConnect } from '@/lib/socket/client';

/**
 * Live push updates for the AI-calling dashboard. The server emits
 * `ai-calling:summary | :call | :answer` to the authenticated user's own socket
 * room (`user:<id>`), which the socket auto-joins on connect — so we only need to
 * listen. Events fire rapidly during an active call (one per answer), so cache
 * invalidation is debounced to avoid refetch storms; TanStack Query then pulls
 * the authoritative state. Pass a campaignId to narrow which queries refresh.
 */
const AI_CALLING_EVENTS = ['ai-calling:summary', 'ai-calling:call', 'ai-calling:answer', 'ai-calling:transcript', 'ai-calling:activity'] as const;

export function useAiCallingRealtime(campaignId?: string | null) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleRefresh = (payload: { campaignId?: string } = {}) => {
      // Ignore events for other campaigns when scoped to one.
      if (campaignId && payload.campaignId && payload.campaignId !== campaignId) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (campaignId) qc.invalidateQueries({ queryKey: ['ai-calling', 'campaign', campaignId] });
        qc.invalidateQueries({ queryKey: ['ai-calling', 'campaigns'] });
        qc.invalidateQueries({ queryKey: ['ai-calling', 'agents'] });
        qc.invalidateQueries({ queryKey: ['ai-calling', 'agent'] });
        qc.invalidateQueries({ queryKey: ['ai-calling', 'analytics'] });
        qc.invalidateQueries({ queryKey: ['ai-calling', 'calls'] });
        qc.invalidateQueries({ queryKey: ['ai-calling', 'call'] });
        qc.invalidateQueries({ queryKey: campaignId ? ['ai-calling', 'active-calls', campaignId] : ['ai-calling', 'active-calls'] });
        qc.invalidateQueries({ queryKey: campaignId ? ['ai-calling', 'run-status', campaignId] : ['ai-calling', 'run-status'] });
        if (campaignId) qc.invalidateQueries({ queryKey: ['ai-calling', 'recipients', campaignId] });
      }, 800);
    };

    // Track the socket(s) we attached to so cleanup removes OUR listeners —
    // otherwise every drawer open adds another set that is never released.
    const attached = new Set<Socket>();
    const unsubscribe = onSocketConnect((socket: Socket) => {
      for (const event of AI_CALLING_EVENTS) {
        socket.off(event, scheduleRefresh);
        socket.on(event, scheduleRefresh);
      }
      attached.add(socket);
    });

    return () => {
      unsubscribe();
      for (const socket of attached) {
        for (const event of AI_CALLING_EVENTS) socket.off(event, scheduleRefresh);
      }
      attached.clear();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qc, campaignId]);
}
