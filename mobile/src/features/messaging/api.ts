import { z } from 'zod';

import { api } from '@/services/api/apiClient';

const base = '/messaging';
export const campaignSchema = z.object({
  _id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string(),
  createdAt: z.string(),
  content: z.object({
    bodyText: z.string(),
    subject: z.string().optional(),
    language: z.string().optional(),
  }),
  routing: z.object({ smsProvider: z.string().optional() }).optional(),
  summary: z.record(z.string(), z.number()),
});
const recipientSchema = z.object({
  _id: z.string(),
  leadId: z.union([z.string(), z.object({ _id: z.string(), name: z.string().optional() })]).nullish(),
  destination: z.string(),
  status: z.string(),
  provider: z.string().nullish(),
  providerMessageId: z.string().nullish(),
  eligibility: z.object({ eligible: z.boolean(), reasons: z.array(z.string()) }),
  rendered: z.object({ bodyText: z.string() }),
  sentAt: z.string().nullish(),
  deliveredAt: z.string().nullish(),
  error: z.object({ message: z.string().nullish() }).optional(),
  latestAttempt: z.object({ outcome: z.string().optional(), failureClass: z.string().nullish() }).nullish(),
});
const serviceSchema = z.object({
  id: z.enum(['textbee', 'twilio']),
  name: z.string(),
  available: z.boolean(),
  configured: z.boolean(),
  sender: z.string().nullish(),
  reason: z.string().nullish(),
  capabilities: z.object({
    media: z.boolean(),
    subject: z.boolean(),
    deliveryReceipts: z.boolean(),
    maxBodyLength: z.number(),
  }),
});
export type Campaign = z.infer<typeof campaignSchema>;
export type Recipient = z.infer<typeof recipientSchema>;
export type SmsService = z.infer<typeof serviceSchema>;
export type CampaignInput = {
  idempotencyKey: string;
  name: string;
  description: string;
  channel: 'sms';
  purpose: 'promotional';
  content: { bodyText: string; language?: string; fallbackValues: Record<string, string> };
  routing: { smsProvider: 'textbee' | 'twilio'; allowFallback: false };
  selection:
    | { mode: 'explicit'; leadIds: string[] }
    | { mode: 'filters'; filters: { q?: string; status?: string; country?: string; city?: string } };
};
export const messagingApi = {
  async services(signal?: AbortSignal) {
    return (await api.get(`${base}/sms-services`, z.array(serviceSchema), { signal })).data;
  },
  async campaigns(
    q: string,
    page: number,
    signal?: AbortSignal,
    filters: { status?: string; provider?: string; from?: string; to?: string } = {},
  ) {
    return (
      await api.get(`${base}/campaigns`, z.array(campaignSchema), {
        signal,
        params: { channel: 'sms', q, page, limit: 25, ...filters },
      })
    ).data;
  },
  async campaign(id: string, signal?: AbortSignal) {
    return (await api.get(`${base}/campaigns/${id}`, campaignSchema, { signal })).data;
  },
  async create(input: CampaignInput) {
    return (await api.post(`${base}/campaigns`, input, campaignSchema)).data;
  },
  async recipients(id: string, page: number, status?: string, signal?: AbortSignal) {
    return (
      await api.get(`${base}/campaigns/${id}/recipients`, z.array(recipientSchema), {
        signal,
        params: { page, limit: 50, status },
      })
    ).data;
  },
  async action(id: string, action: 'start' | 'pause' | 'cancel') {
    return (await api.post(`${base}/campaigns/${id}/${action}`, {}, campaignSchema)).data;
  },
  async retry(id: string, recipientId: string) {
    await api.post(`${base}/campaigns/${id}/retry`, { recipientIds: [recipientId] }, z.unknown());
  },
};

const analyticsSchema = z.object({
  campaigns: z.number(),
  submitted: z.number(),
  delivered: z.number(),
  deliveryRate: z.number(),
  totalSegments: z.number(),
  byStatus: z.array(z.object({ _id: z.string(), count: z.number() })),
  byProvider: z.array(z.object({ _id: z.string(), count: z.number() })),
});
export async function smsAnalytics(signal?: AbortSignal) {
  return (await api.get(`${base}/analytics`, analyticsSchema, { signal, params: { channel: 'sms' } })).data;
}

const historySchema = z.object({
  _id: z.string(),
  source: z.string().optional(),
  status: z.string(),
  provider: z.string().nullish(),
  rendered: z.object({ bodyText: z.string().optional() }).optional(),
  campaignId: z.union([z.string(), z.object({ _id: z.string(), name: z.string() })]).nullish(),
  sentAt: z.string().nullish(),
  deliveredAt: z.string().nullish(),
  error: z.object({ message: z.string().nullish() }).nullish(),
});
export async function smsLeadHistory(leadId: string, page: number, signal?: AbortSignal) {
  return (
    await api.get(`${base}/leads/${leadId}/history`, z.array(historySchema), {
      signal,
      params: { channel: 'sms', page, limit: 25 },
    })
  ).data;
}
