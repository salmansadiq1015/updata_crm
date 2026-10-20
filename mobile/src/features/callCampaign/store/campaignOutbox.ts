// Durable, per-user store for SIM call campaign work that must survive app restarts and
// offline periods: (1) the outbox of answer/outcome writes not yet confirmed by the
// server, (2) drafts of what the caller entered for an attempt, (3) where each campaign
// run stands (claimed / dialled) so a restart reconciles instead of redialling.
// Storage: AsyncStorage under a per-user key (same approach as the communication outbox).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { STORAGE_KEYS } from '@/constants/storageKeys';
import { ApiError } from '@/services/api/apiErrors';
import { logger } from '@/services/logging/logger';

import type { AnswerInput, CallOutcome, CompleteInput, Interest } from '../types';

export const MAX_TRIES = 8;

export type OutboxItem = {
  id: string; // `${kind}:${attemptId}` — one pending write of each kind per attempt
  kind: 'answers' | 'complete';
  taskId: string;
  campaignId: string;
  attemptId: string;
  body: { answers: AnswerInput[]; deviceId?: string | null } | CompleteInput;
  createdAt: number;
  tries: number;
  nextAt: number;
  status: 'pending' | 'failed' | 'conflict';
  error: string | null;
};

export type AttemptDraft = {
  attemptId: string;
  taskId: string;
  campaignId: string;
  answers: Record<string, { status: AnswerInput['status']; value?: unknown }>;
  notes: string;
  transcript: string;
  outcome: CallOutcome | null;
  interest: Interest | null;
  callbackDate: string | null; // YYYY-MM-DD in callbackTimezone
  callbackTime: string | null; // HH:MM
  callbackTimezone: string | null;
  callbackReason: string;
  doNotContact: boolean;
  updatedAt: number;
};

export type RunMemo = {
  taskId: string;
  attemptId: string;
  dialedAt: number | null;
  /** The outcome was handed to the outbox (it may still be syncing). */
  recorded: boolean;
};

type State = {
  userId: string | null;
  loaded: boolean;
  items: Record<string, OutboxItem>;
  drafts: Record<string, AttemptDraft>;
  runs: Record<string, RunMemo>; // by campaignId
  activate: (userId: string) => Promise<void>;
  deactivate: () => void;
  enqueue: (item: Omit<OutboxItem, 'id' | 'createdAt' | 'tries' | 'nextAt' | 'status' | 'error'>) => void;
  retryItem: (id: string) => void;
  discardItem: (id: string) => void;
  saveDraft: (
    attemptId: string,
    change: Partial<AttemptDraft> & Pick<AttemptDraft, 'taskId' | 'campaignId'>,
  ) => void;
  setRun: (campaignId: string, memo: RunMemo | null) => void;
  flush: (send: Sender, now?: number) => Promise<FlushResult>;
};

export type Sender = {
  answers: (item: OutboxItem) => Promise<unknown>;
  complete: (item: OutboxItem) => Promise<unknown>;
};
export type FlushResult = {
  sent: number;
  failed: number;
  conflicts: number;
  deferred: number;
  unauthorized: boolean;
};

const storageKey = (userId: string) => `${STORAGE_KEYS.callCampaignOutbox}.${userId}`;
const backoffMs = (tries: number) => Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, tries - 1));

export const emptyDraft = (attemptId: string, taskId: string, campaignId: string): AttemptDraft => ({
  attemptId,
  taskId,
  campaignId,
  answers: {},
  notes: '',
  transcript: '',
  outcome: null,
  interest: null,
  callbackDate: null,
  callbackTime: null,
  callbackTimezone: null,
  callbackReason: '',
  doNotContact: false,
  updatedAt: Date.now(),
});

let writeChain: Promise<void> = Promise.resolve();
function persist(state: Pick<State, 'userId' | 'items' | 'drafts' | 'runs'>) {
  if (!state.userId) return;
  const key = storageKey(state.userId);
  const payload = JSON.stringify({ version: 1, items: state.items, drafts: state.drafts, runs: state.runs });
  writeChain = writeChain
    .then(() => AsyncStorage.setItem(key, payload))
    .catch((error: unknown) => logger.error('callCampaign.outbox.write_failed', { error }));
}
export const flushCampaignOutboxWrites = () => writeChain;

let flushing: Promise<FlushResult> | null = null;

