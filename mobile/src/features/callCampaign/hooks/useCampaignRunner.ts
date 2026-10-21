// Drives one campaign on this phone: claim the next lead from the server, dial it on the
// user's SIM, follow the call state, capture the outcome, then (with a visible countdown the
// user can stop) move to the next lead. Every decision that matters is re-checked by the
// server; nothing here ever redials on its own after a restart.
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, PermissionsAndroid } from 'react-native';

import { queryKeys } from '@/constants/queryKeys';
import { getDeviceId } from '@/features/smsAgent/domain/agentLoop';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { ApiError } from '@/services/api/apiErrors';
import { checkPermission, type PermissionStatus } from '@/services/permissions/permissionsService';
import { requestCallingPermissions, telephony, TelephonyError } from '@/services/telephony/telephonyService';
import type { CallStateEvent, PlaceCallResult } from '@/services/telephony/types';

import { callCampaignApi } from '../api/callCampaignApi';
import {
  advanceBlocker,
  callEvidence,
  clampCountdown,
  missingRequiredQuestions,
  zonedWallTimeToIso,
  type AdvanceBlocker,
  type CallEvidence,
} from '../domain/campaignDomain';
import { flushCampaignOutboxWrites, useCampaignOutbox, type AttemptDraft } from '../store/campaignOutbox';
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

/** Seconds "Saved" stays on screen before the next lead is fetched when auto-call is on. */
const AUTO_CALL_SAVED_PAUSE_S = 2;
/** With auto-call, a retry due within this time is fetched by itself when it becomes due. */
const AUTO_RECHECK_MAX_MS = 60 * 60_000;

const NO_EVIDENCE: CallEvidence = { offhookAt: null, endedAt: null, offhookDurationSec: null, ended: false };

/** Why an automatic call is not counting down right now (null = it is, or auto-call is off). */
export type AutoCallHold =
  | 'storage'
  | 'permission'
  | 'sim'
  | 'background'
  | 'paused'
  | 'offline'
  | 'not_running'
  | 'stopped';

export type DialOptions = {
  focused?: boolean;
  /** SIM to call from (null = the phone's default). */
  subscriptionId: number | null;
  /** False while the phone has several SIMs and none is chosen yet. */
  simChosen: boolean;
};

