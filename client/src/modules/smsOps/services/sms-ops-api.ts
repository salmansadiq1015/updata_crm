import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type {
  AnswerReview, CampaignSkips, ContactChannel, ContactPolicySettings, LeadContactStatus, Paged, RecoveryActionName,
  RecoveryCounts, RecoveryItem, ReviewDecision, SkipSource, SmsCallback, SmsDevice, ChannelDecision,
} from '../types/sms-ops-types';

// apiClient's response interceptor unwraps the envelope to { data, pagination }.
const unwrap = <T,>(res: unknown): T => ((res as { data?: T }).data ?? res) as T;
function paged<T>(res: unknown): Paged<T> {
  const r = res as { data?: T[]; pagination?: Paged<T>['pagination'] };
  return { data: r.data ?? [], pagination: r.pagination ?? { page: 1, limit: 25, total: 0, pages: 0 } };
}
const E = ENDPOINTS.SMS_OPS;
const C = ENDPOINTS.CONTACT_POLICY;

export const smsOpsApi = {
  async devices() { return unwrap<SmsDevice[]>(await apiClient.get(E.DEVICES)); },
  async device(deviceId: string) { return unwrap<SmsDevice>(await apiClient.get(E.DEVICE(deviceId))); },
  async resync(deviceId: string) { return unwrap<{ resyncRequestedAt: string }>(await apiClient.post(E.DEVICE_RESYNC(deviceId))); },

  async reviews(params: { status?: string; page?: number; limit?: number } = {}) { return paged<AnswerReview>(await apiClient.get(E.REVIEWS, { params })); },
  async reviewCounts() { return unwrap<{ pending: number }>(await apiClient.get(E.REVIEW_COUNTS)); },
  async resolveReview(id: string, body: { decisions: ReviewDecision[]; note?: string | null }) {
    return unwrap<AnswerReview>(await apiClient.post(E.REVIEW_RESOLVE(id), body));
  },

  async recovery(params: { type?: string; status?: string; page?: number; limit?: number } = {}) { return paged<RecoveryItem>(await apiClient.get(E.RECOVERY, { params })); },
  async recoveryCounts() { return unwrap<RecoveryCounts>(await apiClient.get(E.RECOVERY_COUNTS)); },
  async recoveryAction(id: string, body: { action: RecoveryActionName; leadId?: string; subscriptionId?: number | null; note?: string | null }) {
    return unwrap<RecoveryItem>(await apiClient.post(E.RECOVERY_ACTION(id), body));
  },
  async bulkDismiss(ids: string[], note?: string | null) { return unwrap<{ dismissed: number }>(await apiClient.post(E.RECOVERY_BULK_DISMISS, { ids, note })); },

  async callbacks() { return unwrap<SmsCallback[]>(await apiClient.get(E.CALLBACKS)); },

  async policy() { return unwrap<ContactPolicySettings>(await apiClient.get(C.SETTINGS)); },
  async savePolicy(body: Partial<ContactPolicySettings>) { return unwrap<ContactPolicySettings>(await apiClient.put(C.SETTINGS, body)); },
  async leadStatus(leadId: string) { return unwrap<LeadContactStatus>(await apiClient.get(C.LEAD(leadId))); },
  async leadCheck(leadId: string, channel: ContactChannel, campaignId?: string) {
    return unwrap<ChannelDecision>(await apiClient.get(C.LEAD_CHECK(leadId), { params: { channel, ...(campaignId ? { campaignId } : {}) } }));
  },
  async campaignSkips(source: SkipSource, campaignId: string) { return unwrap<CampaignSkips>(await apiClient.get(C.CAMPAIGN_SKIPS(source, campaignId))); },
};
