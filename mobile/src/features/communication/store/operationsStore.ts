// Durable outbox of contact attempts, scoped to ONE signed-in user. Each user's
// operations live under their own storage key and are loaded only after that user's
// session is established, so queued work can never be sent with another account's
// token, and a late write for a previous account cannot land in the current one.
// Storage: AsyncStorage on the device (Auto Backup is disabled for this app); deleted on
// sign-out, kept across a forced session expiry so the same user can finish syncing.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/constants/storageKeys';
import { logger } from '@/services/logging/logger';

import { recoverOnLaunch, type LocalOperation } from '../domain/operations';

const MAX_KEPT_DONE = 30;

type OperationsState = {
  userId: string | null;
  loaded: boolean;
  operations: Record<string, LocalOperation>;
  /** Load (and recover) the given user's operations, dropping any other user's from memory. */
  activate: (userId: string) => Promise<void>;
  /** Forget the in-memory copy (sign-out). Persisted work stays with its own user. */
  deactivate: () => void;
  put: (op: LocalOperation) => void;
  update: (operationId: string, change: (op: LocalOperation) => LocalOperation) => LocalOperation | null;
  remove: (operationId: string) => void;
  /** Sign-out: delete this user's persisted outbox (the user confirmed losing unsynced work). */
  purge: () => Promise<void>;
};

const storageKey = (userId: string) => `${STORAGE_KEYS.communicationOperations}.${userId}`;

function prune(operations: Record<string, LocalOperation>): Record<string, LocalOperation> {
  const done = Object.values(operations)
    .filter((op) => (op.phase === 'done' || op.phase === 'abandoned') && op.pendingEvents.length === 0)
    .sort((a, b) => b.createdAt - a.createdAt);
  const drop = new Set(done.slice(MAX_KEPT_DONE).map((op) => op.operationId));
  return Object.fromEntries(Object.entries(operations).filter(([id]) => !drop.has(id)));
}

let writeChain: Promise<void> = Promise.resolve();

function persist(userId: string, operations: Record<string, LocalOperation>) {
  const payload = JSON.stringify({ version: 1, operations: prune(operations) });
  // Serialise writes so an older snapshot never overwrites a newer one.
  writeChain = writeChain
    .then(() => AsyncStorage.setItem(storageKey(userId), payload))
    .catch((error: unknown) => logger.error('communication.outbox.write_failed', { error }));
}

export async function flushOperationsWrites(): Promise<void> {
  await writeChain;
}

export const useOperationsStore = create<OperationsState>()((set, get) => ({
  userId: null,
  loaded: false,
  operations: {},

  async activate(userId) {
    set({ userId, loaded: false, operations: {} });
    let operations: Record<string, LocalOperation> = {};
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as { version?: number; operations?: Record<string, LocalOperation> };
        if (parsed.version === 1 && parsed.operations) operations = parsed.operations;
      }
    } catch (error) {
      logger.error('communication.outbox.read_failed', { error });
    }
    // Another user may have signed in while we were reading.
    if (get().userId !== userId) return;
    const recovered = Object.fromEntries(
      Object.entries(operations)
        .filter(([, op]) => op.userId === userId)
        .map(([id, op]) => [id, recoverOnLaunch(op)]),
    );
    set({ operations: recovered, loaded: true });
    persist(userId, recovered);
  },

  deactivate() {
    set({ userId: null, loaded: false, operations: {} });
  },

  put(op) {
    const { userId, operations } = get();
    if (!userId || op.userId !== userId) return;
    const next = { ...operations, [op.operationId]: op };
    set({ operations: next });
    persist(userId, next);
  },

  update(operationId, change) {
    const { userId, operations } = get();
    const current = operations[operationId];
    if (!userId || !current || current.userId !== userId) return null;
    const updated = change(current);
    const next = { ...operations, [operationId]: updated };
    set({ operations: next });
    persist(userId, next);
    return updated;
  },

  remove(operationId) {
    const { userId, operations } = get();
    if (!userId || !operations[operationId]) return;
    const next = { ...operations };
    delete next[operationId];
    set({ operations: next });
    persist(userId, next);
  },

  async purge() {
    const { userId } = get();
    set({ userId: null, loaded: false, operations: {} });
    if (!userId) return;
    await writeChain;
    await AsyncStorage.removeItem(storageKey(userId)).catch((error: unknown) =>
      logger.error('communication.outbox.purge_failed', { error }),
    );
  },
}));

export function getOperation(operationId: string): LocalOperation | null {
  return useOperationsStore.getState().operations[operationId] ?? null;
}
