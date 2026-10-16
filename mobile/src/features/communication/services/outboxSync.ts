// The single retry engine for communication records. TanStack mutations never retry,
// and the native layer only records state; only this module re-sends CRM writes, and only
// the idempotent ones (event batches, outcome completion). It never dials or opens a
// composer: those side effects are not replayable.
import { queryClient } from '@/app/queryClient';
import { queryKeys } from '@/constants/queryKeys';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { logger } from '@/services/logging/logger';

import { communicationApi } from '../api/communicationApi';
import { afterReceipt, afterSyncFailure, classifySyncError, needsSync } from '../domain/operations';
import { getOperation, useOperationsStore } from '../store/operationsStore';

const EVENT_BATCH = 100;

let flushing: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function activeUserId(): string | null {
  const storeUser = useOperationsStore.getState().userId;
  const sessionUser = useSessionStore.getState().user?.id ?? null;
  return storeUser && storeUser === sessionUser ? storeUser : null;
}

async function syncOne(operationId: string, userId: string): Promise<void> {
  const store = useOperationsStore.getState();
  let op = getOperation(operationId);
  if (!op) return;
  try {
    while (op && op.pendingEvents.length > 0) {
      const batch = op.pendingEvents.slice(0, EVENT_BATCH);
      await communicationApi.appendEvents(op.leadId, operationId, batch);
      // A response that arrives after the account changed must not touch the new account.
      if (activeUserId() !== userId) return;
      const sent = new Set(batch.map((event) => event.seq));
      op = store.update(operationId, (current) => ({
        ...current,
        pendingEvents: current.pendingEvents.filter((event) => !sent.has(event.seq)),
        sync: { ...current.sync, attempts: 0, lastError: null },
      }));
    }
    if (op?.phase === 'submitting' && op.completePayload) {
      const { receipt } = await communicationApi.complete(op.leadId, operationId, op.completePayload);
      if (activeUserId() !== userId) return;
      store.update(operationId, (current) => afterReceipt(current, receipt));
      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.communication.all });
    }
  } catch (error) {
    if (activeUserId() !== userId) return;
    const classified = classifySyncError(error);
    logger.warn('communication.sync_failed', {
      kind: classified.kind,
      status: classified.status,
      code: classified.code,
    });
    store.update(operationId, (current) => afterSyncFailure(current, classified, Date.now()));
  }
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  timer = null;
  const now = Date.now();
  const waits = Object.values(useOperationsStore.getState().operations)
    .filter(
      (op) =>
        op.serverConfirmed && !op.sync.paused && (op.pendingEvents.length > 0 || op.phase === 'submitting'),
    )
    .map((op) => Math.max(0, op.sync.nextAttemptAt - now));
  if (waits.length === 0) return;
  timer = setTimeout(() => void flushOutbox(), Math.max(1_000, Math.min(...waits)));
}

/** Send every due operation of the signed-in user. Concurrent calls share one run. */
export function flushOutbox(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const userId = activeUserId();
    if (!userId) return;
    const now = Date.now();
    const due = Object.values(useOperationsStore.getState().operations).filter((op) => needsSync(op, now));
    for (const op of due) {
      if (activeUserId() !== userId) return;
      await syncOne(op.operationId, userId);
    }
  })().finally(() => {
    flushing = null;
    scheduleNext();
  });
  return flushing;
}

/** User action on a paused or failed operation: try again now. */
export function retryOperation(operationId: string): Promise<void> {
  useOperationsStore.getState().update(operationId, (op) => ({
    ...op,
    phase: op.phase === 'needs_attention' && op.completePayload ? 'submitting' : op.phase,
    sync: { ...op.sync, paused: false, nextAttemptAt: 0 },
  }));
  return flushOutbox();
}

export function stopOutboxTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}
