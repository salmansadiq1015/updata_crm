// Drives one campaign on this phone: claim the next lead from the server, dial it on the
// user's SIM, follow the call state, capture the outcome, then (with a visible countdown the
// user can stop) move to the next lead. Every decision that matters is re-checked by the
// server; nothing here ever redials on its own after a restart.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { queryKeys } from '@/constants/queryKeys';
import { getDeviceId } from '@/features/smsAgent/domain/agentLoop';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { ApiError } from '@/services/api/apiErrors';
import { logger } from '@/services/logging/logger';
import { telephony, TelephonyError } from '@/services/telephony/telephonyService';
import type { CallStateEvent } from '@/services/telephony/types';

import { callCampaignApi } from '../api/callCampaignApi';
import {
  advanceBlocker,
  callEvidence,
  clampCountdown,
  zonedWallTimeToIso,
  type AdvanceBlocker,
  type CallEvidence,
} from '../domain/campaignDomain';
import { useCampaignOutbox, type AttemptDraft } from '../store/campaignOutbox';
import { flushCampaignOutbox } from './useCampaignOutboxRuntime';
import type { CallCampaign, CallTask, ClaimReason, CompleteInput } from '../types';

export type RunnerPhase =
  | 'loading'
  | 'idle' // no lead right now (reason)
  | 'ready' // a lead is claimed, not dialled
  | 'calling' // dialled; waiting for the call to end
  | 'wrap_up' // call over (or user returned): confirm the outcome
  | 'saved' // outcome recorded; countdown / next
  | 'error';

export type IdleReason = ClaimReason | 'not_running' | 'offline';

const NO_EVIDENCE: CallEvidence = { offhookAt: null, endedAt: null, offhookDurationSec: null, ended: false };

