// Mounted once inside the signed-in navigator (next to the communication runtime): loads
// the signed-in user's call queue and keeps it in line with that user's outbox. It only
// reconciles state; it never dials.
import { useEffect } from 'react';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import { useOperationsStore } from '@/features/communication/store/operationsStore';

import { useCallQueueStore } from '../store/callQueueStore';

/** Reconcile only against the same user's fully loaded outbox (never an empty placeholder). */
export function syncCallQueue() {
  const queueState = useCallQueueStore.getState();
  const ops = useOperationsStore.getState();
  if (!queueState.loaded || !queueState.queue) return;
  if (!ops.loaded || !ops.userId || ops.userId !== queueState.userId) return;
  queueState.sync(ops.operations);
}

export function useCallQueueRuntime() {
  const userId = useSessionStore((state) => state.user?.id ?? null);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    void useCallQueueStore
      .getState()
      .activate(userId)
      .then(() => {
        if (!cancelled) syncCallQueue();
      });
    const unsubscribe = useOperationsStore.subscribe((state, previous) => {
      if (state.operations !== previous.operations || state.loaded !== previous.loaded) syncCallQueue();
    });
    return () => {
      cancelled = true;
      unsubscribe();
      useCallQueueStore.getState().deactivate();
    };
  }, [userId]);
}
