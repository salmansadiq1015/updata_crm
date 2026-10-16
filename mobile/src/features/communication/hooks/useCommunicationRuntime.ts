// Mounted once inside the signed-in navigator: loads the signed-in user's outbox,
// routes native call-state events into it, and flushes on launch, foreground and
// reconnect. Unmounting (sign-out / expiry) drops the in-memory copy.
import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import { telephony } from '@/services/telephony/telephonyService';

import { withCallEvents } from '../domain/operations';
import { reconcileCallEvents, recordAppEvent } from '../services/contactFlows';
import { flushOutbox, stopOutboxTimer } from '../services/outboxSync';
import { useOperationsStore } from '../store/operationsStore';

function activeCallOperations() {
  return Object.values(useOperationsStore.getState().operations).filter(
    (op) => op.channel === 'phone' && (op.phase === 'in_progress' || op.phase === 'dispatch_unknown'),
  );
}

export function useCommunicationRuntime() {
  const userId = useSessionStore((state) => state.user?.id ?? null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void useOperationsStore
      .getState()
      .activate(userId)
      .then(async () => {
        if (cancelled) return;
        await Promise.all(activeCallOperations().map((op) => reconcileCallEvents(op.operationId)));
        await flushOutbox();
      });

    const nativeSubscription = telephony.addCallStateListener((event) => {
      useOperationsStore.getState().update(event.operationId, (op) => withCallEvents(op, [event]));
    });

    let previous = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      const inProgress = Object.values(useOperationsStore.getState().operations).filter(
        (op) => op.phase === 'in_progress',
      );
      if (previous === 'active' && next === 'background') {
        inProgress.forEach((op) => recordAppEvent(op.operationId, 'app_backgrounded'));
      }
      if (previous !== 'active' && next === 'active') {
        inProgress.forEach((op) =>
          recordAppEvent(op.operationId, op.channel === 'sms' ? 'composer_returned' : 'app_foregrounded'),
        );
        void Promise.all(activeCallOperations().map((op) => reconcileCallEvents(op.operationId))).then(() =>
          flushOutbox(),
        );
      }
      previous = next;
    });

    const unsubscribeOnline = onlineManager.subscribe((online) => {
      if (online) void flushOutbox();
    });

    return () => {
      cancelled = true;
      nativeSubscription?.remove();
      appStateSubscription.remove();
      unsubscribeOnline();
      stopOutboxTimer();
      useOperationsStore.getState().deactivate();
    };
  }, [userId]);
}
