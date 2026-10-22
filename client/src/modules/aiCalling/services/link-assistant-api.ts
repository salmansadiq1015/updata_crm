import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { LinkAnalytics, LinkSession, LinkSessionDetail, LinkSettings } from '../types/ai-calling-types';
import type { Paged } from './ai-calling-api';

const E = ENDPOINTS.LINK_ASSISTANT;
// apiClient's response interceptor unwraps the envelope to { data, pagination }.
const unwrap = <T,>(res: unknown): T => ((res as { data?: T }).data ?? res) as T;

export const linkAssistantApi = {
  async settings(): Promise<LinkSettings> {
    return unwrap<LinkSettings>(await apiClient.get(E.SETTINGS));
  },
  async setPaused(paused: boolean, reason = ''): Promise<LinkSettings> {
    return unwrap<LinkSettings>(await apiClient.put(E.KILL_SWITCH, { paused, reason }));
  },
  async sessions(params: { campaignId?: string; status?: string; page?: number; limit?: number } = {}): Promise<Paged<LinkSession>> {
    const r = (await apiClient.get(E.SESSIONS, { params })) as { data?: LinkSession[]; pagination?: Paged<LinkSession>['pagination'] };
    return { data: r.data ?? [], pagination: r.pagination ?? { page: 1, limit: 25, total: 0, pages: 0 } };
  },
  async session(id: string): Promise<LinkSessionDetail> {
    return unwrap<LinkSessionDetail>(await apiClient.get(E.SESSION(id)));
  },
  async revoke(id: string): Promise<{ revoked: boolean }> {
    return unwrap<{ revoked: boolean }>(await apiClient.post(E.REVOKE(id), {}));
  },
  async analytics(campaignId: string): Promise<LinkAnalytics> {
    return unwrap<LinkAnalytics>(await apiClient.get(E.ANALYTICS(campaignId)));
  },
  async preview(campaignId: string, leadId: string | null = null): Promise<{ url: string; sessionId: string }> {
    return unwrap<{ url: string; sessionId: string }>(await apiClient.post(E.PREVIEW(campaignId), { leadId }));
  },
  async exportCsv(campaignId: string): Promise<Blob> {
    const res = (await apiClient.get(E.EXPORT(campaignId), { responseType: 'blob' })) as { _raw?: { data?: Blob }; data?: Blob };
    return (res?._raw?.data ?? res?.data) as Blob;
  },
};
