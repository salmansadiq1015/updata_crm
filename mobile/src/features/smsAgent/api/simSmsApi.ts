// SIM SMS agent API. Campaign management + the phone transport (lease, attempting,
// result, delivery, inbound). The server decides every message; the phone only
// transmits what it leased and reports what happened.
import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ApiError } from '@/services/api/apiErrors';
import { ENDPOINTS } from '@/services/api/endpoints';

import {
  heartbeatResponseSchema,
  leaseResultSchema,
  simCampaignSchema,
  simConversationDetailSchema,
  simConversationSchema,
  smsCallbackSchema,
  type SimCampaignInput,
} from '../types';
import type { HeartbeatPayload } from '../domain/heartbeat';

/** The live server may predate an endpoint: a 404 means "not supported here", not an error. */
export const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

const ok = z.unknown();

export const simSmsApi = {
  async campaigns(status?: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.simSms.campaigns, z.array(simCampaignSchema), {
      signal,
      params: { limit: 50, ...(status ? { status } : {}) },
    });
    return data;
  },
  async campaign(id: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.simSms.campaign(id), simCampaignSchema, { signal });
    return data;
  },
  async create(input: SimCampaignInput) {
    const { data } = await api.post(ENDPOINTS.simSms.campaigns, input, simCampaignSchema);
    return data;
  },
  async action(id: string, action: 'start' | 'pause' | 'cancel') {
    const { data } = await api.post(ENDPOINTS.simSms[action](id), undefined, simCampaignSchema);
    return data;
  },
  async conversations(id: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.simSms.conversations(id), z.array(simConversationSchema), {
      signal,
      params: { limit: 200 },
    });
    return data;
  },
  async conversation(id: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.simSms.conversation(id), simConversationDetailSchema, {
      signal,
    });
    return data;
  },
  async resolve(id: string, action: 'resend' | 'mark_sent' | 'cancel') {
    await api.post(ENDPOINTS.simSms.resolve(id), { action }, ok);
  },

  // ---- device transport ----
  async lease(deviceId: string) {
    const { data } = await api.post(ENDPOINTS.simSms.lease, { deviceId }, leaseResultSchema);
    return data;
  },
  async attempting(messageId: string, deviceId: string) {
    const { data } = await api.post(
      ENDPOINTS.simSms.attempting(messageId),
      { deviceId },
      z.object({ proceed: z.boolean() }).passthrough(),
    );
    return data;
  },
  async result(
    messageId: string,
    body: {
      deviceId: string;
      status: 'sent' | 'failed' | 'unknown';
      errorCode?: string | null;
      at?: string | null;
    },
  ) {
    await api.post(ENDPOINTS.simSms.result(messageId), body, ok);
  },
  async delivery(messageId: string, body: { deviceId: string; at?: string | null }) {
    await api.post(ENDPOINTS.simSms.delivery(messageId), body, ok);
  },
  async watchList(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.simSms.watchList, z.object({ numbers: z.array(z.string()) }), {
      signal,
    });
    return data.numbers;
  },
  async inbound(body: {
    deviceId: string;
    deviceMessageKey: string;
    from: string;
    matchedTo: string | null;
    body: string;
    receivedAt: string;
  }) {
    const { data } = await api.post(
      ENDPOINTS.simSms.inbound,
      body,
      z.object({ matched: z.boolean() }).passthrough(),
    );
    return data;
  },

  // ---- device dashboard + callback requests ----
  /** Returns null when the server does not support device heartbeats (404). */
  async heartbeat(payload: HeartbeatPayload) {
    try {
      const { data } = await api.post(ENDPOINTS.simSms.heartbeat, payload, heartbeatResponseSchema);
      return data;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },
  async callbacks(signal?: AbortSignal) {
    try {
      const { data } = await api.get(ENDPOINTS.simSms.callbacks, z.array(smsCallbackSchema), { signal });
      return data;
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  },
};

export type SimSmsApi = typeof simSmsApi;
