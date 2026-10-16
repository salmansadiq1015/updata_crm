// The active SIM call queue, scoped to ONE signed-in user (same rules as the communication
// outbox): stored under a key suffixed with the user id, loaded only for that user after
// their session is established, deleted on sign-out. One queue at a time.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/constants/storageKeys';
import { logger } from '@/services/logging/logger';

import { reconcile, type CallQueue, type OperationView } from '../domain/queue';

type CallQueueState = {
  userId: string | null;
  loaded: boolean;
  queue: CallQueue | null;
  /** Load the given user's queue, dropping any other user's from memory. */
  activate: (userId: string) => Promise<void>;
  /** Forget the in-memory copy (session ended). The persisted queue stays with its user. */
  deactivate: () => void;
  /** Start (or replace) the active queue. Ignored when it belongs to another user. */
  start: (queue: CallQueue) => void;
  /** Apply a pure change to the active queue. */
  change: (fn: (queue: CallQueue) => CallQueue) => CallQueue | null;
  /** Bring the queue in line with the outbox (only once that outbox has loaded). */
  sync: (operations: Record<string, OperationView>) => void;
  /** Remove the active queue (summary dismissed). */
  clear: () => void;
  /** Sign-out: delete this user's persisted queue. */
  purge: () => Promise<void>;
};

export const queueStorageKey = (userId: string) => `${STORAGE_KEYS.callQueue}.${userId}`;

let writeChain: Promise<void> = Promise.resolve();

function persist(userId: string, queue: CallQueue | null) {
  const key = queueStorageKey(userId);
  // Serialised so an older snapshot never overwrites a newer one.
  writeChain = writeChain
    .then(() =>
      queue ? AsyncStorage.setItem(key, JSON.stringify({ version: 1, queue })) : AsyncStorage.removeItem(key),
    )
    .catch((error: unknown) => logger.error('callQueue.write_failed', { error }));
}

export async function flushCallQueueWrites(): Promise<void> {
  await writeChain;
}

function isQueue(value: unknown, userId: string): value is CallQueue {
  const queue = value as CallQueue | null;
  return Boolean(
    queue &&
      queue.version === 1 &&
      queue.userId === userId &&
      typeof queue.id === 'string' &&
      Array.isArray(queue.items),
  );
}

export const useCallQueueStore = create<CallQueueState>()((set, get) => ({
  userId: null,
  loaded: false,
  queue: null,

  async activate(userId) {
    set({ userId, loaded: false, queue: null });
    let queue: CallQueue | null = null;
    try {
      const raw = await AsyncStorage.getItem(queueStorageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as { version?: number; queue?: unknown };
        if (parsed.version === 1 && isQueue(parsed.queue, userId)) queue = parsed.queue;
      }
    } catch (error) {
      logger.error('callQueue.read_failed', { error });
    }
    // Another user may have signed in while we were reading.
    if (get().userId !== userId) return;
    set({ queue, loaded: true });
  },

  deactivate() {
    set({ userId: null, loaded: false, queue: null });
  },

  start(queue) {
    const { userId } = get();
    if (!userId || queue.userId !== userId) return;
    set({ queue });
    persist(userId, queue);
  },

  change(fn) {
    const { userId, queue } = get();
    if (!userId || !queue || queue.userId !== userId) return null;
    const next = fn(queue);
    if (next === queue) return queue;
    set({ queue: next });
    persist(userId, next);
    return next;
  },

  sync(operations) {
    get().change((queue) => reconcile(queue, operations));
  },

  clear() {
    const { userId } = get();
    if (!userId) return;
    set({ queue: null });
    persist(userId, null);
  },

  async purge() {
    const { userId } = get();
    set({ userId: null, loaded: false, queue: null });
    if (!userId) return;
    await writeChain;
    await AsyncStorage.removeItem(queueStorageKey(userId)).catch((error: unknown) =>
      logger.error('callQueue.purge_failed', { error }),
    );
  },
}));
