import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type {
  ControlKind, InboundAnalytics, InboundCallDetail, InboundCallRow, InboundDevice, InboundSettings, InboundStats, QuestionTemplate,
  LiveCall, Paged, RecommendationAction, RuleTestResult,
} from '../types/inbound-call-types';
import type { rulePayload } from '../inbound-domain';
import type { AgentCallAnalytics } from '@/modules/aiCalling/types/ai-calling-types';

// apiClient's response interceptor unwraps the envelope to { data, pagination }.
const unwrap = <T,>(res: unknown): T => ((res as { data?: T }).data ?? res) as T;
function paged<T>(res: unknown): Paged<T> {
  const r = res as { data?: T[]; pagination?: Paged<T>['pagination'] };
  return { data: r.data ?? [], pagination: r.pagination ?? { page: 1, limit: 25, total: 0, pages: 0 } };
}
type Query = Record<string, string | number>;
const E = ENDPOINTS.INBOUND_CALLS;

export const inboundCallsApi = {
  /** Browser test of an incoming agent: the caller is you, in the browser. Recorded as a test only. */
  async startAgentTest(agentId: string): Promise<{ id: string; callId: string; roomName: string; url: string; token: string }> { return unwrap(await apiClient.post(E.AGENT_TEST(agentId))); },
  async list(params: Query): Promise<Paged<InboundCallRow>> { return paged<InboundCallRow>(await apiClient.get(E.LIST, { params })); },
  async stats(params: Query): Promise<InboundStats> { return unwrap<InboundStats>(await apiClient.get(E.STATS, { params })); },
  async analytics(params: Query): Promise<InboundAnalytics> { return unwrap<InboundAnalytics>(await apiClient.get(E.ANALYTICS, { params })); },
  async live(): Promise<LiveCall[]> { return unwrap<LiveCall[]>(await apiClient.get(E.LIVE)) ?? []; },
  async exportCsv(params: Query): Promise<Blob> {
    // A CSV response is not the JSON envelope: the interceptor returns the raw axios response.
    const res = (await apiClient.get(E.EXPORT, { params, responseType: 'blob' })) as { _raw?: { data?: Blob }; data?: Blob };
    return (res?._raw?.data ?? res?.data) as Blob;
  },
  /** Same response shape as the outbound agent call analytics, plus the inbound extras. */
  async costs(params: { from?: string; to?: string; agentId?: string }): Promise<AgentCallAnalytics> { return unwrap<AgentCallAnalytics>(await apiClient.get(E.COSTS, { params })); },
  async costsCsv(params: { from?: string; to?: string; agentId?: string }): Promise<Blob> {
    const res = (await apiClient.get(E.COSTS_EXPORT, { params, responseType: 'blob' })) as { _raw?: { data?: Blob }; data?: Blob };
    return (res?._raw?.data ?? res?.data) as Blob;
  },
  async devices(): Promise<InboundDevice[]> { return unwrap<InboundDevice[]>(await apiClient.get(E.DEVICES)) ?? []; },
  async settings(): Promise<InboundSettings> { return unwrap<InboundSettings>(await apiClient.get(E.SETTINGS)); },
  async updateSettings(patch: Record<string, unknown>): Promise<InboundSettings> { return unwrap<InboundSettings>(await apiClient.patch(E.SETTINGS, patch)); },
  async saveRule(rule: ReturnType<typeof rulePayload>): Promise<InboundSettings> { return unwrap<InboundSettings>(await apiClient.post(E.RULES, rule)); },
  async deleteRule(ruleId: string): Promise<InboundSettings> { return unwrap<InboundSettings>(await apiClient.delete(E.RULE(ruleId))); },
  async testRules(body: { number: string; deviceId: string | null; simSlot: number | null; at: string | null }): Promise<RuleTestResult> {
    return unwrap<RuleTestResult>(await apiClient.post(E.RULES_TEST, body));
  },
  async get(id: string): Promise<InboundCallDetail> { return unwrap<InboundCallDetail>(await apiClient.get(E.CALL(id))); },
  async addNote(id: string, text: string): Promise<InboundCallDetail> { return unwrap<InboundCallDetail>(await apiClient.post(E.NOTES(id), { text })); },
  async reviewField(id: string, fieldId: string, body: { action: 'confirm' | 'correct' | 'reject'; value?: string | null }): Promise<InboundCallDetail> {
    return unwrap<InboundCallDetail>(await apiClient.post(E.FIELD(id, fieldId), body));
  },
  async resolveMatch(id: string, leadId: string): Promise<InboundCallDetail> { return unwrap<InboundCallDetail>(await apiClient.post(E.MATCH(id), { leadId })); },
  async createLead(id: string, force = false): Promise<InboundCallDetail> { return unwrap<InboundCallDetail>(await apiClient.post(E.LEAD(id), force ? { force: true } : {})); },
  async updateWork(id: string, body: { status?: string; assignedTo?: string | null; note?: string }): Promise<InboundCallDetail> { return unwrap<InboundCallDetail>(await apiClient.patch(E.WORK(id), body)); },
  async questionTemplates(): Promise<{ templates: QuestionTemplate[]; types: string[]; standardKeys: string[] }> { return unwrap(await apiClient.get(E.QUESTION_TEMPLATES)); },
  async decideRecommendation(id: string, recId: string, body: { decision: 'execute' | 'dismiss'; dueAt?: string | null; note?: string | null; leadId?: string; createLead?: boolean }): Promise<InboundCallDetail> {
    return unwrap<InboundCallDetail>(await apiClient.post(E.RECOMMENDATION(id, recId), body));
  },
  async scheduleFollowUp(id: string, body: { dueAt: string; note?: string | null; action?: RecommendationAction; leadId?: string; createLead?: boolean }): Promise<{ followUpId: string; call?: InboundCallDetail }> {
    return unwrap<{ followUpId: string; call?: InboundCallDetail }>(await apiClient.post(E.FOLLOW_UP(id), body));
  },
  async control(id: string, kind: ControlKind): Promise<{ ok: boolean; duplicate?: boolean }> {
    return unwrap<{ ok: boolean; duplicate?: boolean }>(await apiClient.post(E.CONTROL(id, kind)));
  },
  async forLead(leadId: string): Promise<InboundCallRow[]> { return unwrap<InboundCallRow[]>(await apiClient.get(E.FOR_LEAD(leadId))) ?? []; },
};

export default inboundCallsApi;
