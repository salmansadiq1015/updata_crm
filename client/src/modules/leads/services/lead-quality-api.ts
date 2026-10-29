import apiClient from '@/lib/api/client';
import type {
  DuplicateGroup,
  DuplicateGroupsResponse,
  DuplicateLeadSummary,
  FieldSelections,
  LeadMergeRecord,
  LeadScoreBand,
  LeadScoreExplanation,
  LeadScoreFactor,
  LeadScoreSummary,
  LeadScoringConfigInput,
  LeadScoringConfigResponse,
  LeadScoringPreview,
  MergePreview,
} from '../types/lead-quality-types';

/**
 * Lead quality API: explainable score, scoring config (admin), duplicate review
 * queue and merges. Parsing is tolerant: unknown fields are ignored and absent
 * values become null — nothing is invented client-side.
 */

export const LEAD_QUALITY_ENDPOINTS = {
  SCORE: (leadId: string) => `/crm/leads/${leadId}/score`,
  SCORE_RECALC: (leadId: string) => `/crm/leads/${leadId}/score/recalculate`,
  SCORING_CONFIG: '/crm/lead-scoring/config',
  SCORING_PREVIEW: '/crm/lead-scoring/preview',
  SCORING_RECOMPUTE: '/crm/lead-scoring/recompute',
  DUPLICATES: '/crm/lead-duplicates',
  DUPLICATES_SCAN: '/crm/lead-duplicates/scan',
  DUPLICATE_DISMISS: (id: string) => `/crm/lead-duplicates/${id}/dismiss`,
  MERGES: '/crm/lead-merges',
  MERGE_PREVIEW: '/crm/lead-merges/preview',
  MERGE_RESUME: (id: string) => `/crm/lead-merges/${id}/resume`,
  MERGE_UNDO: (id: string) => `/crm/lead-merges/${id}/undo`,
} as const;

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const id = (v: unknown): string => {
  if (typeof v === 'string') return v;
  const r = rec(v);
  return typeof r.$oid === 'string' ? r.$oid : (v != null ? String(v) : '');
};
const BANDS: LeadScoreBand[] = ['hot', 'warm', 'cold', 'unscored'];
const band = (v: unknown): LeadScoreBand => (BANDS.includes(v as LeadScoreBand) ? (v as LeadScoreBand) : 'unscored');

/** `lead.score` as stored on the lead; null when the lead was never scored. */
export function parseLeadScore(value: unknown): LeadScoreSummary | null {
  const r = rec(value);
  if (typeof r.value !== 'number') return null;
  return {
    value: r.value,
    band: band(r.band),
    version: num(r.version, 1),
    computedAt: str(r.computedAt),
    disqualified: r.disqualified === true,
    factors: (Array.isArray(r.factors) ? r.factors : []).map((f) => {
      const x = rec(f);
      return { key: String(x.key ?? ''), points: num(x.points), maxPoints: num(x.maxPoints) };
    }),
  };
}

function parseFactor(value: unknown): LeadScoreFactor {
  const r = rec(value);
  const ev = r.evidence ? rec(r.evidence) : null;
  const ref = ev?.ref ? rec(ev.ref) : null;
  return {
    key: String(r.key ?? ''),
    label: String(r.label ?? r.key ?? ''),
    group: String(r.group ?? ''),
    points: num(r.points),
    maxPoints: num(r.maxPoints),
    ...(typeof r.minPoints === 'number' ? { minPoints: r.minPoints } : {}),
    evidence: ev ? {
      field: String(ev.field ?? ''),
      value: ev.value ?? null,
      source: str(ev.source),
      at: str(ev.at),
      ref: ref ? { type: String(ref.type ?? ''), id: str(ref.id) } : null,
      quote: str(ev.quote),
      note: str(ev.note),
    } : null,
  };
}

