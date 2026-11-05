import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';

import { queryKeys } from '@/constants/queryKeys';
import { useAppState } from '@/hooks/useAppState';
import { i18next } from '@/i18n';
import { ApiError } from '@/services/api/apiErrors';
import { showApiErrorToast, showErrorToast, showSuccessToast, showWarningToast } from '@/utils/toast';

import { incomingCallsApi } from '../api/incomingCallsApi';
import { appendTurn, isTerminal, startOfTodayIso } from '../domain/incomingCallDomain';
import {
  isInboundSocketConnected,
  subscribeInboundEvents,
  subscribeInboundSocketStatus,
  type InboundEvent,
} from '../realtime/inboundSocket';
import type {
  CallFilter,
  ControlKind,
  InboundCallDetail,
  InboundSettings,
  LeadChoice,
  LiveInboundCall,
  TranscriptTurn,
  WorkStatus,
} from '../types';

const keys = queryKeys.incomingCalls;
const LIVE_TAIL = 6;

type Payload = Record<string, unknown>;
const asObject = (v: unknown): Payload => (v && typeof v === 'object' ? (v as Payload) : {});
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Apply one realtime event to the cache: patch what the event carries, refetch the rest. */
export function applyInboundEvent(client: QueryClient, event: InboundEvent) {
  const p = asObject(event.payload);
  const callId = asString(p.callId);
  const id = asString(p.id);
  const patchLive = (fn: (row: LiveInboundCall) => LiveInboundCall) =>
    client.setQueryData<LiveInboundCall[]>(keys.live, (rows) =>
      rows?.map((row) => (callId && row.callId === callId ? fn(row) : row)),
    );

  switch (event.name) {
    case 'inbound-call:activity': {
      const aiStatus = asString(p.aiStatus);
      patchLive((row) => ({
        ...row,
        aiStatus: aiStatus ?? row.aiStatus,
        agentActivity: {
          state: asString(p.agentState),
          speaker: asString(p.speaker),
          at: new Date().toISOString(),
        },
      }));
      break;
    }
    case 'inbound-call:transcript': {
      const raw = asObject(p.turn);
      const text = asString(raw.text);
      if (!text) break;
      const turn: TranscriptTurn = {
        itemId: asString(raw.itemId),
        role: asString(raw.role) ?? 'system',
        text,
        interrupted: raw.interrupted === true,
        at: asString(raw.at),
      };
      patchLive((row) => ({ ...row, lastTurns: appendTurn(row.lastTurns, turn, LIVE_TAIL) }));
      client.setQueriesData<InboundCallDetail>({ queryKey: keys.details }, (detail) =>
        detail && callId && detail.callId === callId
          ? { ...detail, transcript: appendTurn(detail.transcript, turn) }
          : detail,
      );
      break;
    }
    case 'inbound-call:update': {
      const status = asString(p.status);
      if (status) {
        patchLive((row) => ({
          ...row,
          status,
          aiStatus: asString(p.aiStatus) ?? row.aiStatus,
          audioStatus: asString(p.audioStatus) ?? row.audioStatus,
        }));
      }
      void client.invalidateQueries({ queryKey: keys.live });
      void client.invalidateQueries({ queryKey: keys.lists });
      void client.invalidateQueries({ queryKey: ['incoming-calls', 'stats'] });
      if (id) void client.invalidateQueries({ queryKey: keys.detail(id) });
      if (p.event === 'ringing' || p.event === 'processed') {
        void client.invalidateQueries({ queryKey: keys.devices });
      }
      break;
    }
    case 'inbound-call:handoff':
      void client.invalidateQueries({ queryKey: keys.live });
      if (id) void client.invalidateQueries({ queryKey: keys.detail(id) });
      break;
    case 'inbound-call:settings': {
      const version = typeof p.version === 'number' ? p.version : null;
      client.setQueryData<InboundSettings>(keys.settings, (s) =>
        s && version != null && version >= s.version ? { ...s, version, enabled: p.enabled === true } : s,
      );
      void client.invalidateQueries({ queryKey: keys.devices });
      break;
    }
    default:
      break;
  }
}

/**
 * Subscribe this screen to live `inbound-call:*` events while the app is in the foreground.
 * Returns whether the socket is connected (polling slows down when it is).
 */
export function useInboundRealtime(enabled = true): boolean {
  const client = useQueryClient();
  const appState = useAppState();
  const active = enabled && appState === 'active';
  useEffect(() => {
    if (!active) return undefined;
    return subscribeInboundEvents((event) => applyInboundEvent(client, event));
  }, [active, client]);
  return useSyncExternalStore(subscribeInboundSocketStatus, isInboundSocketConnected, () => false);
}

export function useInboundSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: ({ signal }) => incomingCallsApi.settings(signal),
  });
}

/** Master switch. A stale `version` (changed on the website) answers 409: reload, never overwrite. */
export function useSetAiAnswering() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      incomingCallsApi.setEnabled(enabled, client.getQueryData<InboundSettings>(keys.settings)?.version),
    onSuccess: (data) => {
      client.setQueryData(keys.settings, data);
      void client.invalidateQueries({ queryKey: keys.devices });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void client.invalidateQueries({ queryKey: keys.settings });
        showWarningToast(i18next.t('incomingCalls.settings.conflict'));
        return;
      }
      showApiErrorToast(error);
    },
  });
}

