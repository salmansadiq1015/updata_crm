import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type {
  ActiveCall, AgentLanguageList, Analytics, Campaign, CallConsentProfile, CallRecord, CreateCampaignInput, LeadTransition, SimResult, SimState, TelephonyHealth,
} from '../types/ai-calling-types';

// apiClient's response interceptor unwraps the envelope to { data, pagination }.
const unwrap = <T,>(res: unknown): T => ((res as { data?: T }).data ?? res) as T;

export interface Paged<T> { data: T[]; pagination: { page: number; limit: number; total: number; pages: number } }

function paged<T>(res: unknown): Paged<T> {
  const r = res as { data?: T[]; pagination?: Paged<T>['pagination'] };
  return { data: r.data ?? [], pagination: r.pagination ?? { page: 1, limit: 25, total: 0, pages: 0 } };
}

export const aiCallingApi = {
  async listCampaigns(params: { page?: number; limit?: number; status?: string } = {}): Promise<Paged<Campaign>> {
    return paged<Campaign>(await apiClient.get(ENDPOINTS.AI_CALLING.CAMPAIGNS, { params }));
  },
  async getCampaign(id: string): Promise<Campaign> {
    return unwrap<Campaign>(await apiClient.get(ENDPOINTS.AI_CALLING.CAMPAIGN(id)));
  },
  async createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    return unwrap<Campaign>(await apiClient.post(ENDPOINTS.AI_CALLING.CAMPAIGNS, input));
  },
  async updateCampaign(id: string, input: Partial<CreateCampaignInput>): Promise<Campaign> {
    return unwrap<Campaign>(await apiClient.patch(ENDPOINTS.AI_CALLING.CAMPAIGN(id), input));
  },
  async preview(id: string) {
    return unwrap<Record<string, unknown>>(await apiClient.post(ENDPOINTS.AI_CALLING.PREVIEW(id)));
  },
  async start(id: string, scheduledAt: string | null = null): Promise<Campaign> {
    return unwrap<Campaign>(await apiClient.post(ENDPOINTS.AI_CALLING.START(id), { scheduledAt }));
  },
  async pause(id: string): Promise<Campaign> {
    return unwrap<Campaign>(await apiClient.post(ENDPOINTS.AI_CALLING.PAUSE(id)));
  },
  async resume(id: string): Promise<Campaign> {
    return unwrap<Campaign>(await apiClient.post(ENDPOINTS.AI_CALLING.RESUME(id), {}));
  },
  async cancel(id: string): Promise<Campaign> {
    return unwrap<Campaign>(await apiClient.post(ENDPOINTS.AI_CALLING.CANCEL(id)));
  },
  async retry(id: string, recipientIds: string[] = []): Promise<{ retried: number }> {
    return unwrap<{ retried: number }>(await apiClient.post(ENDPOINTS.AI_CALLING.RETRY(id), { recipientIds }));
  },
  async recipients(id: string, params: { page?: number; limit?: number; state?: string } = {}) {
    return paged<Record<string, unknown>>(await apiClient.get(ENDPOINTS.AI_CALLING.RECIPIENTS(id), { params }));
  },
  async activeCalls(id: string): Promise<ActiveCall[]> {
    return unwrap<ActiveCall[]>(await apiClient.get(ENDPOINTS.AI_CALLING.ACTIVE_CALLS(id)));
  },
  async exportCsv(id: string): Promise<Blob> {
    // A CSV response is not the JSON envelope, so the interceptor returns the raw
    // axios response and response.data is the Blob.
    const res = (await apiClient.get(ENDPOINTS.AI_CALLING.EXPORT(id), { responseType: 'blob' })) as {
      _raw?: { data?: Blob }; data?: Blob;
    };
    return (res?._raw?.data ?? res?.data) as Blob;
  },
  async simulate(id: string, body: { state?: SimState | null; userText?: string | null; disclose?: boolean }): Promise<SimResult> {
    return unwrap<SimResult>(await apiClient.post(ENDPOINTS.AI_CALLING.SIMULATE(id), body));
  },
  async startWebTest(id: string, leadId?: string): Promise<{ callId: string; roomName: string; url: string; token: string }> {
    return unwrap(await apiClient.post(ENDPOINTS.AI_CALLING.WEB_TEST(id), leadId ? { leadId } : {}));
  },
  async getCall(id: string): Promise<CallRecord> {
    return unwrap<CallRecord>(await apiClient.get(ENDPOINTS.AI_CALLING.CALL(id)));
  },
  async reviewCall(
    id: string,
    payload: { answers?: Array<{ questionFieldKey: string; normalizedValue?: unknown; validation?: string }>; qualification?: string | null },
  ): Promise<CallRecord> {
    return unwrap<CallRecord>(await apiClient.post(ENDPOINTS.AI_CALLING.CALL_REVIEW(id), payload));
  },
  async leadHistory(leadId: string): Promise<{ data: CallRecord[]; transitions: LeadTransition[] }> {
    const [history, transitions] = await Promise.all([
      apiClient.get(ENDPOINTS.AI_CALLING.LEAD_HISTORY(leadId), { params: { limit: 50 } }),
      apiClient.get(ENDPOINTS.AI_CALLING.LEAD_TRANSITIONS(leadId)),
    ]);
    return { data: paged<CallRecord>(history).data, transitions: unwrap<LeadTransition[]>(transitions) ?? [] };
  },
  async suppress(input: { phone?: string; leadId?: string | null; reason?: 'do_not_contact' | 'invalid' | 'complaint' | 'admin'; note?: string }) {
    return unwrap<{ suppressed: boolean }>(await apiClient.post(ENDPOINTS.AI_CALLING.SUPPRESSIONS, input));
  },
  async callConsent(leadId: string): Promise<CallConsentProfile> {
    return unwrap<CallConsentProfile>(await apiClient.get(ENDPOINTS.AI_CALLING.LEAD_CONSENT(leadId)));
  },
  async updateCallConsent(leadId: string, input: {
    status: 'granted' | 'denied' | 'revoked'; evidence: string; source?: string;
    capturedAt?: string; expiresAt?: string | null; confirmation?: boolean;
  }): Promise<CallConsentProfile['consent']> {
    return unwrap(await apiClient.put(ENDPOINTS.AI_CALLING.LEAD_CONSENT(leadId), input));
  },
  async analytics(params: { from?: string; to?: string; campaignId?: string } = {}): Promise<Analytics> {
    return unwrap<Analytics>(await apiClient.get(ENDPOINTS.AI_CALLING.ANALYTICS, { params }));
  },
  async analyticsCsv(params: { from?: string; to?: string; campaignId?: string } = {}): Promise<Blob> {
    const res = (await apiClient.get(ENDPOINTS.AI_CALLING.ANALYTICS_EXPORT, { params, responseType: 'blob' })) as {
      _raw?: { data?: Blob }; data?: Blob;
    };
    return (res?._raw?.data ?? res?.data) as Blob;
  },
  async languages(): Promise<AgentLanguageList> {
    return unwrap<AgentLanguageList>(await apiClient.get(ENDPOINTS.AI_CALLING.LANGUAGES));
  },
  async telephonyHealth(): Promise<TelephonyHealth> {
    return unwrap<TelephonyHealth>(await apiClient.get(ENDPOINTS.AI_CALLING.TELEPHONY_HEALTH));
  },
};

export default aiCallingApi;