export function parseScoreExplanation(value: unknown): LeadScoreExplanation {
  const r = rec(value);
  return {
    leadId: id(r.leadId),
    score: num(r.score),
    band: band(r.band),
    disqualified: r.disqualified === true,
    version: num(r.version, 1),
    engineVersion: str(r.engineVersion),
    computedAt: str(r.computedAt),
    factors: (Array.isArray(r.factors) ? r.factors : []).map(parseFactor),
    missing: (Array.isArray(r.missing) ? r.missing : []).map((m) => {
      const x = rec(m);
      return { key: String(x.key ?? ''), label: String(x.label ?? x.key ?? ''), group: String(x.group ?? ''), reason: String(x.reason ?? '') };
    }),
    stored: parseLeadScore(r.stored),
    stale: r.stale === true,
  };
}

function parseDuplicateLead(value: unknown): DuplicateLeadSummary {
  const r = rec(value);
  const address = rec(r.address);
  return {
    id: id(r._id ?? r.id),
    leadNumber: str(r.leadNumber),
    name: String(r.name ?? ''),
    status: String(r.status ?? 'new'),
    source: str(r.source),
    phone: str(r.phone),
    mobile: str(r.mobile),
    email: str(r.email),
    website: str(r.website),
    city: str(address.city),
    postalCode: str(address.postalCode),
    street: str(address.street),
    createdAt: str(r.createdAt),
    lastContactedAt: str(r.lastContactedAt),
    score: parseLeadScore(r.score),
  };
}

export function parseDuplicateGroups(value: unknown): DuplicateGroupsResponse {
  const r = rec(value);
  const groups: DuplicateGroup[] = (Array.isArray(r.groups) ? r.groups : []).map((g) => {
    const x = rec(g);
    return {
      id: String(x.id ?? ''),
      confidence: num(x.confidence),
      leads: (Array.isArray(x.leads) ? x.leads : []).map(parseDuplicateLead),
      pairs: (Array.isArray(x.pairs) ? x.pairs : []).map((p) => {
        const y = rec(p);
        const ids = (Array.isArray(y.leadIds) ? y.leadIds : []).map(id);
        return {
          id: id(y.id ?? y._id),
          leadIds: [ids[0] ?? '', ids[1] ?? ''] as [string, string],
          reasons: (Array.isArray(y.reasons) ? y.reasons : []).map((reason) => {
            const z = rec(reason);
            return { method: String(z.method ?? ''), value: str(z.value), confidence: num(z.confidence) };
          }),
          confidence: num(y.confidence),
        };
      }),
    };
  });
  return { groups, total: num(r.total, groups.length), openPairs: num(r.openPairs) };
}

export function parseMergeRecord(value: unknown): LeadMergeRecord {
  const r = rec(value);
  const counts: LeadMergeRecord['counts'] = {};
  for (const [key, c] of Object.entries(rec(r.counts))) {
    const x = rec(c);
    counts[key] = { moved: num(x.moved), retained: num(x.retained), consentUpgrades: num(x.consentUpgrades) };
  }
  const mergedBy = r.mergedBy && typeof r.mergedBy === 'object' ? rec(r.mergedBy) : r.mergedBy;
  return {
    id: id(r.id ?? r._id),
    survivorId: id(r.survivorId),
    loserId: id(r.loserId),
    survivorName: str(r.survivorName),
    loserName: str(r.loserName),
    survivorNumber: str(r.survivorNumber),
    loserNumber: str(r.loserNumber),
    status: (str(r.status) ?? 'completed') as LeadMergeRecord['status'],
    counts,
    mergedBy: typeof mergedBy === 'string' ? mergedBy : (mergedBy ? {
      firstName: str((mergedBy as Rec).firstName), lastName: str((mergedBy as Rec).lastName), email: str((mergedBy as Rec).email),
    } : null),
    createdAt: str(r.createdAt),
    completedAt: str(r.completedAt),
    undoneAt: str(r.undoneAt),
    lastError: str(r.lastError),
  };
}

