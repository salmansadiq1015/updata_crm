import { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { ENDPOINTS } from '@/services/api/endpoints';

import {
  dueReminderSchema,
  linkCampaignSchema,
  linkSessionDetailSchema,
  linkSessionSchema,
  linkSettingsSchema,
  smsTemplateSchema,
} from './types';

const E = ENDPOINTS.linkAssistant;

export const linkAssistantApi = {
  /** Running SMS link campaigns the user can send links for. */
  async campaigns(signal?: AbortSignal) {
    const { data } = await api.get(ENDPOINTS.aiCalling.campaigns, z.array(linkCampaignSchema), {
      signal,
      params: { channel: 'web_link', status: 'running', limit: 50 },
    });
    return data;
  },
  async settings(signal?: AbortSignal) {
    return (await api.get(E.settings, linkSettingsSchema, { signal })).data;
  },
  async templates(campaignId: string | null, signal?: AbortSignal) {
    const { data } = await api.get(E.templates, z.array(smsTemplateSchema), {
      signal,
      params: campaignId ? { campaignId } : {},
    });
    return data;
  },
  async remindersDue(signal?: AbortSignal) {
    return (await api.get(E.remindersDue, z.array(dueReminderSchema), { signal })).data;
  },
  async leadSessions(leadId: string, signal?: AbortSignal) {
    return (await api.get(E.leadSessions(leadId), z.array(linkSessionSchema), { signal })).data;
  },
  async session(id: string, signal?: AbortSignal) {
    return (await api.get(E.session(id), linkSessionDetailSchema, { signal })).data;
  },
};
