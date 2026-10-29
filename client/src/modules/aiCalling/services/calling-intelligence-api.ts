import api from '@/lib/api/client';
import type {
  AgentIntelligenceConfig, CallHandoff, CallIntelligence, CallKnowledgeStamp, KnowledgeContent, KnowledgeDiff, KnowledgeEntry, KnowledgeList,
  KnowledgeVersion, KnowledgeVersionSummary, ReviewQueueRow, TransferJoin, TransferOffer, TransferPresence, TransferTarget,
} from '../types/calling-intelligence-types';

const root = '/ai-calling';
const unwrap = <T,>(res: unknown): T => (res as { data: T }).data;
type Pagination = { page: number; limit: number; total: number; pages: number };
const paged = <T,>(res: unknown): { data: T; pagination: Pagination } => {
  const r = res as { data: T; pagination?: Pagination | null };
  return { data: r.data, pagination: r.pagination ?? { page: 1, limit: 25, total: 0, pages: 0 } };
};

export const callingIntelligenceApi = {
  // Evidence-linked extraction + review queue
  async callIntelligence(recordId: string) { return unwrap<{ intelligence: CallIntelligence | null; knowledge: CallKnowledgeStamp | null; handoff: CallHandoff | null }>(await api.get(`${root}/calls/${recordId}/intelligence`)); },
  async rerun(recordId: string) { return unwrap<{ status: string }>(await api.post(`${root}/calls/${recordId}/intelligence/rerun`)); },
  async reviewQueue(params: { page?: number; category?: string } = {}) { return paged<ReviewQueueRow[]>(await api.get(`${root}/intelligence/review`, { params })); },
  async decide(recordId: string, itemId: string, body: { decision: 'accept' | 'edit' | 'reject'; value?: string; normalized?: string | number | null; note?: string }) {
    return unwrap<{ itemId: string; status: string; leadWrite: { status: string; reason?: string | null } | null; leadFieldUnchanged: boolean }>(await api.post(`${root}/calls/${recordId}/intelligence/items/${itemId}/decision`, body));
  },

  // Approved knowledge
  async knowledge(params: { status?: string; type?: string; search?: string } = {}) { return paged<KnowledgeList>(await api.get(`${root}/knowledge`, { params: { limit: 200, ...params } })); },
  async createEntry(input: KnowledgeContent) { return unwrap<KnowledgeEntry>(await api.post(`${root}/knowledge`, input)); },
  async updateEntry(id: string, input: Partial<KnowledgeContent> & { revision: number }) { return unwrap<KnowledgeEntry>(await api.patch(`${root}/knowledge/${id}`, input)); },
  async entryAction(id: string, action: 'submit' | 'approve' | 'reject' | 'archive' | 'restore', body: Record<string, unknown> = {}) { return unwrap<KnowledgeEntry>(await api.post(`${root}/knowledge/${id}/${action}`, body)); },
  async versions() { return paged<KnowledgeVersionSummary[]>(await api.get(`${root}/knowledge/versions`, { params: { limit: 50 } })); },
  async version(id: string) { return unwrap<KnowledgeVersion>(await api.get(`${root}/knowledge/versions/${id}`)); },
  async publish(note = '') { return unwrap<KnowledgeVersion>(await api.post(`${root}/knowledge/versions`, { note })); },
  async rollback(id: string, note = '') { return unwrap<KnowledgeVersion>(await api.post(`${root}/knowledge/versions/${id}/rollback`, { note })); },
  async diff(id: string, from?: string) { return unwrap<KnowledgeDiff>(await api.get(`${root}/knowledge/versions/${id}/diff`, { params: from ? { from } : {} })); },
  async setAgentKnowledge(agentId: string, body: { mode: 'latest' | 'pinned' | 'none'; versionId?: string | null; version?: number }) {
    return unwrap<{ knowledge: AgentIntelligenceConfig['knowledge']; version: number }>(await api.put(`${root}/agents/${agentId}/knowledge`, body));
  },

  // Human transfer
  async presence() { return unwrap<TransferPresence>(await api.get(`${root}/transfer/presence`)); },
  async setPresence(body: Partial<Pick<TransferPresence, 'available' | 'phone' | 'workingHours'>>) { return unwrap<TransferPresence>(await api.put(`${root}/transfer/presence`, body)); },
  async targets() { return unwrap<TransferTarget[]>(await api.get(`${root}/transfer/targets`)); },
  async offers() { return unwrap<TransferOffer[]>(await api.get(`${root}/transfer/offers`)); },
  async accept(recordId: string, mode: 'web' | 'phone') { return unwrap<{ status: string; mode: string; join?: TransferJoin }>(await api.post(`${root}/transfer/${recordId}/accept`, { mode })); },
  async decline(recordId: string) { return unwrap<{ declined: boolean }>(await api.post(`${root}/transfer/${recordId}/decline`)); },
  async joined(recordId: string) { return unwrap<{ acknowledged: boolean }>(await api.post(`${root}/transfer/${recordId}/joined`)); },
  async setAgentTransfer(agentId: string, body: { enabled: boolean; targetUserIds: string[]; timeoutSeconds: number; allowPhoneTransfer: boolean; version?: number }) {
    return unwrap<{ transfer: AgentIntelligenceConfig['transfer']; version: number }>(await api.put(`${root}/agents/${agentId}/transfer`, body));
  },
};
