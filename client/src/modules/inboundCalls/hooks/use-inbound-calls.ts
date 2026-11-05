'use client';

import { useEffect, useRef } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { onSocketConnect } from '@/lib/socket/client';
import { queryKeys } from '@/lib/query/keys';
import { showError, showSuccess } from '@/lib/toast';
import { useAllCallingAgents } from '@/modules/aiCalling/hooks/use-calling-agents';
import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';
import { inboundCallsApi } from '../services/inbound-calls-api';
import type { ControlKind, InboundCallDetail, RecommendationAction } from '../types/inbound-call-types';
import type { T } from '../inbound-domain';
import { errorMessage, rulePayload } from '../inbound-domain';

type Query = Record<string, string | number>;
const K = queryKeys.inboundCalls;

export function useInboundList(params: Query) {
  return useQuery({ queryKey: K.list(params), queryFn: () => inboundCallsApi.list(params), placeholderData: keepPreviousData, refetchInterval: 30_000 });
}
export function useInboundStats(params: Query) {
  return useQuery({ queryKey: K.stats(params), queryFn: () => inboundCallsApi.stats(params), refetchInterval: 30_000 });
}
export function useInboundAnalytics(params: Query) {
  return useQuery({ queryKey: K.analytics(params), queryFn: () => inboundCallsApi.analytics(params), placeholderData: keepPreviousData });
}
/** Live calls: socket events invalidate it; a light poll is the fallback when the socket is down. */
export function useInboundLive(enabled = true) {
  return useQuery({ queryKey: K.live(), queryFn: () => inboundCallsApi.live(), enabled, refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? 4_000 : 15_000) });
}
export function useInboundCall(id: string | null) {
  return useQuery({ queryKey: K.detail(id || ''), queryFn: () => inboundCallsApi.get(id as string), enabled: Boolean(id) });
}
/** Incoming-call cost analytics (all agents, or one with agentId). */
export function useInboundCostAnalytics(params: { from?: string; to?: string; agentId?: string }, enabled = true) {
  return useQuery({ queryKey: K.costs(params), queryFn: () => inboundCallsApi.costs(params), enabled, refetchInterval: 30_000, placeholderData: keepPreviousData });
}
export function useInboundDevices(enabled = true) {
  return useQuery({ queryKey: K.devices(), queryFn: () => inboundCallsApi.devices(), enabled, refetchInterval: 30_000 });
}
export function useInboundSettings() {
  return useQuery({ queryKey: K.settings(), queryFn: () => inboundCallsApi.settings(), staleTime: 10_000 });
}
/** The owner's calling agents (archived ones are not assignable). */
export function useAssignableAgents() {
  const q = useAllCallingAgents();
  return { ...q, agents: (q.data ?? []).filter((a) => a.availability !== 'archived') };
}

const INBOUND_EVENTS = ['inbound-call:update', 'inbound-call:transcript', 'inbound-call:activity', 'inbound-call:audio', 'inbound-call:handoff', 'inbound-call:settings'] as const;

/**
 * Socket events land in the user's room. Transcript/audio events fire many times a
 * second during a call, so invalidation is debounced: the live list refreshes fast,
 * history/stats/devices slower.
 */
