// Types for the AI Voice Calling module. Mirror the server models in
// server/src/modules/aiCalling.

export type QuestionType =
  | 'short_text' | 'long_text' | 'boolean' | 'single_choice' | 'multiple_choice'
  | 'integer' | 'decimal' | 'currency' | 'date' | 'time' | 'email' | 'phone'
  | 'url' | 'address' | 'rating' | 'enum';

export type RuleAction =
  | 'mark_contacted' | 'mark_qualified' | 'mark_unqualified' | 'mark_not_interested'
  | 'schedule_callback' | 'request_review' | 'mark_do_not_contact' | 'none';

export type CampaignStatus =
  | 'draft' | 'scheduled' | 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface QuestionOption { value: string; label?: string }

export interface Question {
  fieldKey: string;
  label: string;
  text: string;
  description?: string;
  type: QuestionType;
  required?: boolean;
  order?: number;
  options?: Array<string | QuestionOption>;
  min?: number | null;
  max?: number | null;
  maxClarifications?: number;
  confirmCritical?: boolean;
  condition?: { all?: Clause[]; any?: Clause[] } | null;
  mapTo?: string | null;
  sensitive?: boolean;
}

export interface Clause {
  field: string;
  equals?: unknown; notEquals?: unknown; in?: unknown[]; contains?: unknown;
  exists?: boolean; gt?: number; gte?: number; lt?: number; lte?: number;
}

export interface StatusRule {
  id: string;
  description?: string;
  when: { all?: Clause[]; any?: Clause[] };
  action: RuleAction;
  requiresReview?: boolean;
}

export interface AgentConfig {
  agentName: string;
  organizationName?: string;
  disclosure?: string;
  language?: string;
  voice?: string;
  speakingStyle?: 'professional' | 'friendly' | 'concise' | 'formal' | 'custom';
  objective?: string;
  maxCallSeconds?: number;
  silenceTimeoutSeconds?: number;
  maxClarificationsPerQuestion?: number;
  allowBargeIn?: boolean;
  recordCall?: boolean;
  shareLeadNotes?: boolean;
}

export interface Schedule {
  timezone?: string;
  callWindow?: { start: string; end: string };
  daysOfWeek?: number[];
  maxAttemptsPerLead?: number;
  minMinutesBetweenAttempts?: number;
  retryDelayMinutes?: number;
  maxConcurrency?: number;
  maxCallsPerDay?: number;
  maxCampaignSpend?: number;
}

export interface CampaignSummary {
  total: number; eligible: number; ineligible: number; queued: number; inProgress: number;
  completed: number; answered: number; noAnswer: number; failed: number; retryScheduled: number;
  qualified: number; unqualified: number; callbacks: number; needsReview: number;
  doNotContact: number; suppressed: number; missingPhone: number;
  totalCallSeconds: number; actualCost: number;
}

export interface Campaign {
  _id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  questionnaireVersion: number;
  questionnaire: { questions: Question[] };
  statusRules: StatusRule[];
  agentConfig: AgentConfig;
  schedule: Schedule;
  summary: CampaignSummary;
  isTest?: boolean;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  questionnaire: { questions: Question[] };
  statusRules?: StatusRule[];
  agentConfig?: Partial<AgentConfig>;
  schedule?: Partial<Schedule>;
  selection:
    | { mode: 'explicit'; leadIds: string[] }
    | { mode: 'filters'; filters: Record<string, unknown> };
  isTest?: boolean;
  scheduledAt?: string | null;
}

export interface SimAnswerEntry {
  validation: 'valid' | 'invalid' | 'unknown' | 'unconfirmed';
  normalizedValue: unknown;
  rawAnswer?: string;
  clarifications?: number;
  confirmed?: boolean;
}

export interface SimState {
  disclosed: boolean;
  endedReason: string | null;
  answers: Record<string, SimAnswerEntry>;
  control?: Record<string, unknown>;
}

export interface SimAction {
  type: 'disclose' | 'ask' | 'clarify' | 'confirm' | 'finish' | 'end';
  reason?: string | null;
  question?: { fieldKey: string; text: string; label: string; type: QuestionType; options: unknown[]; required: boolean; description: string };
}

export interface SimResult {
  state: SimState;
  nextAction: SimAction;
  progress: { total: number; answered: number; valid: number; unresolvedRequired: string[] };
  outcomePreview: null | { qualification: string; action: RuleAction; ruleId: string | null; reason: string; requiresReview: boolean };
}

export interface CallAnswer {
  questionFieldKey: string; label: string; type: string; rawAnswer: string;
  normalizedValue: unknown; validation: string; confirmed: boolean; reviewStatus: string;
}

export interface CallRecord {
  _id: string;
  internalCallId: string;
  attemptNumber: number;
  state: string;
  disposition: string | null;
  qualification: string | null;
  durationSeconds: number;
  answers: CallAnswer[];
  reviewRequired: boolean;
  cost?: { amount: number; currency: string };
  createdAt?: string;
  campaignId?: { _id: string; name: string } | string;
}

/** One entry of GET /ai-calling/languages (server aiCalling.languages.js). */
export interface AgentLanguage {
  code: string; name: string; nativeName: string; support: 'full' | 'limited'; rtl: boolean;
}

export interface AgentLanguageList { languages: AgentLanguage[]; defaultLanguage: string }

export interface TelephonyHealth {
  configured: boolean; livekitReady?: boolean; reachable: boolean; eligible: boolean; reason: string | null;
  primary?: Omit<TelephonyHealth, 'primary' | 'fallback'>;
  fallback?: Omit<TelephonyHealth, 'primary' | 'fallback'> & { enabled?: boolean; allowedCountries?: string[] };
}

export interface CallConsentProfile {
  consent: null | {
    _id: string; status: 'granted' | 'denied' | 'revoked'; evidence: string; source: string;
    capturedAt: string; expiresAt?: string | null; revokedAt?: string | null;
  };
  destinationAvailable: boolean;
}

export interface ActiveCall {
  callId: string;
  recordId: string;
  leadName: string;
  leadNumber: string;
  state: string;
  phase: string;
  currentQuestion: string | null;
  answered: number;
  total: number;
  elapsedSeconds: number;
  isTest: boolean;
}

export interface Analytics {
  campaigns: number; totalCalls: number; answered: number; answerRate: number | null;
  qualified: number; qualificationRate: number | null; callbacks: number;
  avgCallSeconds: number; totalCost: number; reviews: number;
  byDisposition: Array<{ _id: string | null; count: number }>;
  byQualification: Array<{ _id: string | null; count: number }>;
  byDay: Array<{ date: string; calls: number; answered: number; qualified: number }>;
}
