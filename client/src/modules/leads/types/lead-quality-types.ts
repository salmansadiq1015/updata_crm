// Lead quality: explainable scoring + duplicate review / merge.
// Mirrors server/src/modules/crm/leadScoring.engine.js and leadMerge.service.js.

export type LeadScoreBand = 'hot' | 'warm' | 'cold' | 'unscored';
export const LEAD_SCORE_BANDS: LeadScoreBand[] = ['hot', 'warm', 'cold', 'unscored'];

/** The compact copy stored on the lead (`lead.score`). */
export type LeadScoreSummary = {
  value: number;
  band: LeadScoreBand;
  version: number;
  computedAt: string | null;
  disqualified: boolean;
  factors: Array<{ key: string; points: number; maxPoints: number }>;
};

export type LeadScoreEvidenceRef = { type: string; id: string | null };

export type LeadScoreEvidence = {
  field: string;
  value: unknown;
  source: string | null;
  at: string | null;
  ref: LeadScoreEvidenceRef | null;
  quote?: string | null;
  note?: string | null;
};

export type LeadScoreFactor = {
  key: string;
  label: string;
  group: 'business' | 'qualification' | 'engagement' | string;
  points: number;
  maxPoints: number;
  minPoints?: number;
  evidence: LeadScoreEvidence | null;
};

export type LeadScoreMissing = { key: string; label: string; group: string; reason: string };

/** `GET /crm/leads/:id/score` */
export type LeadScoreExplanation = {
  leadId: string;
  score: number;
  band: LeadScoreBand;
  disqualified: boolean;
  version: number;
  engineVersion: string | null;
  computedAt: string | null;
  factors: LeadScoreFactor[];
  missing: LeadScoreMissing[];
  stored: LeadScoreSummary | null;
  stale: boolean;
};

export type ScoringTier = { min: number; multiplier: number };
export type RecencyTier = { maxDays: number; multiplier: number };

export type LeadScoringConfig = {
  version: number;
  source: 'default' | 'stored';
  bands: { hot: number; warm: number };
  minEvidence: number;
  targetBusinessTypes: string[];
  targetCities: string[];
  factors: Record<string, { enabled: boolean; maxPoints: number }>;
  rules: {
    ratingTiers: ScoringTier[];
    reviewTiers: ScoringTier[];
    connectedCallTiers: ScoringTier[];
    smsReplyTiers: ScoringTier[];
    recencyTiers: RecencyTier[];
    decisionAuthority: Record<string, number>;
    timeline: Record<string, number>;
    interest: Record<string, number>;
  };
  note: string | null;
  createdAt: string | null;
  recompute: { status: string; processed: number; failed: number } | null;
};

export type LeadScoringFactorMeta = { key: string; group: string; label: string; penalty: boolean };

export type LeadScoringConfigResponse = {
  config: LeadScoringConfig;
  engineVersion: string;
  factors: LeadScoringFactorMeta[];
  defaults: LeadScoringConfig;
};

export type LeadScoringConfigInput = Pick<LeadScoringConfig, 'bands' | 'minEvidence' | 'targetBusinessTypes' | 'targetCities' | 'factors' | 'rules'> & {
  note?: string | null;
};

export type LeadScoringPreview = {
  leadId: string;
  leadName: string;
  current: LeadScoreExplanation;
  preview: LeadScoreExplanation;
};

// ── Duplicates ───────────────────────────────────────────────────────────────

export type DuplicateMethod = 'PLACE_ID' | 'PHONE' | 'EMAIL' | 'WEBSITE' | 'NAME_POSTAL' | 'NAME_NEARBY' | 'BUSINESS_IDENTITY';

export type DuplicateReason = { method: DuplicateMethod | string; value: string | null; confidence: number };

export type DuplicateLeadSummary = {
  id: string;
  leadNumber: string | null;
  name: string;
  status: string;
  source: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  postalCode: string | null;
  street: string | null;
  createdAt: string | null;
  lastContactedAt: string | null;
  score: LeadScoreSummary | null;
};

export type DuplicatePair = {
  id: string;
  leadIds: [string, string];
  reasons: DuplicateReason[];
  confidence: number;
};

export type DuplicateGroup = {
  id: string;
  confidence: number;
  leads: DuplicateLeadSummary[];
  pairs: DuplicatePair[];
};

export type DuplicateGroupsResponse = { groups: DuplicateGroup[]; total: number; openPairs: number };

// ── Merge ────────────────────────────────────────────────────────────────────

export const MERGEABLE_FIELDS = [
  'name', 'type', 'status', 'phone', 'mobile', 'email', 'website', 'address', 'location', 'providerMeta', 'social', 'assignedTo', 'notes',
] as const;
export type MergeableField = (typeof MERGEABLE_FIELDS)[number];
export type FieldWinner = 'survivor' | 'loser' | 'both';
export type FieldSelections = Partial<Record<MergeableField, FieldWinner>>;

export type MergePreviewField = {
  field: MergeableField;
  survivorValue: unknown;
  loserValue: unknown;
  same: boolean;
  defaultWinner: 'survivor' | 'loser';
};

export type MergePreviewCount = { key: string; label: string; move: number; retained: number; consentUpgrades: number };

export type MergePreview = {
  survivor: Record<string, unknown> & { _id: string; name: string; leadNumber: string | null };
  loser: Record<string, unknown> & { _id: string; name: string; leadNumber: string | null };
  fields: MergePreviewField[];
  counts: MergePreviewCount[];
  totalToMove: number;
  qualification: { takeoverKeys: string[]; historyToAdd: number };
  tagsToAdd: string[];
};

export type LeadMergeStatus = 'in_progress' | 'completed' | 'undoing' | 'undone';

export type LeadMergeRecord = {
  id: string;
  survivorId: string;
  loserId: string;
  survivorName: string | null;
  loserName: string | null;
  survivorNumber: string | null;
  loserNumber: string | null;
  status: LeadMergeStatus;
  counts: Record<string, { moved: number; retained: number; consentUpgrades: number }>;
  mergedBy: { firstName?: string | null; lastName?: string | null; email?: string | null } | string | null;
  createdAt: string | null;
  completedAt: string | null;
  undoneAt: string | null;
  lastError: string | null;
};
