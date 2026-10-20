// AI agent = the CRM's existing campaign APIs. Calls: /ai-calling/* (OpenAI Realtime
// over LiveKit + a cloud SIP trunk). SMS: /messaging/* with channel "sms". The app
// only creates drafts, previews and explicitly starts them; every eligibility,
// consent, suppression, quiet-hours and quota decision stays on the server.
import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

import {
  agentSmsTemplateSchema,
  callCampaignSchema,
  callAnalyticsSchema,
  callRecordSchema,
  callPreviewSchema,
  callRecipientSchema,
  languageListSchema,
  messagingHealthSchema,
  pagePaginationSchema,
  simulateResultSchema,
  smsCampaignSchema,
  smsRecipientSchema,
  telephonyHealthSchema,
  type CallCampaignInput,
  type SmsCampaignInput,
} from '../types';

/** Lists are page-based on both modules; the max page size the server allows. */
export const RECIPIENT_PAGE_LIMIT = 200;
export const CAMPAIGN_PAGE_LIMIT = 50;

export type Paged<T> = { items: T[]; total: number };

function paged<T>(items: T[], pagination: unknown): Paged<T> {
  const parsed = pagePaginationSchema.parse(pagination);
  return { items, total: parsed?.total ?? items.length };
}

export type SimulateInput = {
  state: Record<string, unknown> | null;
  userText: string | null;
  disclose: boolean;
};

export const aiAgentApi = {
  // ---- shared
  async languages(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.aiCalling.languages, languageListSchema, { signal });
    return data;
  },
  async telephonyHealth(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.aiCalling.telephonyHealth, telephonyHealthSchema, { signal });
    return data;
  },
  /** Needs `settings:read`; a 403 means "status unknown", not "not ready". */
  async messagingHealth(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.messaging.health, messagingHealthSchema, { signal });
    return data;
  },
  async smsTemplates(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.messaging.templates, z.array(agentSmsTemplateSchema), {
      signal,
      params: { channel: 'sms' },
    });
    return data.filter((template) => !template.isArchived && template.channel === 'sms');
  },

  // ---- AI calls
  async listCallCampaigns(signal?: AbortSignal) {
    const { data, pagination } = await api.get(ENDPOINTS.aiCalling.campaigns, z.array(callCampaignSchema), {
      signal,
      params: { limit: CAMPAIGN_PAGE_LIMIT },
    });
    return paged(data, pagination);
  },
  async getCallCampaign(id: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.aiCalling.campaign(id), callCampaignSchema, { signal });
    return data;
  },
  /** Always a draft: the server never starts a campaign on create. */
  async createCallCampaign(input: CallCampaignInput) {
    const { data } = await api.post(ENDPOINTS.aiCalling.campaigns, input, callCampaignSchema);
    return data;
  },
  /** Drafts can be edited in place; recipients (and their eligibility) do not change. */
  async updateCallCampaign(id: string, input: Omit<CallCampaignInput, 'selection'>) {
    const { data } = await api.patch(ENDPOINTS.aiCalling.campaign(id), input, callCampaignSchema);
    return data;
  },
  async previewCallCampaign(id: string) {
    const { data } = await api.post(ENDPOINTS.aiCalling.preview(id), undefined, callPreviewSchema);
    return data;
  },
  async callRecipients(id: string, signal?: AbortSignal) {
    const { data, pagination } = await api.get(
      ENDPOINTS.aiCalling.recipients(id),
      z.array(callRecipientSchema),
      { signal, params: { limit: RECIPIENT_PAGE_LIMIT } },
    );
    return paged(data, pagination);
  },
  async startCallCampaign(id: string) {
    const { data } = await api.post(ENDPOINTS.aiCalling.start(id), {}, callCampaignSchema);
    return data;
  },
  async pauseCallCampaign(id: string) {
    const { data } = await api.post(ENDPOINTS.aiCalling.pause(id), undefined, callCampaignSchema);
    return data;
  },
  async resumeCallCampaign(id: string) {
    const { data } = await api.post(ENDPOINTS.aiCalling.resume(id), {}, callCampaignSchema);
    return data;
  },
  async cancelCallCampaign(id: string) {
    const { data } = await api.post(ENDPOINTS.aiCalling.cancel(id), undefined, callCampaignSchema);
    return data;
  },
  /** Re-queue failed/exhausted recipients (never ambiguous ones automatically — a human chose this). */
  async retryFailedCalls(id: string) {
    const { data } = await api.post(
      ENDPOINTS.aiCalling.retry(id),
      { recipientIds: [] },
      z.object({ retried: z.number() }),
    );
    return data;
  },
  async callHistory(leadId: string, page: number, signal?: AbortSignal) {
    const { data, pagination } = await api.get(
      ENDPOINTS.aiCalling.leadHistory(leadId),
      z.array(callRecordSchema),
      { signal, params: { page, limit: 20 } },
    );
    const paging = pagination as unknown as
      | { page?: number; pages?: number; total?: number; limit?: number }
      | undefined;
    return {
      items: data,
      page: paging?.page ?? page,
      pages: paging?.pages ?? page,
      total: paging?.total ?? data.length,
    };
  },
  async getCall(id: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.aiCalling.call(id), callRecordSchema, { signal });
    return data;
  },
  async callAnalytics(filters: { from?: string; to?: string } = {}, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.aiCalling.analytics, callAnalyticsSchema, {
      signal,
      params: filters,
    });
    return data;
  },
  /** Text-only conversation with the agent's question engine. No phone call is placed. */
  async simulate(id: string, input: SimulateInput) {
    const { data } = await api.post(ENDPOINTS.aiCalling.simulate(id), input, simulateResultSchema);
    return data;
  },

  // ---- AI SMS (messaging campaigns, channel sms)
  async listSmsCampaigns(signal?: AbortSignal) {
    const { data, pagination } = await api.get(ENDPOINTS.messaging.campaigns, z.array(smsCampaignSchema), {
      signal,
      params: { channel: 'sms', limit: CAMPAIGN_PAGE_LIMIT },
    });
    return paged(data, pagination);
  },
  async getSmsCampaign(id: string, signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.messaging.campaign(id), smsCampaignSchema, { signal });
    return data;
  },
  /** Creates a draft and snapshots per-recipient eligibility + rendered text. Sends nothing. */
  async createSmsCampaign(input: SmsCampaignInput) {
    const { data } = await api.post(ENDPOINTS.messaging.campaigns, input, smsCampaignSchema);
    return data;
  },
  async smsRecipients(id: string, signal?: AbortSignal) {
    const { data, pagination } = await api.get(
      ENDPOINTS.messaging.recipients(id),
      z.array(smsRecipientSchema),
      { signal, params: { limit: RECIPIENT_PAGE_LIMIT } },
    );
    return paged(data, pagination);
  },
  async startSmsCampaign(id: string) {
    const { data } = await api.post(ENDPOINTS.messaging.start(id), {}, smsCampaignSchema);
    return data;
  },
  async pauseSmsCampaign(id: string) {
    const { data } = await api.post(ENDPOINTS.messaging.pause(id), undefined, smsCampaignSchema);
    return data;
  },
  async resumeSmsCampaign(id: string) {
    const { data } = await api.post(ENDPOINTS.messaging.resume(id), {}, smsCampaignSchema);
    return data;
  },
  async cancelSmsCampaign(id: string) {
    const { data } = await api.post(ENDPOINTS.messaging.cancel(id), undefined, smsCampaignSchema);
    return data;
  },
};
