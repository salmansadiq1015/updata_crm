import { useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback, useState } from 'react';

import { queryKeys } from '@/constants/queryKeys';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { communicationApi } from '@/features/communication/api/communicationApi';
import type { DestinationField } from '@/features/communication/types';
import { leadsApi } from '@/features/leads/api/leadsApi';

import { ReplaceQueueDialog } from '../components/ReplaceQueueDialog';
import { createQueue, isFinished, progress } from '../domain/queue';
import { useCallQueueStore } from '../store/callQueueStore';

export type QueueLead = { id: string; name: string };

/** The active queue (`null` when none), with its progress when there is one. */
export function useActiveCallQueue() {
  const queue = useCallQueueStore((state) => state.queue);
  return { queue, progress: queue ? progress(queue) : null, finished: queue ? isFinished(queue) : false };
}

/**
 * Starts a queue for an explicit, ordered lead list. With an unfinished queue already
 * active, asks first: continue that one, or replace it. `onOpen` shows the queue screen.
 * Render `dialog` somewhere in the calling screen.
 */
export function useStartCallQueue(onOpen: () => void) {
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const [pending, setPending] = useState<QueueLead[] | null>(null);
  const existing = useCallQueueStore((state) => state.queue);

  const begin = useCallback(
    (leads: readonly QueueLead[]) => {
      if (!userId) return;
      useCallQueueStore.getState().start(createQueue({ id: randomUUID(), userId, leads, now: Date.now() }));
      onOpen();
    },
    [userId, onOpen],
  );

  const start = useCallback(
    (leads: readonly QueueLead[]) => {
      if (leads.length === 0 || !userId) return;
      const active = useCallQueueStore.getState().queue;
      if (active && !isFinished(active)) {
        setPending([...leads]);
        return;
      }
      begin(leads);
    },
    [userId, begin],
  );

  const dialog = (
    <ReplaceQueueDialog
      visible={pending !== null && existing !== null}
      progress={existing ? progress(existing) : null}
      onCancel={() => setPending(null)}
      onResume={() => {
        setPending(null);
        onOpen();
      }}
      onReplace={() => {
        const leads = pending;
        setPending(null);
        if (leads) begin(leads);
      }}
    />
  );

  return { start, dialog };
}

export type QueueEligibility = {
  eligible: boolean;
  reasons: string[];
  /** The number field the CRM accepted (mobile preferred, like the call screen). */
  field: DestinationField | null;
  destinationMasked: string | null;
};

/**
 * Can the lead be called? Uses the CRM's eligibility check for each number the lead has
 * (mobile first). A preview only: the CRM checks again before anything is dialed.
 */
export function useQueueEligibility(leadId: string | null, enabled: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ['callQueue', 'eligibility', leadId],
    enabled: Boolean(leadId) && enabled,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }): Promise<QueueEligibility> => {
      const id = leadId!;
      const lead = await client.fetchQuery({
        queryKey: queryKeys.leads.detail(id),
        queryFn: () => leadsApi.get(id, signal),
      });
      const fields = (['mobile', 'phone'] as const).filter((field) => Boolean(lead[field]));
      if (fields.length === 0)
        return { eligible: false, reasons: ['NO_DESTINATION'], field: null, destinationMasked: null };
      const reasons: string[] = [];
      for (const field of fields) {
        const result = await communicationApi.eligibility(id, 'phone', field, signal);
        if (result.eligible)
          return { eligible: true, reasons: [], field, destinationMasked: result.destinationMasked };
        reasons.push(...result.reasons);
      }
      return {
        eligible: false,
        reasons: [...new Set(reasons.length > 0 ? reasons : ['NO_DESTINATION'])],
        field: null,
        destinationMasked: null,
      };
    },
  });
}
