import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

import {
  controlResultSchema,
  followUpResultSchema,
  inboundCallDetailSchema,
  inboundCallRowSchema,
  inboundDeviceListSchema,
  inboundSettingsSchema,
  inboundStatsSchema,
  liveInboundCallListSchema,
  paginationSchema,
  reportSimsResultSchema,
  type CallFilter,
  type ControlKind,
  type LeadChoice,
  type ReportedSim,
  type WorkStatus,
} from '../types';

export const PAGE_SIZE = 25;

/** Server list filters (inboundCall.validation.js listFilters) for each filter chip. */
export function filterParams(filter: CallFilter): Record<string, string | undefined> {
  switch (filter) {
    case 'ai':
      return { handledBy: 'ai' };
    case 'missed':
      return { status: 'MISSED' };
    case 'open':
      return { workStatus: 'open' };
    case 'mine':
      return { assignedTo: 'me' };
    case 'newLeads':
      // Calls that created a lead: the same records the "New leads" stat counts.
      return { leadCreated: 'true' };
    default:
      return {};
  }
}

export const incomingCallsApi = {
  async list(filter: CallFilter, page = 1, signal?: AbortSignal) {
    const { data, pagination } = await api.get(ENDPOINTS.inboundCalls.list, z.array(inboundCallRowSchema), {
      params: { ...filterParams(filter), page, limit: PAGE_SIZE, sort: 'newest' },
      signal,
    });
    // This endpoint pages by number ({ page, pages, total }), not by cursor.
    const parsed = paginationSchema.safeParse(pagination);
    return {
      items: data,
      page: parsed.success ? parsed.data.page : page,
      pages: parsed.success ? parsed.data.pages : page,
      total: parsed.success ? parsed.data.total : data.length,
    };
  },
  async stats(from: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.inboundCalls.stats, inboundStatsSchema, {
      params: { from },
      signal,
    });
    return data;
  },
  async live(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.inboundCalls.live, liveInboundCallListSchema, { signal });
    return data;
  },
  async devices(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.inboundCalls.devices, inboundDeviceListSchema, { signal });
    return data;
  },
  async settings(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.inboundCalls.settings, inboundSettingsSchema, { signal });
    return data;
  },
  /** Optimistic concurrency: the server answers 409 when `version` is stale. */
  async setEnabled(enabled: boolean, version: number | undefined) {
    const { data } = await api.patch(
      ENDPOINTS.inboundCalls.settings,
      version == null ? { enabled } : { enabled, version },
      inboundSettingsSchema,
    );
    return data;
  },
  /** Store this phone's SIM cards on a paired device (HFP cannot report them). */
  async reportSims(deviceId: string, sims: ReportedSim[]) {
    const { data } = await api.put(
      ENDPOINTS.inboundCalls.deviceSims(deviceId),
      { sims },
      reportSimsResultSchema,
    );
    return data;
  },
  async get(id: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.inboundCalls.detail(id), inboundCallDetailSchema, { signal });
    return data;
  },
  async control(id: string, kind: ControlKind) {
    const { data } = await api.post(ENDPOINTS.inboundCalls.control(id, kind), {}, controlResultSchema);
    return data;
  },
  async addNote(id: string, text: string) {
    const { data } = await api.post(ENDPOINTS.inboundCalls.notes(id), { text }, inboundCallDetailSchema);
    return data;
  },
  /** `lead`: when the call has no lead yet, link a matching one or create one first. */
  async scheduleFollowUp(
    id: string,
    input: { dueAt: string; note?: string | null; lead?: LeadChoice | null },
  ) {
    const { data } = await api.post(
      ENDPOINTS.inboundCalls.followUp(id),
      { dueAt: input.dueAt, note: input.note || null, ...(input.lead ?? {}) },
      followUpResultSchema,
    );
    const call = inboundCallDetailSchema.safeParse(data.call);
    return { followUpId: data.followUpId, call: call.success ? call.data : null };
  },
  async decideRecommendation(
    id: string,
    recId: string,
    decision: 'execute' | 'dismiss',
    lead?: LeadChoice | null,
  ) {
    const { data } = await api.post(
      ENDPOINTS.inboundCalls.recommendation(id, recId),
      { decision, ...(decision === 'execute' && lead ? lead : {}) },
      inboundCallDetailSchema,
    );
    return data;
  },
  /** Work status and/or assignee (null = unassign); always recorded in the call's history. */
  async updateWork(
    id: string,
    input: { status?: WorkStatus; assignedTo?: string | null; note?: string | null },
  ) {
    const body: Record<string, unknown> = {};
    if (input.status !== undefined) body.status = input.status;
    if (input.assignedTo !== undefined) body.assignedTo = input.assignedTo;
    if (input.note) body.note = input.note;
    const { data } = await api.patch(ENDPOINTS.inboundCalls.work(id), body, inboundCallDetailSchema);
    return data;
  },
};