export function useInboundRealtime(onHandoff?: (payload: { id?: string; reason?: string }) => void) {
  const qc = useQueryClient();
  const fast = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slow = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffRef = useRef(onHandoff);
  useEffect(() => { handoffRef.current = onHandoff; });

  useEffect(() => {
    const live = () => {
      if (fast.current) clearTimeout(fast.current);
      fast.current = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: K.live() });
        void qc.invalidateQueries({ queryKey: ['inbound-calls', 'detail'] });
      }, 400);
    };
    const rest = () => {
      if (slow.current) clearTimeout(slow.current);
      slow.current = setTimeout(() => {
        for (const key of [['inbound-calls', 'list'], ['inbound-calls', 'stats'], ['inbound-calls', 'analytics'], K.devices()]) void qc.invalidateQueries({ queryKey: key });
      }, 1500);
    };
    const onUpdate = () => { live(); rest(); };
    const onSettings = () => { void qc.invalidateQueries({ queryKey: K.settings() }); void qc.invalidateQueries({ queryKey: K.devices() }); };
    // The persistent "caller wants a person" alert is the global InboundHandoffAlertHost
    // (platform layout), so this page only refreshes — no second toast.
    const onHandoffEvent = (payload: { id?: string; reason?: string } = {}) => {
      live();
      handoffRef.current?.(payload);
    };
    const handlers: Record<(typeof INBOUND_EVENTS)[number], (p?: never) => void> = {
      'inbound-call:update': onUpdate,
      'inbound-call:transcript': live,
      'inbound-call:activity': live,
      'inbound-call:audio': live,
      'inbound-call:handoff': onHandoffEvent as (p?: never) => void,
      'inbound-call:settings': onSettings,
    };
    const attached = new Set<Socket>();
    const unsubscribe = onSocketConnect((socket: Socket) => {
      for (const event of INBOUND_EVENTS) { socket.off(event, handlers[event]); socket.on(event, handlers[event]); }
      attached.add(socket);
    });
    return () => {
      unsubscribe();
      for (const socket of attached) for (const event of INBOUND_EVENTS) socket.off(event, handlers[event]);
      attached.clear();
      if (fast.current) clearTimeout(fast.current);
      if (slow.current) clearTimeout(slow.current);
    };
  }, [qc]);
}

/** Actions on one call; every success refreshes the detail with the server's answer. */
export function useInboundCallActions(id: string | null, t: T) {
  const qc = useQueryClient();
  const set = (data: InboundCallDetail) => {
    qc.setQueryData(K.detail(data.id), data);
    void qc.invalidateQueries({ queryKey: ['inbound-calls', 'list'] });
  };
  const fail = (e: unknown) => showError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.')));
  const callId = () => { if (!id) throw new Error('No call'); return id; };
  return {
    addNote: useMutation({ mutationFn: (text: string) => inboundCallsApi.addNote(callId(), text), onSuccess: (d) => { set(d); showSuccess(t('inbound.toast.noteAdded', 'Note added')); }, onError: fail }),
    reviewField: useMutation({
      mutationFn: (v: { fieldId: string; action: 'confirm' | 'correct' | 'reject'; value?: string }) => inboundCallsApi.reviewField(callId(), v.fieldId, { action: v.action, ...(v.action === 'correct' ? { value: v.value ?? '' } : {}) }),
      onSuccess: (d) => { set(d); showSuccess(t('inbound.toast.fieldReviewed', 'Field updated')); }, onError: fail,
    }),
    resolveMatch: useMutation({ mutationFn: (leadId: string) => inboundCallsApi.resolveMatch(callId(), leadId), onSuccess: (d) => { set(d); showSuccess(t('inbound.toast.matchResolved', 'Call linked to the lead')); }, onError: fail }),
    createLead: useMutation({ mutationFn: (force?: boolean) => inboundCallsApi.createLead(callId(), Boolean(force)), onSuccess: (d) => { set(d); void qc.invalidateQueries({ queryKey: ['leads'] }); showSuccess(t('inbound.toast.leadCreated', 'Lead created')); }, onError: fail }),
    decide: useMutation({
      mutationFn: (v: { recId: string; decision: 'execute' | 'dismiss'; leadId?: string; createLead?: boolean; dueAt?: string | null; note?: string | null }) => inboundCallsApi.decideRecommendation(callId(), v.recId, { decision: v.decision, ...(v.leadId ? { leadId: v.leadId } : {}), ...(v.createLead ? { createLead: true } : {}), ...(v.dueAt ? { dueAt: v.dueAt } : {}), ...(v.note ? { note: v.note } : {}) }),
      onSuccess: (d, v) => { set(d); showSuccess(v.decision === 'execute' ? t('inbound.toast.recExecuted', 'Follow-up scheduled') : t('inbound.toast.recDismissed', 'Recommendation dismissed')); }, onError: fail,
    }),
    updateWork: useMutation({
      mutationFn: (body: { status?: string; assignedTo?: string | null; note?: string }) => inboundCallsApi.updateWork(callId(), body),
      onSuccess: (d) => { set(d); showSuccess(t('inbound.toast.workSaved', 'Status updated')); }, onError: fail,
    }),
    followUp: useMutation({
      mutationFn: (v: { callId?: string; dueAt: string; note?: string; action: RecommendationAction; leadId?: string; createLead?: boolean }) => inboundCallsApi.scheduleFollowUp(v.callId ?? callId(), { dueAt: v.dueAt, note: v.note || null, action: v.action, ...(v.leadId ? { leadId: v.leadId } : {}), ...(v.createLead ? { createLead: true } : {}) }),
      onSuccess: (d, v) => { if (d.call) set(d.call); else void qc.invalidateQueries({ queryKey: K.detail(v.callId ?? id ?? '') }); void qc.invalidateQueries({ queryKey: ['lead-workflow'] }); showSuccess(t('inbound.toast.followUpScheduled', 'Follow-up scheduled')); }, onError: fail,
    }),
  };
}

