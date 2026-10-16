import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import type { CursorPage } from '@/services/api/apiTypes';
import { ENDPOINTS } from '@/services/api/endpoints';

import {
  communicationSchema,
  completeResponseSchema,
  createdCommunicationSchema,
  eligibilitySchema,
  proposeResponseSchema,
  qualificationSchema,
  smsTemplateSchema,
  type Channel,
  type CommunicationEvent,
  type CommunicationRoute,
  type CompletePayload,
  type DestinationField,
} from '../types';

export type CreateCommunicationInput = {
  operationId: string;
  channel: Channel;
  route: CommunicationRoute;
  mode: 'manual' | 'assisted';
  destinationField: DestinationField;
  sim?: {
    subscriptionId: number | null;
    slotIndex: number | null;
    carrierName: string | null;
    displayName: string | null;
    isEmbedded: boolean | null;
    originNumber: string | null;
    originNumberSource: 'sim_reported' | null;
  } | null;
  device?: { platform: 'android'; osVersion: string; appVersion: string; model: string | null };
  startedAt: string;
};

export const communicationApi = {
  async eligibility(
    leadId: string,
    channel: Channel,
    destinationField: DestinationField,
    signal?: AbortSignal,
  ) {
    const { data } = await api.get(ENDPOINTS.communications.eligibility(leadId), eligibilitySchema, {
      signal,
      params: { channel, destinationField },
    });
    return data;
  },

  /**
   * Server-authorised start of a contact attempt. Idempotent per operationId: replaying
   * after a lost response returns the same record. The server resolves the number from
   * the lead, so the app dials exactly what the CRM holds.
   */
  async create(leadId: string, input: CreateCommunicationInput) {
    const { data } = await api.post(ENDPOINTS.communications.list(leadId), input, createdCommunicationSchema);
    return data;
  },

  async appendEvents(leadId: string, operationId: string, events: CommunicationEvent[]) {
    const { data } = await api.post(
      ENDPOINTS.communications.events(leadId, operationId),
      { events },
      communicationSchema,
    );
    return data;
  },

  /** Idempotent and resumable server-side: replays only re-run failed steps. */
  async complete(leadId: string, operationId: string, payload: CompletePayload) {
    const { data } = await api.post(
      ENDPOINTS.communications.complete(leadId, operationId),
      payload,
      completeResponseSchema,
    );
    return data;
  },

  async list(
    leadId: string,
    cursor: string | undefined,
    signal?: AbortSignal,
  ): Promise<CursorPage<z.infer<typeof communicationSchema>>> {
    const { data, pagination } = await api.get(
      ENDPOINTS.communications.list(leadId),
      z.array(communicationSchema),
      {
        signal,
        params: { limit: 20, cursor },
      },
    );
    return { items: data, pagination: pagination ?? { hasNext: false, nextCursor: null, limit: 20 } };
  },

  async qualification(leadId: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.communications.qualification(leadId), qualificationSchema, {
      signal,
    });
    return data;
  },

  /** Proposals only — the server never writes on this call. */
  async propose(leadId: string, notes: string, language: string) {
    const { data } = await api.post(
      ENDPOINTS.communications.propose(leadId),
      { notes, language },
      proposeResponseSchema,
    );
    return data;
  },

  async smsTemplates(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.messaging.templates, z.array(smsTemplateSchema), {
      signal,
      params: { channel: 'sms' },
    });
    return data.filter((template) => template.channel === 'sms' && !template.isArchived);
  },
};
