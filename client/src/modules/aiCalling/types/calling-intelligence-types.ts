import type { CallRecord, CallTranscriptTurn } from './ai-calling-types';

export type IntelligenceCategory = 'objection' | 'need' | 'budget' | 'authority' | 'urgency' | 'timeline';
export type IntelligenceItemStatus = 'accepted' | 'needs_review' | 'user_accepted' | 'user_edited' | 'user_rejected';

export interface IntelligenceItem {
  id: string;
  category: IntelligenceCategory;
  value: string;
  normalized: string | number | null;
  quote: string;
  turnIndex: number;
  turnItemId?: string | null;
  speaker: 'lead' | 'agent';
  startMs?: number | null;
  confidence: number | null;
  status: IntelligenceItemStatus;
  reviewReasons: string[];
  review?: { decision: 'accept' | 'edit' | 'reject'; decidedBy: string; decidedAt: string; previousValue?: { value: string; normalized: unknown } | null; note?: string };
  leadWrite?: { status: 'applied' | 'skipped' | 'failed'; fieldKey?: string | null; source?: string | null; reason?: string | null; at?: string };
}

export interface ComplianceFlag {
  kind: 'unapproved_price' | 'unapproved_promise' | 'forbidden_claim';
  turnIndex: number;
  quote: string;
  detail: string;
  severity: 'medium' | 'high';
}

export interface CallIntelligence {
  version: number;
  status: 'pending' | 'ok' | 'partial' | 'failed' | 'skipped';
  reason?: string | null;
  error?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  items: IntelligenceItem[];
  rejected: Array<{ category: string | null; quote: string; turnIndex: number | null; reason: string }>;
  pendingReview: number;
  complianceFlags: ComplianceFlag[];
  runs?: number;
  completedAt?: string | null;
}

export type HandoffStatus = 'ringing' | 'accepted' | 'declined' | 'timeout' | 'unavailable' | 'failed';
export interface CallHandoff {
  requestedAt: string;
  reason: string;
  summary: string;
  status: HandoffStatus;
  mode?: 'web' | 'phone' | null;
  targetUserId?: string | null;
  acceptedAt?: string | null;
  joinedAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  failure?: { code?: string | null; message?: string | null };
  skipped?: Array<{ userId: string; reason: string }>;
  fallback?: { script?: string | null; language?: string | null; offeredAt?: string | null; followUp?: { state?: string | null; kind?: string | null; id?: string | null; preferredTime?: string | null; reason?: string | null } };
  events: Array<{ at: string; type: string; userId?: string | null; detail?: string }>;
}

export interface CallKnowledgeStamp { versionId?: string | null; version?: number | null; mode: 'latest' | 'pinned' | 'none'; entryCount?: number }

export type IntelligentCallRecord = CallRecord & { intelligence?: CallIntelligence | null; handoff?: CallHandoff | null; knowledge?: CallKnowledgeStamp | null };

export interface ReviewQueueRow {
  recordId: string;
  callId: string;
  endedAt: string | null;
  lead: { _id: string; name: string; leadNumber?: string } | null;
  item: IntelligenceItem;
  context: Array<{ turnIndex: number; role: CallTranscriptTurn['role']; text: string }>;
}

export type KnowledgeType = 'product' | 'pricing' | 'policy' | 'promise' | 'faq';
export type KnowledgeStatus = 'draft' | 'pending_approval' | 'approved' | 'archived';
export interface KnowledgePrice { amount: number | null; currency: string | null; unit?: string | null; validUntil?: string | null }
export interface KnowledgeVariant { language: string; title?: string; content?: string }
export interface KnowledgeContent {
  type: KnowledgeType;
  title: string;
  content: string;
  price?: KnowledgePrice | null;
  allowedPromises: string[];
  forbiddenClaims: string[];
  variants: KnowledgeVariant[];
  tags: string[];
}
export interface KnowledgeEntry extends KnowledgeContent {
  _id: string;
  status: KnowledgeStatus;
  revision: number;
  approvedBy?: string | null;
  approvedAt?: string | null;
  approvedRevision?: number | null;
  rejectionNote?: string | null;
  publishedRevision?: number | null;
  inLatestVersion?: boolean;
  updatedAt: string;
}
export interface KnowledgeVersionSummary { _id: string; version: number; publishedAt: string; entryCount: number; note?: string; rollbackOf?: number | null; publishedBy?: { firstName?: string; lastName?: string; email?: string } | null }
export interface KnowledgeVersion extends KnowledgeVersionSummary { entries: Array<KnowledgeContent & { entryId: string; revision: number }> }
export interface KnowledgeList { entries: KnowledgeEntry[]; latestVersion: { _id: string; version: number; publishedAt: string; entryCount: number } | null }
export interface KnowledgeDiff {
  fromVersion: number | null; toVersion: number | null;
  added: Array<{ entryId: string; title: string; type: KnowledgeType }>;
  removed: Array<{ entryId: string; title: string; type: KnowledgeType }>;
  changed: Array<{ entryId: string; title: string; type: KnowledgeType; fields: Array<{ field: string; before: string | null; after: string | null }> }>;
}

export interface AgentIntelligenceConfig {
  knowledge?: { mode: 'latest' | 'pinned' | 'none'; versionId?: string | null };
  transfer?: { enabled: boolean; targetUserIds: string[]; timeoutSeconds: number; allowPhoneTransfer: boolean };
}

export interface TransferPresence {
  available: boolean;
  phone?: string | null;
  workingHours?: { timezone?: string; days?: string[]; start?: string | null; end?: string | null } | null;
  online: boolean;
  withinHours: boolean;
}
export interface TransferTarget { _id: string; name: string; email: string; available: boolean; online: boolean; withinHours: boolean; hasPhone: boolean }
export interface TransferOffer {
  recordId: string;
  callId: string;
  agentName: string;
  campaignName: string;
  lead: { _id: string; name: string; leadNumber?: string; city?: string | null; status?: string } | null;
  reason: string;
  summary: string;
  transcript: Array<{ role: CallTranscriptTurn['role']; text: string; at: string }>;
  captured: Array<{ fieldKey: string; label: string; value: string }>;
  extracted: Array<{ category: IntelligenceCategory; value: string; quote: string }>;
  expiresAt: string | null;
  modes: { web: boolean; phone: boolean };
}
export interface TransferJoin { url: string; token: string; roomName: string; identity: string }