export const useCampaignOutbox = create<State>()((set, get) => {
  const commit = (change: Partial<State>) => {
    set(change);
    persist(get());
  };
  return {
    userId: null,
    loaded: false,
    items: {},
    drafts: {},
    runs: {},

    async activate(userId) {
      set({ userId, loaded: false, items: {}, drafts: {}, runs: {} });
      let restored: Pick<State, 'items' | 'drafts' | 'runs'> = { items: {}, drafts: {}, runs: {} };
      try {
        const raw = await AsyncStorage.getItem(storageKey(userId));
        if (raw) {
          const parsed = JSON.parse(raw) as { version?: number } & Partial<typeof restored>;
          if (parsed.version === 1) {
            restored = { items: parsed.items ?? {}, drafts: parsed.drafts ?? {}, runs: parsed.runs ?? {} };
          }
        }
      } catch (error) {
        logger.error('callCampaign.outbox.read_failed', { error });
      }
      if (get().userId !== userId) return; // another account signed in meanwhile
      set({ ...restored, loaded: true });
    },

    deactivate() {
      set({ userId: null, loaded: false, items: {}, drafts: {}, runs: {} });
    },

    enqueue(input) {
      const id = `${input.kind}:${input.attemptId}`;
      const items = { ...get().items };
      // A completion carries the final answers, so it supersedes a pending answers write.
      if (input.kind === 'complete') delete items[`answers:${input.attemptId}`];
      if (input.kind === 'answers' && items[`complete:${input.attemptId}`]) return;
      items[id] = {
        ...input,
        id,
        createdAt: Date.now(),
        tries: 0,
        nextAt: 0,
        status: 'pending',
        error: null,
      };
      commit({ items });
    },

    retryItem(id) {
      const item = get().items[id];
      if (!item) return;
      commit({
        items: { ...get().items, [id]: { ...item, status: 'pending', nextAt: 0, tries: 0, error: null } },
      });
    },

    discardItem(id) {
      const items = { ...get().items };
      delete items[id];
      commit({ items });
    },

    saveDraft(attemptId, change) {
      const current = get().drafts[attemptId] ?? emptyDraft(attemptId, change.taskId, change.campaignId);
      commit({ drafts: { ...get().drafts, [attemptId]: { ...current, ...change, updatedAt: Date.now() } } });
    },

    setRun(campaignId, memo) {
      const runs = { ...get().runs };
      if (memo) runs[campaignId] = memo;
      else delete runs[campaignId];
      commit({ runs });
    },

    async flush(send, now = Date.now()) {
      if (flushing) return flushing;
      flushing = (async () => {
        const result: FlushResult = { sent: 0, failed: 0, conflicts: 0, deferred: 0, unauthorized: false };
        // Answers before completions of the same attempt; oldest first.
        const queue = Object.values(get().items)
          .filter((i) => i.status === 'pending')
          .sort((a, b) => (a.kind === b.kind ? a.createdAt - b.createdAt : a.kind === 'answers' ? -1 : 1));
        for (const item of queue) {
          if (item.nextAt > now) {
            result.deferred += 1;
            continue;
          }
          try {
            await (item.kind === 'answers' ? send.answers(item) : send.complete(item));
            const items = { ...get().items };
            delete items[item.id];
            const drafts = { ...get().drafts };
            if (item.kind === 'complete') delete drafts[item.attemptId];
            commit({ items, drafts });
            result.sent += 1;
          } catch (error) {
            const e = error instanceof ApiError ? error : null;
            if (e?.isUnauthorized) {
              result.unauthorized = true;
              break; // keep everything; the session layer handles re-auth
            }
            const message =
              e?.details?.[0]?.message ?? (error instanceof Error ? error.message : String(error));
            const tries = item.tries + 1;
            let next: OutboxItem;
            if (e && e.status === 409) {
              next = { ...item, tries, status: 'conflict', error: e.code ?? message };
              result.conflicts += 1;
            } else if (e && e.status !== null && e.status >= 400 && e.status < 500 && e.status !== 429) {
              next = { ...item, tries, status: 'failed', error: message };
              result.failed += 1;
            } else if (tries >= MAX_TRIES) {
              next = { ...item, tries, status: 'failed', error: message };
              result.failed += 1;
            } else {
              next = { ...item, tries, nextAt: now + backoffMs(tries), error: message };
              result.deferred += 1;
            }
            commit({ items: { ...get().items, [item.id]: next } });
          }
        }
        return result;
      })();
      try {
        return await flushing;
      } finally {
        flushing = null;
      }
    },
  };
});

/** Unsynced writes for one campaign / attempt (for "waiting to sync" banners). */
export const selectCampaignItems = (campaignId: string) => (s: State) =>
  Object.values(s.items).filter((i) => i.campaignId === campaignId);
export const selectAttemptPending = (attemptId: string | null) => (s: State) =>
  attemptId ? Object.values(s.items).some((i) => i.attemptId === attemptId) : false;