export function useCampaignRunner(campaign: CallCampaign | undefined) {
  const campaignId = campaign?.id ?? '';
  const online = useIsOnline();
  const qc = useQueryClient();
  const outbox = useCampaignOutbox;
  const [phase, setPhase] = useState<RunnerPhase>('loading');
  const [task, setTask] = useState<CallTask | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [idleReason, setIdleReason] = useState<IdleReason | null>(null);
  const [nextAt, setNextAt] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [evidence, setEvidence] = useState<CallEvidence>(NO_EVIDENCE);
  const [dialedAt, setDialedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const events = useRef<CallStateEvent[]>([]);
  const deviceId = useRef<string | null>(null);
  const autoDialNext = useRef(false);
  const dialTaskRef = useRef<(taskId: string, attempt: string, sim: number | null) => Promise<void>>(
    async () => {},
  );
  const campaignRef = useRef(campaign);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.callCampaigns.all });
  }, [qc]);

  const resultSynced = useCampaignOutbox((s) =>
    attemptId
      ? !Object.values(s.items).some((i) => i.attemptId === attemptId && i.kind === 'complete')
      : true,
  );
  // A number, not a new array: a fresh array per call would re-render forever.
  const unresolved = useCampaignOutbox(
    (s) => Object.values(s.items).filter((i) => i.campaignId === campaignId && i.status !== 'pending').length,
  );

  const toIdle = useCallback((reason: IdleReason, at: string | null = null) => {
    setTask(null);
    setAttemptId(null);
    setIdleReason(reason);
    setNextAt(at);
    setPhase('idle');
  }, []);

  /** Ask the server for the next lead (or the one this device already holds). */
  const claim = useCallback(async () => {
    if (!campaignId) return;
    // Always await first: no state changes happen synchronously when claim() starts.
    deviceId.current = await getDeviceId();
    setError(null);
    setCountdown(null);
    if (!online) return toIdle('offline');
    setBusy(true);
    try {
      const res = await callCampaignApi.next(campaignId, deviceId.current);
      if (!res.task) {
        outbox.getState().setRun(campaignId, null);
        refresh();
        return toIdle(res.reason ?? 'queue_empty', res.nextAt ?? null);
      }
      const t = res.task;
      const attempt = t.lock?.attemptId ?? null;
      const serverAttempt = t.attempts.find((a) => a.attemptId === attempt);
      const memo = outbox.getState().runs[campaignId];
      const dialled = serverAttempt?.dialedAt
        ? Date.parse(serverAttempt.dialedAt)
        : memo?.attemptId === attempt
          ? memo.dialedAt
          : null;
      setTask(t);
      setAttemptId(attempt);
      setDialedAt(dialled);
      events.current = [];
      setEvidence(NO_EVIDENCE);
      if (attempt) {
        outbox.getState().saveDraft(attempt, { taskId: t.id, campaignId });
        outbox
          .getState()
          .setRun(campaignId, { taskId: t.id, attemptId: attempt, dialedAt: dialled, recorded: false });
      }
      if (dialled && attempt) {
        // Resumed after a restart/crash: reconcile what the phone recorded; never redial.
        const persisted = await telephony.getPersistedEvents(attempt);
        events.current = persisted;
        setEvidence(callEvidence(persisted, dialled - 5_000));
        setPhase('wrap_up');
      } else {
        setPhase('ready');
        // Optional auto-dial: only right after a countdown, only with the app in the
        // foreground, only for a freshly claimed lead. Android's call screen takes over.
        if (autoDialNext.current && attempt) {
          autoDialNext.current = false;
          if (AppState.currentState === 'active') {
            await dialTaskRef.current(t.id, attempt, campaignRef.current?.subscriptionId ?? null);
          } else {
            logger.info('callCampaign.autodial_skipped_background');
          }
        }
      }
      refresh();
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.code === 'SIM_CALL_CAMPAIGN_NOT_RUNNING') {
        refresh();
        return toIdle('not_running');
      }
      if (err && (err.kind === 'network' || err.kind === 'timeout')) return toIdle('offline');
      setError({ code: err?.code ?? 'UNKNOWN', message: err?.message ?? String(e) });
      setPhase('error');
    } finally {
      setBusy(false);
    }
  }, [campaignId, online, outbox, refresh, toIdle]);

  // First load (and recovery after a restart) once this user's outbox is loaded.
  const loaded = useCampaignOutbox((s) => s.loaded);
  useEffect(() => {
    if (!campaign || phase !== 'loading' || !loaded) return;
    const timer = setTimeout(() => void claim(), 0);
    return () => clearTimeout(timer);
  }, [loaded, campaign, phase, claim]);

  // Follow the call state for the active attempt.
  useEffect(() => {
    if (phase !== 'calling' || !attemptId) return;
    const sub = telephony.addCallStateListener((event) => {
      if (event.operationId !== attemptId) return;
      events.current = [...events.current, event];
      const ev = callEvidence(events.current, (dialedAt ?? 0) - 5_000);
      setEvidence(ev);
      if (ev.ended) {
        void telephony.stopMonitoring();
        setPhase('wrap_up');
      }
    });
    return () => sub?.remove();
  }, [phase, attemptId, dialedAt]);

  /** Dial a claimed lead on the chosen SIM (the server re-checks first and gives the number). */
  const dialTask = useCallback(
    async (taskId: string, attempt: string, subscriptionId: number | null) => {
      if (!deviceId.current) return;
      setError(null);
      setBusy(true);
      try {
        const { dialNumber } = await callCampaignApi.dial(taskId, {
          attemptId: attempt,
          deviceId: deviceId.current,
          subscriptionId,
        });
        const at = Date.now();
        await telephony.startMonitoring(attempt);
        setDialedAt(at);
        outbox.getState().setRun(campaignId, { taskId, attemptId: attempt, dialedAt: at, recorded: false });
        setPhase('calling');
        await telephony.placeCall({
          number: dialNumber,
          subscriptionId: subscriptionId ?? undefined,
          operationId: attempt,
        });
      } catch (e) {
        if (e instanceof TelephonyError) {
          // The phone could not place the call: record it as failed (nothing reached the network).
          await telephony.stopMonitoring();
          outbox.getState().saveDraft(attempt, { taskId, campaignId, outcome: 'failed', notes: e.message });
          setPhase('wrap_up');
          setError({ code: e.code, message: e.message });
          return;
        }
        const err = e instanceof ApiError ? e : null;
        setError({ code: err?.code ?? 'UNKNOWN', message: err?.message ?? String(e) });
        if (err?.code === 'SIM_CALL_CAMPAIGN_NOT_RUNNING') {
          toIdle('not_running');
          refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [campaignId, outbox, toIdle, refresh],
  );
  useEffect(() => {
    dialTaskRef.current = dialTask;
    campaignRef.current = campaign;
  });
  const dial = useCallback(
    (subscriptionId: number | null) =>
      task && attemptId ? dialTask(task.id, attemptId, subscriptionId) : Promise.resolve(),
    [task, attemptId, dialTask],
  );

  /** The user says the call is over (no call-state evidence needed; evidence = user). */
  const confirmCallEnded = useCallback(() => {
    void telephony.stopMonitoring();
    setPhase('wrap_up');
  }, []);

  /** Save the partial answers now (server + local draft); never overwrites other answers. */
  const saveAnswers = useCallback(
    (draft: AttemptDraft) => {
      if (!task || !attemptId) return;
      const answers = Object.entries(draft.answers).map(([fieldKey, a]) => ({
        fieldKey,
        status: a.status,
        value: a.value ?? null,
      }));
      if (!answers.length) return;
      outbox.getState().enqueue({
        kind: 'answers',
        taskId: task.id,
        campaignId,
        attemptId,
        body: { answers, deviceId: deviceId.current },
      });
      if (online) void flushCampaignOutbox();
    },
    [task, attemptId, campaignId, outbox, online],
  );

  /** Record the confirmed outcome (outbox → server). Returns a validation message or null. */
  const submit = useCallback(
    async (draft: AttemptDraft): Promise<string | null> => {
      if (!task || !attemptId || !draft.outcome) return 'outcome';
      let callback: CompleteInput['callback'] = null;
      if (draft.outcome === 'callback_requested') {
        const tz = draft.callbackTimezone ?? campaign?.settings.timezone ?? 'UTC';
        const at =
          draft.callbackDate && draft.callbackTime
            ? zonedWallTimeToIso(draft.callbackDate, draft.callbackTime, tz)
            : null;
        if (!at) return 'callback_time';
        if (Date.parse(at) < Date.now()) return 'callback_past';
        callback = { at, timezone: tz, reason: draft.callbackReason };
      }
      const body: CompleteInput = {
        attemptId,
        outcome: draft.outcome,
        interest: draft.outcome === 'answered' ? draft.interest : null,
        answers: Object.entries(draft.answers).map(([fieldKey, a]) => ({
          fieldKey,
          status: a.status,
          value: a.value ?? null,
        })),
        notes: draft.notes,
        transcript: draft.transcript,
        callback,
        doNotContact: draft.doNotContact,
        call: {
          evidence: evidence.ended ? 'call_state' : 'user',
          offhookAt: evidence.offhookAt ? new Date(evidence.offhookAt).toISOString() : null,
          endedAt: evidence.endedAt ? new Date(evidence.endedAt).toISOString() : null,
          offhookDurationSec: evidence.offhookDurationSec,
          durationSec: null,
        },
      };
      outbox.getState().enqueue({ kind: 'complete', taskId: task.id, campaignId, attemptId, body });
      const memo = outbox.getState().runs[campaignId];
      if (memo) outbox.getState().setRun(campaignId, { ...memo, recorded: true });
      setPhase('saved');
      if (online) {
        await flushCampaignOutbox(refresh);
      }
      return null;
    },
    [task, attemptId, campaign, campaignId, evidence, outbox, online, refresh],
  );

  /** Skip the claimed lead (only before it was dialled). */
  const skip = useCallback(async () => {
    if (!task || !attemptId) return;
    setBusy(true);
    try {
      await callCampaignApi.skip(task.id, { attemptId, deviceId: deviceId.current, reason: 'user' });
      outbox.getState().setRun(campaignId, null);
      refresh();
      await claim();
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setError({ code: err?.code ?? 'UNKNOWN', message: err?.message ?? String(e) });
    } finally {
      setBusy(false);
    }
  }, [task, attemptId, campaignId, outbox, refresh, claim]);

  const blocker: AdvanceBlocker | null = advanceBlocker({
    campaignStatus: campaign?.status ?? null,
    online,
    resultSynced,
    callEnded: phase === 'saved',
    outcomeRecorded: phase === 'saved',
    userPaused,
  });

  // Countdown to the next lead once the result is safely on the server. It (re)starts
  // whenever nothing blocks progression and stops while anything does.
  const countdownSeconds = clampCountdown(campaign?.settings.countdownSeconds ?? 10);
  const blockerRef = useRef(blocker);
  useEffect(() => {
    blockerRef.current = blocker;
  });
  useEffect(() => {
    if (phase !== 'saved') return;
    let readyAt: number | null = null;
    const timer = setInterval(() => {
      if (blockerRef.current) {
        readyAt = null;
        setCountdown(null);
        return;
      }
      const now = Date.now();
      readyAt ??= now;
      const left = countdownSeconds - Math.floor((now - readyAt) / 1000);
      if (left > 0) {
        setCountdown(left);
        return;
      }
      clearInterval(timer);
      setCountdown(null);
      autoDialNext.current = Boolean(campaignRef.current?.settings.autoDial);
      void claim();
    }, 250);
    return () => clearInterval(timer);
  }, [phase, countdownSeconds, claim]);

  return {
    phase,
    task,
    attemptId,
    idleReason,
    nextAt,
    error,
    evidence,
    dialedAt,
    countdown,
    blocker,
    busy,
    online,
    resultSynced,
    unresolved,
    userPaused,
    claim,
    dial,
    confirmCallEnded,
    saveAnswers,
    submit,
    skip,
    pauseSequence: () => setUserPaused(true),
    resumeSequence: () => setUserPaused(false),
    nextNow: () => {
      setCountdown(null);
      void claim();
    },
  };
}
