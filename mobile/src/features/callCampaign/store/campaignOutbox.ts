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
import type { QualificationAnswer } from '@/features/communication/types';

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
  qualificationAnswers?: QualificationAnswer[];
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
  storageError: boolean;
  retryStorage: () => Promise<void>;
  items: Record<string, OutboxItem>;
  drafts: Record<string, AttemptDraft>;
  runs: Record<string, RunMemo>; // by campaignId
  /** This phone's "call the next lead automatically" choice, by campaignId. */
  autoCall: Record<string, boolean>;
  /** The SIM last chosen for a campaign on this phone (subscription id), by campaignId. */
  sims: Record<string, number>;
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
  setAutoCall: (campaignId: string, on: boolean) => void;
  setSim: (campaignId: string, subscriptionId: number) => void;
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
function persist(
  state: Pick<State, 'userId' | 'loaded' | 'items' | 'drafts' | 'runs' | 'autoCall' | 'sims'>,
) {
  if (!state.userId || !state.loaded) return;
  const epoch = sessionEpoch;
  const key = storageKey(state.userId);
  const payload = JSON.stringify({
    version: 1,
    items: state.items,
    drafts: state.drafts,
    runs: state.runs,
    autoCall: state.autoCall,
    sims: state.sims,
  });
  writeChain = writeChain
    .then(async () => {
      await AsyncStorage.setItem(key, payload);
      if (sessionEpoch === epoch) useCampaignOutbox.setState({ storageError: false });
    })
    .catch((error: unknown) => {
      if (sessionEpoch === epoch) useCampaignOutbox.setState({ storageError: true });
      logger.error('callCampaign.outbox.write_failed', { error });
    });
}
export const flushCampaignOutboxWrites = () => writeChain;

let sessionEpoch = 0;
let flushing: { epoch: number; promise: Promise<FlushResult> } | null = null;

export const useCampaignOutbox = create<State>()((set, get) => {
  const commit = (change: Partial<State>) => {
    set(change);
    persist(get());
  };
  return {
    userId: null,
    loaded: false,
    storageError: false,
    async retryStorage() {
      if (!get().loaded && get().userId) {
        await get().activate(get().userId!);
        return;
      }
      persist(get());
      await flushCampaignOutboxWrites();
    },
    items: {},
    drafts: {},
    runs: {},
    autoCall: {},
    sims: {},

    async activate(userId) {
      const epoch = ++sessionEpoch;
      set({
        userId,
        loaded: false,
        storageError: false,
        items: {},
        drafts: {},
        runs: {},
        autoCall: {},
        sims: {},
      });
      let storageError = false;
      let restored: Pick<State, 'items' | 'drafts' | 'runs' | 'autoCall' | 'sims'> = {
        items: {},
        drafts: {},
        runs: {},
        autoCall: {},
        sims: {},
      };
      try {
        await flushCampaignOutboxWrites();
        const raw = await AsyncStorage.getItem(storageKey(userId));
        if (raw) {
          const parsed = JSON.parse(raw) as { version?: number } & Partial<typeof restored>;
          if (parsed.version === 1) {
            restored = {
              items: parsed.items ?? {},
              drafts: parsed.drafts ?? {},
              runs: parsed.runs ?? {},
              autoCall: parsed.autoCall ?? {},
              sims: parsed.sims ?? {},
            };
          }
        }
      } catch (error) {
        storageError = true;
        logger.error('callCampaign.outbox.read_failed', { error });
      }
      if (sessionEpoch !== epoch) return; // includes signing out and back into the same account
      set({ ...restored, loaded: !storageError, storageError });
    },

    deactivate() {
      sessionEpoch += 1;
      set({
        userId: null,
        loaded: false,
        storageError: false,
        items: {},
        drafts: {},
        runs: {},
        autoCall: {},
        sims: {},
      });
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

    setAutoCall(campaignId, on) {
      commit({ autoCall: { ...get().autoCall, [campaignId]: on } });
    },

    setSim(campaignId, subscriptionId) {
      commit({ sims: { ...get().sims, [campaignId]: subscriptionId } });
    },

    async flush(send, now = Date.now()) {
      const epoch = sessionEpoch;
      if (flushing?.epoch === epoch) return flushing.promise;
      const promise = (async () => {
        const result: FlushResult = { sent: 0, failed: 0, conflicts: 0, deferred: 0, unauthorized: false };
        if (!get().loaded || !get().userId) return result;
        // Answers before completions of the same attempt; oldest first.
        const queue = Object.values(get().items)
          .filter((i) => i.status === 'pending')
          .sort((a, b) => (a.kind === b.kind ? a.createdAt - b.createdAt : a.kind === 'answers' ? -1 : 1));
        for (const item of queue) {
          if (sessionEpoch !== epoch) break;
          // An edit/completion/discard may have superseded this captured queue entry.
          if (get().items[item.id] !== item) continue;
          if (item.nextAt > now) {
            result.deferred += 1;
            continue;
          }
          try {
            await (item.kind === 'answers' ? send.answers(item) : send.complete(item));
            if (sessionEpoch !== epoch) break;
            if (get().items[item.id] !== item) continue;
            const items = { ...get().items };
            delete items[item.id];
            const drafts = { ...get().drafts };
            if (item.kind === 'complete') delete drafts[item.attemptId];
            commit({ items, drafts });
            result.sent += 1;
          } catch (error) {
            if (sessionEpoch !== epoch) break;
            if (get().items[item.id] !== item) continue;
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
      const flight = { epoch, promise };
      flushing = flight;
      try {
        return await promise;
      } finally {
        if (flushing === flight) flushing = null;
      }
    },
  };
});

/** Unsynced writes for one campaign / attempt (for "waiting to sync" banners). */
export const selectCampaignItems = (campaignId: string) => (s: State) =>
  Object.values(s.items).filter((i) => i.campaignId === campaignId);
export const selectAttemptPending = (attemptId: string | null) => (s: State) =>
  attemptId ? Object.values(s.items).some((i) => i.attemptId === attemptId) : false;
