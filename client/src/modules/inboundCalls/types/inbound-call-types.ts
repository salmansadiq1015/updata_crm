/**
 * Incoming Calls (server/src/modules/inboundCalling). Shapes mirror
 * inboundQuery.service.js (presentRow, get, stats, analytics, live, devices) and
 * inboundCall.service.js (settings, rules, testRules). Every optional server field
 * is nullable: the UI says "not recorded" instead of inventing a value.
 */

import type { AnalyzedCallCost } from '@/modules/aiCalling/types/ai-calling-types';

export const CALL_STATUSES = [
  'DETECTED', 'RECEIVED', 'IDENTIFYING', 'QUEUED', 'RINGING', 'ANSWERING', 'ANSWERED', 'CONNECTING_AUDIO',
  'AI_ACTIVE', 'HUMAN_ACTIVE', 'TRANSFERRING', 'WRAPPING_UP',
  'COMPLETED', 'MISSED', 'REJECTED', 'FAILED', 'INTERRUPTED', 'CANCELLED',
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const AI_STATUSES = ['not_applicable', 'waiting', 'connecting', 'connected', 'speaking', 'listening', 'handed_off', 'unavailable', 'ended', 'failed'] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

export const AUDIO_STATUSES = ['none', 'connecting', 'connected', 'reconnecting', 'lost', 'closed'] as const;
export type AudioStatus = (typeof AUDIO_STATUSES)[number];

export const OUTCOMES = ['handled_by_ai', 'handled_by_human', 'transferred', 'missed', 'rejected', 'interrupted', 'failed', 'unanswered', 'cancelled'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const INQUIRY_CATEGORIES = [
  'SALES_INQUIRY', 'PRODUCT_INQUIRY', 'SERVICE_INQUIRY', 'PRICING_INQUIRY', 'SUPPORT_REQUEST', 'TECHNICAL_SUPPORT',
  'APPOINTMENT_REQUEST', 'CALLBACK_REQUEST', 'COMPLAINT', 'GENERAL_INFORMATION', 'OTHER',
] as const;
export type InquiryCategory = (typeof INQUIRY_CATEGORIES)[number];

export const QUALIFICATION_RESULTS = ['QUALIFIED', 'PARTIALLY_QUALIFIED', 'NOT_QUALIFIED', 'CALLBACK_REQUIRED', 'SUPPORT_REQUIRED', 'INFORMATION_ONLY', 'UNRESOLVED'] as const;
export type QualificationResult = (typeof QUALIFICATION_RESULTS)[number];

export const RULE_ACTIONS = ['ai_answer', 'human', 'ignore'] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

/** Rule condition caller types (ruleEngine CALLER_TYPES). */
export const RULE_CALLER_TYPES = ['any', 'unknown_number', 'existing_lead', 'private_number', 'ambiguous'] as const;
export type RuleCallerType = (typeof RULE_CALLER_TYPES)[number];

/** History filter caller types (validation listFilters.callerType). */
export const LIST_CALLER_TYPES = ['new', 'existing', 'private', 'ambiguous'] as const;
export type ListCallerType = (typeof LIST_CALLER_TYPES)[number];
/** What presentRow reports: private when the number was withheld, else the match status. */
export type RowCallerType = ListCallerType | 'unknown';

export const RECOMMENDATION_ACTIONS = [
  'SEND_SERVICE_INFO', 'SEND_PRICING', 'SCHEDULE_DEMO', 'ARRANGE_CALLBACK', 'ASSIGN_SALES_REP',
  'REQUEST_MISSING_INFO', 'ESCALATE_SUPPORT', 'RESOLVE_COMPLAINT', 'RETURN_MISSED_CALL', 'REVIEW_CALLER_MATCH',
] as const;
export type RecommendationAction = (typeof RECOMMENDATION_ACTIONS)[number];

export const CALLER_FIELD_KEYS = [
  'full_name', 'email', 'company', 'job_title', 'location', 'website', 'preferred_contact_method',
  'reason_for_call', 'service_interest', 'requirements', 'current_challenges', 'budget', 'timeline',
  'decision_role', 'additional_requirements', 'callback_time',
] as const;
export type CallerFieldKey = (typeof CALLER_FIELD_KEYS)[number];

/** Where the follow-up work on a call stands (separate from the call status). */
export const WORK_STATUSES = ['new', 'in_progress', 'follow_up', 'waiting_on_caller', 'resolved', 'closed', 'spam'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export const OPEN_WORK_STATUSES: readonly WorkStatus[] = ['new', 'in_progress', 'follow_up', 'waiting_on_caller'];
export type WorkSource = 'agent' | 'system' | 'user';

/** Result keys an agent's routing maps to a work status (CallingAgent.inbound.statusByResult). */
export const ROUTING_RESULT_KEYS = ['QUALIFIED', 'PARTIALLY_QUALIFIED', 'CALLBACK_REQUIRED', 'SUPPORT_REQUIRED', 'INFORMATION_ONLY', 'NOT_QUALIFIED', 'UNRESOLVED', 'MISSED', 'HUMAN_HANDLED', 'INTERRUPTED'] as const;
export type RoutingResultKey = (typeof ROUTING_RESULT_KEYS)[number];
/** Server defaults (engine/workStatus.js DEFAULT_STATUS_BY_RESULT + autoWorkStatus fallbacks). */
export const DEFAULT_STATUS_BY_RESULT: Record<RoutingResultKey, WorkStatus> = {
  QUALIFIED: 'new', PARTIALLY_QUALIFIED: 'new', CALLBACK_REQUIRED: 'new', SUPPORT_REQUIRED: 'new', UNRESOLVED: 'new',
  INFORMATION_ONLY: 'resolved', NOT_QUALIFIED: 'closed', MISSED: 'new', HUMAN_HANDLED: 'resolved', INTERRUPTED: 'new',
};

/** Closing ("questions before goodbye") answer types and standard target fields (engine/closingQuestions.js). */
export const CLOSING_QUESTION_TYPES = ['text', 'long_text', 'email', 'phone', 'address', 'number', 'date', 'time', 'choice', 'yes_no'] as const;
export type ClosingQuestionType = (typeof CLOSING_QUESTION_TYPES)[number];
export const CLOSING_STANDARD_KEYS = ['full_name', 'email', 'company', 'job_title', 'website', 'callback_phone', 'alternate_phone', 'address', 'city', 'postal_code', 'country', 'preferred_contact_method', 'callback_time', 'budget', 'timeline'] as const;
export const MAX_CLOSING_QUESTIONS = 20;
export interface ClosingQuestion { key: string; label: string; question: string; type: ClosingQuestionType; required: boolean; options: string[] }
export interface QuestionTemplate { id: string; name: string; description: string; questions: ClosingQuestion[] }

export const CONTROL_KINDS = ['answer', 'reject', 'takeover', 'hangup'] as const;
export type ControlKind = (typeof CONTROL_KINDS)[number];

export const HANDLED_BY = ['ai', 'human', 'none'] as const;
export type HandledBy = (typeof HANDLED_BY)[number];

export const LEAD_CREATION_POLICIES = ['ai_answered', 'all_identified', 'never'] as const;
export type LeadCreationPolicy = (typeof LEAD_CREATION_POLICIES)[number];

export const DEVICE_READINESS_REASONS = [
  'ai_answering_off', 'ai_disabled_for_device', 'no_agent', 'agent_not_active', 'audio_not_verified',
  'gateway_offline', 'board_disconnected', 'phone_not_connected',
] as const;

export const DECISION_REASONS = [
  'blocked_number', 'do_not_contact', 'rule_matched', 'ai_answering_disabled', 'outside_business_hours', 'default_ai',
  'ai_disabled_for_device', 'no_agent_configured', 'agent_unavailable', 'voice_paused', 'device_audio_not_verified', 'ai_session_limit',
  'call_waiting', 'lead_on_outbound_call',
] as const;

export type Pagination = { page: number; limit: number; total: number; pages: number };
export type Paged<T> = { data: T[]; pagination: Pagination };

export interface InboundCallRow {
  id: string;
  callId: string;
  caller: { name: string | null; number: string | null; presentation?: 'available' | 'private' | 'unavailable' };
  callerType?: RowCallerType | null;
  lead: { id: string; name: string | null; number: string | null; created: boolean } | null;
  status: CallStatus;
  aiStatus: AiStatus;
  audioStatus: AudioStatus;
  handling: 'ai' | 'human' | 'ignore' | null;
  answeredBy: 'ai' | 'human' | null;
  outcome: Outcome | null;
  agent: { id: string; name: string | null } | null;
  rule: string | null;
  aiBlockedBy: string | null;
  sim: { slot: number | null; label: string | null };
  device: { id: string; name: string | null } | null;
  durationSeconds: number;
  ringSeconds: number | null;
  primaryInquiry: InquiryCategory | null;
  qualification: QualificationResult | null;
  workStatus?: WorkStatus | null;
  workSource?: WorkSource | null;
  workUpdatedAt?: string | null;
  assignedTo?: string | null;
  callWaiting?: boolean;
  callbackRequested: boolean;
  humanRequested: boolean;
  detectedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

export type TranscriptRole = 'assistant' | 'caller' | 'system';

export interface AudioStats {
  rxLevelDbfs: number | null; txLevelDbfs: number | null; upFrames: number | null; downFrames: number | null;
  upSeqGaps: number | null; downUnderruns: number | null; downOverruns: number | null; firstAiAudioMs: number | null;
  agentConnected: boolean; at: string | null;
}

export interface LiveCall extends InboundCallRow {
  agentActivity: { state: string | null; speaker: 'assistant' | 'caller' | null; at: string | null } | null;
  audio: AudioStats | null;
  pendingCommand: ControlKind | null;
  language: string | null;
  handoff: { status: string; reason: string | null; requestedAt: string | null } | null;
  lastTurns: Array<{ role: TranscriptRole; text: string; at: string | null }>;
  collected: Array<{ key: string; value: string; explicit: boolean }>;
  questionCount: number;
}

export interface TranscriptTurn {
  itemId: string; role: TranscriptRole; text: string; interrupted?: boolean; language?: string | null; at: string | null;
}

export interface CallEvent { type: string; at: string; detail?: string | null }

export type FieldVerification = 'unverified' | 'confirmed' | 'corrected' | 'rejected';

export interface ExtractedField {
  id: string; key: string; label: string; value: string; explicit: boolean; confidence: number | null;
  verification: FieldVerification; evidence: string | null; superseded: boolean; appliedToLead: boolean;
  source: 'ai_agent' | 'user_correction'; at: string | null;
}

export type AnswerStatus = 'answered' | 'partially_answered' | 'unanswered' | 'deferred';

export interface Recommendation {
  id: string; action: RecommendationAction; reason: string; status: 'pending' | 'executed' | 'dismissed';
  followUpId: string | null; decidedBy: string | null; decidedAt: string | null; automatic: boolean;
}

export interface InboundCallDetail extends InboundCallRow {
  createdBy: string;
  leadDetail: { id: string; name: string | null; number: string | null; status: string | null; email: string | null; phone: string | null; source: string | null; city: string | null } | null;
  match: { status: 'new' | 'existing' | 'ambiguous' | 'unknown' | undefined; candidates: Array<{ id: string; name: string | null; number: string | null }> };
  handlingDetail: {
    mode: string | null; agentId: string | null; agentName: string | null; ruleId: string | null; ruleName: string | null; reason: string | null;
    aiBlockedBy: string | null; callerType: string | null; inBusinessHours: boolean | null; answerAfterMs: number | null; decidedAt: string | null;
  } | null;
  language: { initial: string | null; current: string | null; switches: Array<{ from: string; to: string; at: string; explicit?: boolean; evidence?: string }> } | null;
  transcript: TranscriptTurn[];
  events: CallEvent[];
  fields: ExtractedField[];
  qa: {
    aiQuestions: Array<{ question: string; answer: string; key: string; explicit: boolean; at: string | null }>;
    callerQuestions: Array<{ id: string; text: string; category: InquiryCategory; categorySource: 'ai' | 'rules'; answerStatus: AnswerStatus; answerSummary: string | null; at: string | null }>;
    unanswered: string[];
    missingInformation: string[];
    closingQuestions?: Array<{ key: string; label: string; question: string; type: string; required: boolean; status: 'answered' | 'declined' | 'not_asked'; value: string | null; explicit: boolean | null }>;
  };
  work?: {
    status: WorkStatus | null; reason: string | null; source: WorkSource | null; updatedAt: string | null;
    updatedBy: { id: string; name: string | null } | null; assignee: { id: string; name: string | null } | null;
    history: Array<{ from: WorkStatus | null; to: WorkStatus | null; source: WorkSource | null; reason: string | null; note: string | null; at: string;
      by: { id: string; name: string | null } | null; assignedTo: { id: string; name: string | null } | null; assignedFrom: { id: string; name: string | null } | null }>;
  } | null;
  intentsDetail: { primary: InquiryCategory | null; secondary: string[]; source: 'ai' | 'rules' | null } | null;
  summary: {
    reason: string | null; text: string | null; requirements: string[]; concerns: string[]; objections: string[]; unresolvedQuestions: string[];
    tone: string | null; toneEvidence: string | null; notInterested: boolean; generatedBy: 'ai_agent' | 'system' | null; at: string | null;
  } | null;
  qualificationDetail: { result: QualificationResult | null; reasons: string[]; met: string[]; missing: string[]; score: number | null; evaluatedAt: string | null } | null;
  recommendations: Recommendation[];
  followUpIds: string[];
  callback: { requested: boolean; whenText: string | null; note: string | null; at: string | null } | null;
  handoff: { requested: boolean; reason: string | null; summary: string | null; requestedAt: string | null; status: string; takenOverAt: string | null } | null;
  doNotContact: boolean;
  notes: Array<{ id: string; text: string; by: string | null; byName?: string | null; at: string }>;
  audio: AudioStats | null;
  codec: string | null;
  /** Priced like an analytics row (GET /inbound-calls/:id); estimate, not a provider invoice. */
  cost?: AnalyzedCallCost | null;
  aiVoice?: { provider?: string; model?: string; fallback?: boolean } | null;
  pendingCommand: ControlKind | null;
  error: { code: string; message: string | null; at: string | null } | null;
  processedAt: string | null;
  endReason: string | null;
  transcriptStats: { turns: number; callerTurns: number };
}

export interface InboundStats {
  total: number; answeredByAi: number; answeredByHuman: number; missed: number; rejected: number; completed: number; failed: number;
  active: number; newLeads: number; existingLeads: number; qualified: number; callbacks: number; escalations: number;
  averageDurationSeconds: number | null;
  aiSuccessRate: number | null; aiFailureRate: number | null; answerRate: number | null; aiAnswerRate: number | null;
  missedRate: number | null; qualificationRate: number | null; callbackRate: number | null; escalationRate: number | null;
}

export type CountRow = { key: string | number; label?: string | null; count: number; answered?: number };

export interface InboundAnalytics {
  summary: InboundStats;
  series: Array<{ date: string; total: number; ai: number; human: number; missed: number; qualified: number; newLeads: number }>;
  byInquiry: CountRow[]; byOutcome: CountRow[]; byQualification: CountRow[];
  byDevice: CountRow[]; bySim: CountRow[]; byAgent: CountRow[]; byLanguage: CountRow[]; byHour: CountRow[]; topServices: CountRow[];
}

/** A SIM card the phone's Updata app reported (slot is 0-based). */
export interface DeviceSim { slot: number; label: string; carrier: string }

export interface InboundDevice {
  id: string; name: string; phoneLabel: string | null; online: boolean; lastHeartbeatAt: string | null;
  bluetooth: string; boardConnected: boolean; signal: number | null; battery: number | null; inCall: boolean; audioVerified: boolean;
  firmware: string | null; gatewayVersion: string | null;
  agent: { id: string; name: string; availability: string } | null;
  simAgents: Array<{ simSlot: number | null; agentId: string | null; aiEnabled: boolean }>;
  aiAnswering: { ready: boolean; reasons: string[] };
  last24h: { calls: number; answeredByAi: number };
  /** Empty = unknown (the Updata app on the phone has not reported its SIM cards yet). */
  sims: DeviceSim[];
  simsReportedAt: string | null;
}

export interface InboundRuleConditions {
  callerType: RuleCallerType;
  numbers: string[];
  numberPrefixes: string[];
  deviceIds: string[];
  simSlots: number[];
  withinBusinessHours: boolean | null;
  leadStatuses: string[];
}

export interface InboundRule {
  id: string; name: string; enabled: boolean; priority: number;
  conditions: InboundRuleConditions; action: RuleAction; agentId: string | null; createdAt?: string;
}

export interface DeviceAgentRow { deviceId: string; simSlot: number | null; agentId: string | null; aiEnabled: boolean }

export interface BusinessHours { enabled: boolean; timezone: string; days: number[]; start: string; end: string }

export interface InboundAutomation {
  createFollowUps: boolean; followUpFor: QualificationResult[]; returnMissedCalls: boolean;
  notifyMissed: boolean; notifyHandoff: boolean; notifyQualified: boolean; autoSendSms: boolean; autoSendEmail: boolean;
}

export interface InboundSettings {
  _id?: string;
  enabled: boolean;
  organizationName: string;
  defaultRegion: string;
  defaultAgentId: string | null;
  deviceAgents: DeviceAgentRow[];
  answerDelaySeconds: number;
  ringTimeoutSeconds: number;
  maxConcurrentAiSessions: number;
  fallbackAction: 'human' | 'ignore';
  businessHours: BusinessHours;
  outsideHoursAction: RuleAction;
  blockedNumbers: string[];
  blockedAction: 'human' | 'ignore';
  rules: InboundRule[];
  leadCreation: LeadCreationPolicy;
  qualification: { required: string[]; anyOf: string[]; promoteLeadStatus: boolean };
  automation: InboundAutomation;
  handoffWaitSeconds: number;
  aiDisclosure: boolean;
  transcriptRetentionDays: number;
  version: number;
  updatedAt?: string;
}

export interface RuleTestResult {
  caller: { e164: string | null; presentation: string };
  match: { status: string; leadIds: string[] };
  decision: {
    action: RuleAction; agentId: string | null; ruleId: string | null; ruleName: string | null; reason: string;
    aiBlockedBy?: string | null; callerType: string; inBusinessHours: boolean; answerAfterMs: number;
  };
}

export interface InboundFilters {
  search?: string;
  from?: string;
  to?: string;
  handledBy?: HandledBy | '';
  callerType?: ListCallerType | '';
  /** '' = all SIMs; otherwise the 0-based slot as text. */
  simSlot?: string;
  outcome?: Outcome | '';
  qualification?: QualificationResult | '';
  inquiry?: InquiryCategory | '';
  agentId?: string;
  deviceId?: string;
  status?: string;
  leadCreated?: boolean;
  /** 'open' or a CSV of work statuses. */
  workStatus?: string;
  /** 'me' | 'none' | a user id. */
  assignedTo?: string;
}

export type InboundSort = 'newest' | 'oldest' | 'longest';