type Envelope = { data?: unknown; pagination?: { hasNext?: boolean; nextCursor?: string | null } | null };
const env = (v: unknown) => v as Envelope;

export const leadQualityApi = {
  async getScore(leadId: string): Promise<LeadScoreExplanation> {
    return parseScoreExplanation(env(await apiClient.get(LEAD_QUALITY_ENDPOINTS.SCORE(leadId))).data);
  },
  async recalculateScore(leadId: string): Promise<LeadScoreExplanation> {
    return parseScoreExplanation(env(await apiClient.post(LEAD_QUALITY_ENDPOINTS.SCORE_RECALC(leadId))).data);
  },
  async getScoringConfig(): Promise<LeadScoringConfigResponse> {
    return env(await apiClient.get(LEAD_QUALITY_ENDPOINTS.SCORING_CONFIG)).data as LeadScoringConfigResponse;
  },
  async saveScoringConfig(input: LeadScoringConfigInput): Promise<LeadScoringConfigResponse> {
    return env(await apiClient.put(LEAD_QUALITY_ENDPOINTS.SCORING_CONFIG, input)).data as LeadScoringConfigResponse;
  },
  async previewScoringConfig(leadId: string, config: LeadScoringConfigInput): Promise<LeadScoringPreview> {
    const data = rec(env(await apiClient.post(LEAD_QUALITY_ENDPOINTS.SCORING_PREVIEW, { leadId, config })).data);
    return {
      leadId: id(data.leadId),
      leadName: String(data.leadName ?? ''),
      current: parseScoreExplanation(data.current),
      preview: parseScoreExplanation(data.preview),
    };
  },
  async recomputeAll(): Promise<void> {
    await apiClient.post(LEAD_QUALITY_ENDPOINTS.SCORING_RECOMPUTE);
  },
  async listDuplicates(params: { minConfidence?: number; limit?: number } = {}): Promise<DuplicateGroupsResponse> {
    return parseDuplicateGroups(env(await apiClient.get(LEAD_QUALITY_ENDPOINTS.DUPLICATES, { params })).data);
  },
  async scanDuplicates(): Promise<void> {
    await apiClient.post(LEAD_QUALITY_ENDPOINTS.DUPLICATES_SCAN);
  },
  async dismissDuplicate(candidateId: string, reason?: string): Promise<void> {
    await apiClient.post(LEAD_QUALITY_ENDPOINTS.DUPLICATE_DISMISS(candidateId), { reason: reason || null });
  },
  async previewMerge(survivorId: string, loserId: string): Promise<MergePreview> {
    return env(await apiClient.get(LEAD_QUALITY_ENDPOINTS.MERGE_PREVIEW, { params: { survivorId, loserId } })).data as MergePreview;
  },
  async merge(input: { survivorId: string; loserId: string; candidateId?: string | null; fieldSelections: FieldSelections }): Promise<LeadMergeRecord> {
    return parseMergeRecord(env(await apiClient.post(LEAD_QUALITY_ENDPOINTS.MERGES, input)).data);
  },
  async listMerges(params: { limit?: number; cursor?: string | null } = {}): Promise<{ data: LeadMergeRecord[]; nextCursor: string | null }> {
    const res = env(await apiClient.get(LEAD_QUALITY_ENDPOINTS.MERGES, { params }));
    return {
      data: (Array.isArray(res.data) ? res.data : []).map(parseMergeRecord),
      nextCursor: res.pagination?.hasNext ? (res.pagination.nextCursor ?? null) : null,
    };
  },
  async resumeMerge(mergeId: string): Promise<LeadMergeRecord> {
    return parseMergeRecord(env(await apiClient.post(LEAD_QUALITY_ENDPOINTS.MERGE_RESUME(mergeId))).data);
  },
  async undoMerge(mergeId: string): Promise<LeadMergeRecord> {
    return parseMergeRecord(env(await apiClient.post(LEAD_QUALITY_ENDPOINTS.MERGE_UNDO(mergeId))).data);
  },
};