/** Ready-made closing-question sets (GET /inbound-calls/question-templates). */
export function useQuestionTemplates(enabled = true) {
  return useQuery({ queryKey: ['inbound-calls', 'question-templates'], queryFn: () => inboundCallsApi.questionTemplates(), enabled, staleTime: 3_600_000 });
}

/** Users who can own an incoming call (the shared user directory). */
export function useAssignableUsers(enabled = true) {
  const q = useUserDirectory({ limit: 200, enabled });
  const users = ((q.data ?? []) as Array<{ _id: string; firstName?: string; lastName?: string; email?: string }>)
    .map((u) => ({ id: String(u._id), name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || String(u._id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ...q, users };
}

/** Note on any row (history row action) — the call id travels with the mutation. */
export function useRowNote(t: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; text: string }) => inboundCallsApi.addNote(v.id, v.text),
    onSuccess: (d) => { qc.setQueryData(K.detail(d.id), d); showSuccess(t('inbound.toast.noteAdded', 'Note added')); },
    onError: (e) => showError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.'))),
  });
}

export function useRowFollowUp(t: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; dueAt: string; note?: string; action: RecommendationAction; leadId?: string; createLead?: boolean }) => inboundCallsApi.scheduleFollowUp(v.id, { dueAt: v.dueAt, note: v.note || null, action: v.action, ...(v.leadId ? { leadId: v.leadId } : {}), ...(v.createLead ? { createLead: true } : {}) }),
    onSuccess: (d, v) => { if (d.call) qc.setQueryData(K.detail(v.id), d.call); else void qc.invalidateQueries({ queryKey: K.detail(v.id) }); showSuccess(t('inbound.toast.followUpScheduled', 'Follow-up scheduled')); },
    onError: (e) => showError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.'))),
  });
}

export function useCallControl(t: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; kind: ControlKind }) => inboundCallsApi.control(v.id, v.kind),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: K.live() });
      void qc.invalidateQueries({ queryKey: K.detail(v.id) });
      showSuccess(t(`inbound.control.sent.${v.kind}`, 'Command sent to the phone'));
    },
    onError: (e) => showError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.'))),
  });
}

export function useSettingsMutations(t: T) {
  const qc = useQueryClient();
  const apply = (data: unknown) => { qc.setQueryData(K.settings(), data); void qc.invalidateQueries({ queryKey: K.devices() }); };
  return {
    update: useMutation({ mutationFn: (patch: Record<string, unknown>) => inboundCallsApi.updateSettings(patch), onSuccess: (d) => { apply(d); showSuccess(t('inbound.toast.settingsSaved', 'Incoming call settings saved')); } }),
    saveRule: useMutation({ mutationFn: (rule: ReturnType<typeof rulePayload>) => inboundCallsApi.saveRule(rule), onSuccess: (d) => { apply(d); showSuccess(t('inbound.toast.ruleSaved', 'Rule saved')); } }),
    deleteRule: useMutation({ mutationFn: (ruleId: string) => inboundCallsApi.deleteRule(ruleId), onSuccess: (d) => { apply(d); showSuccess(t('inbound.toast.ruleDeleted', 'Rule deleted')); } }),
    testRules: useMutation({ mutationFn: (body: { number: string; deviceId: string | null; simSlot: number | null; at: string | null }) => inboundCallsApi.testRules(body) }),
    reload: () => qc.invalidateQueries({ queryKey: K.settings() }),
  };
}