export function useCampaignRunner(campaign: CallCampaign | undefined, dialOptions: DialOptions) {
  const { t } = useTranslation();
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
  // Phone permissions: without CALL_PHONE Android only opens the dialer (the user must press
  // Call there), and without READ_PHONE_STATE the app cannot see when the call ends.
  const [permission, setPermission] = useState<PermissionStatus | null>(null);
  const [route, setRoute] = useState<PlaceCallResult['route'] | null>(null);
  const [callStateVisible, setCallStateVisible] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [preDialLeft, setPreDial] = useState<number | null>(null);
  // A claimed, never-dialled lead may be called automatically; one already dialled (e.g. found
  // again after a restart) or one the user stopped never is.
  const [armed, setArmed] = useState(false);
  const [notice, setNotice] = useState<'claim_renewed' | null>(null);
  // Set when the server released this phone's claim on a lead it never dialled (20 min without
  // activity): the next claim carries the answers already typed over to the new attempt.
  const lostClaim = useRef<{ taskId: string; attemptId: string } | null>(null);
  const claiming = useRef(false);
  const dialing = useRef(false);
  const mounted = useRef(true);
  const safety = useRef({
    paused: userPaused,
    focused: dialOptions.focused !== false,
    online,
    status: campaign?.status,
  });
  useLayoutEffect(() => {
    safety.current = {
      paused: userPaused,
      focused: dialOptions.focused !== false,
      online,
      status: campaign?.status,
    };
  }, [userPaused, dialOptions.focused, online, campaign?.status]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const mayLaunch = useCallback(
    () =>
      mounted.current &&
      AppState.currentState === 'active' &&
      safety.current.focused &&
      !safety.current.paused &&
      safety.current.online &&
      safety.current.status === 'running' &&
      !useCampaignOutbox.getState().storageError,
    [],
  );
  const storageError = useCampaignOutbox((s) => s.storageError);
  const events = useRef<CallStateEvent[]>([]);
  const deviceId = useRef<string | null>(null);
  const campaignRef = useRef(campaign);
  const autoCall = useCampaignOutbox((s) => s.autoCall[campaignId] ?? Boolean(campaign?.settings.autoDial));

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
  const canEditResult = useCampaignOutbox((s) =>
    attemptId ? s.items[`complete:${attemptId}`]?.status === 'failed' : false,
  );
  const editResult = useCallback(async () => {
    if (!attemptId) return;
    const item = outbox.getState().items[`complete:${attemptId}`];
    if (item?.status !== 'failed') return;
    setBusy(true);
    try {
      const current = await callCampaignApi.task(item.taskId);
      if (!['in_progress', 'needs_review'].includes(current.state) || current.lock?.attemptId !== attemptId) {
        setError({ code: 'SIM_CALL_ATTEMPT_MISMATCH', message: t('callCampaign.run.resultChanged') });
        return;
      }
      setTask(current);
      const attempt = current.attempts.find((a) => a.attemptId === attemptId);
      const at = attempt?.dialedAt
        ? Date.parse(attempt.dialedAt)
        : (outbox.getState().runs[campaignId]?.dialedAt ?? null);
      setDialedAt(at);
      outbox.getState().discardItem(item.id);
      outbox.getState().setRun(campaignId, { taskId: item.taskId, attemptId, dialedAt: at, recorded: false });
      setError(null);
      setPhase('wrap_up');
    } catch (e) {
      setError({
        code: e instanceof ApiError ? (e.code ?? 'UNKNOWN') : 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }, [attemptId, campaignId, outbox, t]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const refreshPermission = useCallback(async () => {
    const [callPhone, phoneState] = await Promise.all([
      checkPermission(PermissionsAndroid.PERMISSIONS.CALL_PHONE),
      checkPermission(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE),
    ]);
    const status =
      callPhone === 'granted' && phoneState === 'granted'
        ? 'granted'
        : callPhone === 'granted'
          ? phoneState
          : callPhone;
    setPermission(status);
    return status;
  }, []);
  // On open, and on return from system settings (which may have changed the answer).
  useEffect(() => {
    if (!appActive) return;
    const timer = setTimeout(() => void refreshPermission(), 0);
    return () => clearTimeout(timer);
  }, [appActive, refreshPermission]);

  /** Ask for the phone permissions (no dialog when already granted). */
  const requestPermissions = useCallback(async (): Promise<PermissionStatus> => {
    const result = await requestCallingPermissions({
      callPhone: {
        title: t('communication.permissions.callTitle'),
        message: t('communication.permissions.callMessage'),
        buttonPositive: t('common.continue'),
      },
      phoneState: {
        title: t('communication.permissions.stateTitle'),
        message: t('communication.permissions.stateMessage'),
        buttonPositive: t('common.continue'),
      },
    });
    const status =
      result.callPhone === 'granted' && result.phoneState === 'granted'
        ? 'granted'
        : result.callPhone === 'blocked' || result.phoneState === 'blocked'
          ? 'blocked'
          : 'denied';
    setPermission(status);
    return status;
  }, [t]);

  const toIdle = useCallback((reason: IdleReason, at: string | null = null) => {
    setTask(null);
    setAttemptId(null);
    setIdleReason(reason);
    setNextAt(at);
    setPhase('idle');
  }, []);

  /**
   * Answers typed on this phone for the same lead under an earlier attempt (a claim that
   * lapsed, an app restart, a retry) carry over to a new attempt that has none yet.
   */
  const carryAnswersOver = useCallback(
    (taskId: string, attempt: string) => {
      const state = outbox.getState();
      if (Object.keys(state.drafts[attempt]?.answers ?? {}).length) return;
      const previous = Object.values(state.drafts)
        .filter((d) => d.taskId === taskId && d.attemptId !== attempt && Object.keys(d.answers).length)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!previous) return;
      state.discardItem(`answers:${previous.attemptId}`);
      state.saveDraft(attempt, { taskId, campaignId, answers: previous.answers });
      state.enqueue({
        kind: 'answers',
        taskId,
        campaignId,
        attemptId: attempt,
        body: {
          answers: Object.entries(previous.answers).map(([fieldKey, a]) => ({
            fieldKey,
            status: a.status,
            value: a.value ?? null,
          })),
          deviceId: deviceId.current,
        },
      });
      void flushCampaignOutbox();
    },
    [outbox, campaignId],
  );

  /** Ask the server for the next lead (or the one this device already holds). */
  const claim = useCallback(async () => {
    if (!campaignId || claiming.current) return;
    // Reopening the app cannot progress past an outcome still waiting on the server.
    const pending = Object.values(outbox.getState().items).find(
      (i) => i.campaignId === campaignId && i.kind === 'complete',
    );
    if (pending) {
      setAttemptId(pending.attemptId);
      setPhase('saved');
      if (online) void flushCampaignOutbox(refresh);
      return;
    }
    claiming.current = true;
    // Always await first: no state changes happen synchronously when claim() starts.
    deviceId.current = await getDeviceId();
    setError(null);
    setCountdown(null);
    if (!online) {
      claiming.current = false;
      return toIdle('offline');
    }
    setBusy(true);
    try {
      const memo = outbox.getState().runs[campaignId];
      // A paused/cancelled campaign still needs the result of an already authorized
      // attempt. GET task is owner-scoped and does not authorize any new dialing.
      const recovery = memo?.dialedAt && !memo.recorded ? await callCampaignApi.task(memo.taskId) : null;
      const activeRecovery =
        recovery &&
        ['in_progress', 'needs_review'].includes(recovery.state) &&
        recovery.lock?.attemptId === memo?.attemptId;
      const res = activeRecovery
        ? { task: recovery, resumed: true, reason: null, nextAt: null }
        : await callCampaignApi.next(campaignId, deviceId.current);
      if (!mounted.current) return;
      if (!res.task) {
        outbox.getState().setRun(campaignId, null);
        refresh();
        return toIdle(res.reason ?? 'queue_empty', res.nextAt ?? null);
      }
      const t = res.task;
      const attempt = t.lock?.attemptId ?? null;
      const serverAttempt = t.attempts.find((a) => a.attemptId === attempt);
      const runMemo = outbox.getState().runs[campaignId];
      const dialled = serverAttempt?.dialedAt
        ? Date.parse(serverAttempt.dialedAt)
        : runMemo?.attemptId === attempt
          ? runMemo.dialedAt
          : null;
      setTask(t);
      setAttemptId(attempt);
      setDialedAt(dialled);
      setRoute(null);
      setCallStateVisible(true);
      events.current = [];
      setEvidence(NO_EVIDENCE);
      setArmed(!dialled);
      const lost = lostClaim.current;
      lostClaim.current = null;
      if (attempt) carryAnswersOver(t.id, attempt);
      setNotice(lost && lost.taskId === t.id && lost.attemptId !== attempt ? 'claim_renewed' : null);
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
      claiming.current = false;
      setBusy(false);
    }
  }, [campaignId, online, outbox, refresh, toIdle, carryAnswersOver]);

  const claimRef = useRef(claim);
  useEffect(() => {
    claimRef.current = claim;
  });

  // The answers for the lead on screen were refused because the claim lapsed (nothing dialled):
  // claim again and carry the answers over.
  const answersRefused = useCampaignOutbox((s) =>
    attemptId ? s.items[`answers:${attemptId}`]?.error === 'SIM_CALL_TASK_LOCKED' : false,
  );
  useEffect(() => {
    if (!answersRefused || phase !== 'ready' || dialedAt || !task || !attemptId) return;
    lostClaim.current = { taskId: task.id, attemptId };
    const timer = setTimeout(() => void claim(), 0);
    return () => clearTimeout(timer);
  }, [answersRefused, phase, dialedAt, task, attemptId, claim]);

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

  // Back from the dialer: JS may have been paused while the call ran, so read what the phone
  // recorded natively and move to the outcome if the call is already over.
  useEffect(() => {
    if (phase !== 'calling' || !attemptId || !appActive) return;
    let stale = false;
    void telephony.getPersistedEvents(attemptId).then((persisted) => {
      if (stale || !persisted.length) return;
      const known = new Set(events.current.map((e) => `${e.state}:${e.at}`));
      events.current = [...events.current, ...persisted.filter((e) => !known.has(`${e.state}:${e.at}`))].sort(
        (a, b) => a.at - b.at,
      );
      const ev = callEvidence(events.current, (dialedAt ?? 0) - 5_000);
      setEvidence(ev);
      if (ev.ended) {
        void telephony.stopMonitoring();
        setPhase('wrap_up');
      }
    });
    return () => {
      stale = true;
    };
  }, [phase, attemptId, dialedAt, appActive]);

  /** Dial a claimed lead on the chosen SIM (the server re-checks first and gives the number). */
  const dialTask = useCallback(
    async (taskId: string, attempt: string, subscriptionId: number | null) => {
      if (!deviceId.current || dialing.current || !mayLaunch()) return;
      dialing.current = true;
      setError(null);
      setArmed(false);
      setPreDial(null);
      setBusy(true);
      try {
        // Ask before the server records the dial. Refusing still works: the dialer opens instead.
        await requestPermissions();
        if (!mayLaunch()) return;
        const { dialNumber } = await callCampaignApi.dial(taskId, {
          attemptId: attempt,
          deviceId: deviceId.current,
          subscriptionId,
        });
        if (!mounted.current) return;
        const at = Date.now();
        // Authorization may have succeeded even if the user left/pause happened while
        // waiting. Keep the attempt for reconciliation; never launch it later.
        setDialedAt(at);
        outbox.getState().setRun(campaignId, { taskId, attemptId: attempt, dialedAt: at, recorded: false });
        await flushCampaignOutboxWrites();
        if (outbox.getState().storageError) {
          setPhase('wrap_up');
          return;
        }
        if (!mayLaunch()) {
          setPhase('wrap_up');
          return;
        }
        setCallStateVisible(await telephony.startMonitoring(attempt));
        if (!mayLaunch()) {
          await telephony.stopMonitoring();
          setPhase('wrap_up');
          return;
        }
        setPhase('calling');
        const placed = await telephony.placeCall({
          number: dialNumber,
          subscriptionId: subscriptionId ?? undefined,
          operationId: attempt,
        });
        setRoute(placed.route);
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
        if (err?.code === 'SIM_CALL_ALREADY_DIALED' || err?.kind === 'network' || err?.kind === 'timeout') {
          // Lost response / duplicate authorization: ask the server what happened.
          // A retry of POST /dial must never cause another native call.
          setPhase('error');
          setError({ code: err?.code ?? 'UNKNOWN', message: err?.message ?? String(e) });
          return;
        }
        if (err?.code === 'SIM_CALL_TASK_LOCKED') {
          // Nothing was dialled: the claim lapsed while the lead sat on screen. Claim again.
          lostClaim.current = { taskId, attemptId: attempt };
          setBusy(false);
          await claimRef.current();
          return;
        }
        setError({ code: err?.code ?? 'UNKNOWN', message: err?.message ?? String(e) });
        if (err?.code === 'SIM_CALL_CAMPAIGN_NOT_RUNNING') {
          toIdle('not_running');
          refresh();
        }
      } finally {
        dialing.current = false;
        setBusy(false);
      }
    },
    [campaignId, outbox, toIdle, refresh, requestPermissions, mayLaunch],
  );
  useEffect(() => {
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
      if (outbox.getState().runs[campaignId]?.recorded) return;
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
      if (
        draft.outcome === 'answered' &&
        missingRequiredQuestions(campaign?.questionnaire.questions ?? [], draft.answers).length
      )
        return 'required_answers';
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
        qualification: { answers: draft.qualificationAnswers ?? [] },
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
  const autoCallRef = useRef(autoCall);
  const blockerRef = useRef(blocker);
  useEffect(() => {
    blockerRef.current = blocker;
    autoCallRef.current = autoCall;
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
      // With auto-call the real wait happens on the next lead's screen ("Calling <name> in N s");
      // a short pause here still shows "Saved" and leaves time to press Pause.
      const wait = autoCallRef.current
        ? Math.min(AUTO_CALL_SAVED_PAUSE_S, countdownSeconds)
        : countdownSeconds;
      const left = wait - Math.floor((now - readyAt) / 1000);
      if (left > 0) {
        setCountdown(left);
        return;
      }
      clearInterval(timer);
      setCountdown(null);
      void claim();
    }, 250);
    return () => clearInterval(timer);
  }, [phase, countdownSeconds, claim]);

  // Auto-call and only retries/callbacks left: fetch again when the next one is due (the lead
  // then gets its own visible countdown). Calling hours / start dates still need a tap.
  useEffect(() => {
    if (phase !== 'idle' || idleReason !== 'waiting' || !nextAt || !autoCall || !appActive || userPaused)
      return;
    const wait = Date.parse(nextAt) - Date.now() + 1_000;
    if (!(wait <= AUTO_RECHECK_MAX_MS)) return;
    const timer = setTimeout(() => void claim(), Math.max(1_000, wait));
    return () => clearTimeout(timer);
  }, [phase, idleReason, nextAt, autoCall, appActive, userPaused, claim]);

  // Auto-call: a visible countdown on a freshly claimed lead, then the call. It only runs while
  // the app is open, the phone may place calls, a SIM is set and nothing is paused; any change
  // resets it. Stopping it leaves the lead waiting for a tap.
  const autoCallHold: AutoCallHold | null = !autoCall
    ? null
    : storageError
      ? 'storage'
      : !armed
        ? 'stopped'
        : campaign?.status !== 'running'
          ? 'not_running'
          : !online
            ? 'offline'
            : userPaused
              ? 'paused'
              : permission !== 'granted'
                ? 'permission'
                : !dialOptions.simChosen
                  ? 'sim'
                  : !appActive || dialOptions.focused === false
                    ? 'background'
                    : null;
  const autoCallRunning = phase === 'ready' && autoCall && autoCallHold === null && !busy && !storageError;
  const dialSim = dialOptions.subscriptionId;
  useEffect(() => {
    if (!autoCallRunning || !task || !attemptId) return;
    const startedAt = Date.now();
    let done = false;
    const tick = () => {
      if (done) return;
      const left = countdownSeconds - Math.floor((Date.now() - startedAt) / 1000);
      if (left > 0) {
        setPreDial(left);
        return;
      }
      done = true;
      setPreDial(null);
      void dialTask(task.id, attemptId, dialSim);
    };
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      done = true;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [autoCallRunning, task, attemptId, countdownSeconds, dialTask, dialSim]);
  const preDial = autoCallRunning ? preDialLeft : null;

  return {
    phase,
    storageError,
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
    notice,
    permission,
    requestPermissions,
    route,
    callStateVisible,
    autoCall,
    autoCallHold: phase === 'ready' ? autoCallHold : null,
    preDial,
    setAutoCall: (on: boolean) => {
      outbox.getState().setAutoCall(campaignId, on);
      if (on) setArmed(phase === 'ready' && !dialedAt);
    },
    stopAutoCall: () => setArmed(false),
    online,
    resultSynced,
    unresolved,
    canEditResult,
    editResult,
    userPaused,
    claim,
    dial,
    confirmCallEnded,
    saveAnswers,
    submit,
    skip,
    pauseSequence: () => {
      safety.current.paused = true;
      setUserPaused(true);
    },
    resumeSequence: () => setUserPaused(false),
    nextNow: () => {
      setCountdown(null);
      void claim();
    },
  };
}
