import api from '@/lib/api/client';
import type { AgentFollowUpItem, AgentTemplate, FollowUpSettings, FollowUpSummary } from '../types/ai-calling-types';

/** AI follow-up calling API (server/src/modules/aiCalling/followUpCalling.routes.js). */
const root = '/ai-calling';
const unwrap = <T,>(res: unknown): T => (res as { data: T }).data;

export const followUpCallingApi = {
  async agentTypes() { return unwrap<AgentTemplate[]>(await api.get(`${root}/agent-types`)); },
  async settings() { return unwrap<FollowUpSettings>(await api.get(`${root}/settings/follow-up`)); },
  async setSettings(enabled: boolean, reason = '') { return unwrap<FollowUpSettings>(await api.put(`${root}/settings/follow-up`, { enabled, reason })); },
  async setEscalationRecipients(escalationUserIds: string[]) { return unwrap<FollowUpSettings>(await api.put(`${root}/settings/follow-up`, { escalationUserIds })); },
  async summary(params: { agentId?: string; campaignId?: string; from?: string; to?: string } = {}) { return unwrap<FollowUpSummary>(await api.get(`${root}/follow-ups/summary`, { params })); },
  async campaignSummary(campaignId: string) { return unwrap<FollowUpSummary>(await api.get(`${root}/campaigns/${campaignId}/follow-ups/summary`)); },
  /** CSV of follow-ups (one row each, with the latest AI call). */
  async exportCsv(params: { agentId?: string; campaignId?: string; from?: string; to?: string } = {}): Promise<Blob> {
    const res = (await api.get(params.campaignId ? `${root}/campaigns/${params.campaignId}/follow-ups/export` : `${root}/follow-ups/export`,
      { params: params.campaignId ? {} : params, responseType: 'blob' })) as unknown as { _raw?: { data?: Blob }; data?: Blob };
    // A CSV response is not the JSON envelope: the interceptor returns the raw axios response.
    return (res?._raw?.data ?? res?.data) as Blob;
  },
  async agentQueue(agentId: string, state?: string) { return unwrap<AgentFollowUpItem[]>(await api.get(`${root}/agents/${agentId}/follow-ups`, { params: { ...(state ? { state } : {}), limit: 50 } })); },
  async callNow(id: string) { return unwrap<unknown>(await api.post(`${root}/follow-ups/${id}/call-now`)); },
  async pause(id: string) { return unwrap<unknown>(await api.post(`${root}/follow-ups/${id}/pause`)); },
  async resume(id: string) { return unwrap<unknown>(await api.post(`${root}/follow-ups/${id}/resume`)); },
};