export function useInboundStats(socketConnected: boolean) {
  const from = startOfTodayIso();
  return useQuery({
    queryKey: keys.stats(from),
    queryFn: ({ signal }) => incomingCallsApi.stats(from, signal),
    refetchInterval: socketConnected ? false : 30_000,
  });
}

export function useLiveInboundCalls(socketConnected: boolean) {
  return useQuery({
    queryKey: keys.live,
    queryFn: ({ signal }) => incomingCallsApi.live(signal),
    // Polling is the fallback: fast while a call is up, slower when the socket pushes updates.
    refetchInterval: (query) => {
      const active = (query.state.data?.length ?? 0) > 0;
      if (socketConnected) return active ? 10_000 : 30_000;
      return active ? 3_000 : 15_000;
    },
  });
}

export function useInboundCallList(filter: CallFilter, socketConnected: boolean) {
  return useInfiniteQuery({
    queryKey: keys.list(filter),
    queryFn: ({ pageParam, signal }) => incomingCallsApi.list(filter, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    refetchInterval: socketConnected ? false : 30_000,
  });
}

export function useInboundDevices() {
  return useQuery({
    queryKey: keys.devices,
    queryFn: ({ signal }) => incomingCallsApi.devices(signal),
    refetchInterval: 20_000,
  });
}

export function useInboundCall(id: string, socketConnected: boolean, enabled = true) {
  return useQuery({
    queryKey: keys.detail(id),
    queryFn: ({ signal }) => incomingCallsApi.get(id, signal),
    enabled: enabled && Boolean(id),
    refetchInterval: (query) => {
      const call = query.state.data;
      if (!call) return false;
      // Finished and post-processed (summary, qualification, recommendations): nothing changes.
      if (isTerminal(call.status) && call.processedAt) return false;
      if (isTerminal(call.status) || call.status === 'WRAPPING_UP') return 5_000;
      return socketConnected ? 10_000 : 3_000;
    },
  });
}

function refreshCall(client: QueryClient, id: string) {
  void client.invalidateQueries({ queryKey: keys.live });
  void client.invalidateQueries({ queryKey: keys.detail(id) });
  void client.invalidateQueries({ queryKey: keys.lists });
}

export function useInboundControl(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (kind: ControlKind) => incomingCallsApi.control(id, kind),
    onSuccess: (_data, kind) => {
      refreshCall(client, id);
      showSuccessToast(i18next.t(`incomingCalls.control.sent.${kind}`));
    },
    onError: (error) => {
      refreshCall(client, id);
      // 409 carries the server's reason ("The AI cannot take this call: agent not active").
      if (error instanceof ApiError && error.status === 409 && error.message) {
        showErrorToast(error.message);
        return;
      }
      showApiErrorToast(error);
    },
  });
}

export function useAddInboundNote(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => incomingCallsApi.addNote(id, text),
    onSuccess: (detail) => {
      client.setQueryData(keys.detail(id), detail);
      showSuccessToast(i18next.t('incomingCalls.detail.noteSaved'));
    },
    onError: showApiErrorToast,
  });
}

export function useScheduleInboundFollowUp(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { dueAt: string; note?: string | null; lead?: LeadChoice | null }) =>
      incomingCallsApi.scheduleFollowUp(id, input),
    onSuccess: ({ call }, input) => {
      if (call) client.setQueryData(keys.detail(id), call);
      void client.invalidateQueries({ queryKey: keys.detail(id) });
      void client.invalidateQueries({ queryKey: keys.lists });
      if (input.lead) void client.invalidateQueries({ queryKey: queryKeys.leads.all });
      void client.invalidateQueries({ queryKey: queryKeys.followUps.all });
      showSuccessToast(i18next.t('incomingCalls.followUp.saved'));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409 && error.message) {
        showErrorToast(error.message);
        return;
      }
      showApiErrorToast(error);
    },
  });
}

export function useDecideRecommendation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      recId,
      decision,
      lead,
    }: {
      recId: string;
      decision: 'execute' | 'dismiss';
      lead?: LeadChoice | null;
    }) => incomingCallsApi.decideRecommendation(id, recId, decision, lead),
    onSuccess: (detail, { decision, lead }) => {
      client.setQueryData(keys.detail(id), detail);
      void client.invalidateQueries({ queryKey: keys.lists });
      if (lead) void client.invalidateQueries({ queryKey: queryKeys.leads.all });
      if (decision === 'execute') void client.invalidateQueries({ queryKey: queryKeys.followUps.all });
      showSuccessToast(i18next.t(`incomingCalls.recommendations.done.${decision}`));
    },
    onError: (error) => {
      void client.invalidateQueries({ queryKey: keys.detail(id) });
      if (error instanceof ApiError && error.status === 409 && error.message) {
        showErrorToast(error.message);
        return;
      }
      showApiErrorToast(error);
    },
  });
}

/** Change the call's work status and/or assignee (with an optional note). */
export function useUpdateWork(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { status?: WorkStatus; assignedTo?: string | null; note?: string | null }) =>
      incomingCallsApi.updateWork(id, input),
    onSuccess: (detail) => {
      client.setQueryData(keys.detail(id), detail);
      void client.invalidateQueries({ queryKey: keys.lists });
      showSuccessToast(i18next.t('incomingCalls.work.saved'));
    },
    onError: showApiErrorToast,
  });
}
