import api from '@/lib/api/client';
import type {
  AccessGrant, AccessLogFilters, AccessLogPage, GovernanceSettings, RevealField, RevealPurpose, RevealResult, Team, TeamInput,
} from '../types/governance-types';

/** Governance API — /api/v1/governance (teams, break-glass grants, PII reveal, access log). */
const root = '/governance';
type Envelope<T> = { data: T; pagination?: AccessLogPage['pagination'] | null };
const unwrap = <T,>(res: unknown): T => (res as Envelope<T>).data;

/** Values the server masked (PII_MASKING_ENABLED) contain this marker. */
export const MASK_MARKER = '***';
export const isMaskedValue = (value: string | null | undefined): boolean => typeof value === 'string' && value.includes(MASK_MARKER);

export const ACCESS_REASON_REQUIRED = 'ACCESS_REASON_REQUIRED';
export const isAccessReasonRequired = (error: unknown): boolean => (error as { code?: string } | null)?.code === ACCESS_REASON_REQUIRED;

export const governanceApi = {
  async settings() { return unwrap<GovernanceSettings>(await api.get(`${root}/settings`)); },

  async listTeams(params: { includeInactive?: boolean } = {}) { return unwrap<Team[]>(await api.get(`${root}/teams`, { params })); },
  async createTeam(input: TeamInput) { return unwrap<Team>(await api.post(`${root}/teams`, input)); },
  async updateTeam(id: string, input: TeamInput) { return unwrap<Team>(await api.patch(`${root}/teams/${id}`, input)); },
  async deleteTeam(id: string) { return unwrap<{ id: string; deleted: boolean }>(await api.delete(`${root}/teams/${id}`)); },

  async createGrant(leadId: string, reason: string) {
    return unwrap<AccessGrant>(await api.post(`${root}/access-grants`, { leadId, reason }));
  },
  async reveal(leadId: string, purpose: RevealPurpose, fields?: RevealField[]) {
    return unwrap<RevealResult>(await api.post(`${root}/leads/${leadId}/reveal`, { purpose, ...(fields ? { fields } : {}) }));
  },

  async accessLog(filters: AccessLogFilters & { cursor?: string | null; limit?: number } = {}): Promise<AccessLogPage> {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const res = await api.get(`${root}/access-log`, { params }) as unknown as Envelope<AccessLogPage['data']>;
    return { data: res.data ?? [], pagination: res.pagination ?? { hasNext: false, nextCursor: null, limit: 50 } };
  },
  async leadAccessLog(leadId: string, limit = 20): Promise<AccessLogPage> {
    const res = await api.get(`${root}/leads/${leadId}/access-log`, { params: { limit } }) as unknown as Envelope<AccessLogPage['data']>;
    return { data: res.data ?? [], pagination: res.pagination ?? { hasNext: false, nextCursor: null, limit } };
  },
};
