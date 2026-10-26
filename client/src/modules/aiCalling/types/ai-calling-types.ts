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
  qualified: number; unqualified: number; callbacks: number; needsReview: number; needsReconcile?: number;
  doNotContact: number; suppressed: number; missingPhone: number; consentRequired?: number;
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
  channel?: CampaignChannel;
  linkConfig?: LinkConfig;
  /** Voice: cloud SIP trunk, or the owner's own phone through the ESP32 gateway. */
  transport?: CallTransport;
  pairedDeviceId?: string | null;
  /** Saved lead selection. Editing keeps this immutable so recipients cannot be silently replaced. */
  selection?: CreateCampaignInput['selection'] & { selectedAt?: string };
  /** Paired phone: why the campaign is waiting for its device (readiness reason codes). */
  deviceWait?: { reasons: string[]; at: string | null };
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
  channel?: CampaignChannel;
  linkConfig?: LinkConfig;
  transport?: CallTransport;
  pairedDeviceId?: string | null;
  isTest?: boolean;
  scheduledAt?: string | null;
}

export type CallTransport = 'cloud_sip' | 'paired_phone';

/** 'voice' = AI phone calls (cloud); 'web_link' = SMS link → AI chat page. */
export type CampaignChannel = 'voice' | 'web_link';
export type LinkLanguage = 'en' | 'ur' | 'roman_ur';

export interface LinkConfig {
  expiryDays: number;
  languages: LinkLanguage[];
  defaultLanguage: LinkLanguage;
  personaName: string;
  personaTone: 'warm' | 'professional' | 'concise';
  reason: string;
  estimatedMinutes: number;
  faq: { question: string; answer: string }[];
  smsTemplates?: Record<string, string> | null;
  voiceTier: 'off' | 'browser' | 'premium';
  reminders: { enabled: boolean; afterHours: number; max: number };
  fallbackToCall: { enabled: boolean; simCallCampaignId: string | null; afterHours: number };
  limits: { maxTurns: number; maxTokensPerTurn: number; maxSessionMinutes: number; dailySpendCap: number; maxVoiceMinutes?: number };
  transcriptRetentionDays: number;
  whatsappShare?: boolean;
}

export type LinkSessionStatus = 'issued' | 'opened' | 'active' | 'completed' | 'abandoned' | 'opted_out' | 'expired' | 'revoked';

export interface LinkSession {
  id: string;
  campaignId: string;
  leadId: string;
  leadName: string | null;
  callId: string;
  callRecordId: string;
  status: LinkSessionStatus;
  outcome: string | null;
  language: string;
  turns: number;
  /** Real-time voice calls on this conversation (SMS link voice screen). */
  voice?: { calls: number; seconds: number; cost: number; live: boolean };
  funnel: Record<string, string | null>;
  isTest: boolean;
  reminders: { sent: number; lastSentAt: string | null };
  usage: { cost: number; modelCalls: number };
  expiresAt: string;
  lastActivityAt: string;
  createdAt: string;
  closedAt: string | null;
}

export interface LinkSessionDetail extends LinkSession {
  campaignName: string | null;
  transcript: { role: 'assistant' | 'customer' | 'system'; text: string; at: string; source: string | null }[];
  answers: { fieldKey: string; label: string; value: unknown; validation: string | null; confirmed: boolean; unknown: boolean }[];
  disposition: string | null;
  qualification: string | null;
  reviewRequired: boolean;
  openQuestions: { text: string; at: string }[];
}

export interface LinkAnalytics {
  campaignId: string;
  sessions: number;
  funnel: Record<string, number>;
  rates: { openRate: number; startRate: number; completionRate: number; optOutRate: number };
  perQuestion: { fieldKey: string; label: string; answered: number; unknown: number; dropOff: number; unknownRate: number }[];
  averageCompletionSeconds: number | null;
  cost: { total: number; perCompleted: number | null };
}

export interface LinkSettings {
  paused: boolean;
  pausedByEnv: boolean;
  pausedReason: string;
  changedAt: string | null;
  aiConfigured: boolean;
  model: string;
  baseUrl: string;
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
  initiatedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  campaignId?: { _id: string; name: string } | string;
  leadId?: { _id: string; leadNumber?: string; name?: string } | string;
  provider?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  /** Set on a call whose outcome is unknown (state needs_reconcile) until the owner resolves it. */
  reconciliation?: { needed: boolean; note: string | null; resolvedAt: string | null; resolution: ReconcileResolution | null };
}

export interface CallListFilters {
  page?: number;
  limit?: number;
  campaignId?: string;
  state?: string;
  disposition?: string;
  reviewRequired?: boolean;
  search?: string;
  includeTests?: boolean;
}

/** How the owner resolves a call with an unknown outcome (POST /ai-calling/calls/:id/reconcile). */
export type ReconcileResolution = 'reached' | 'not_reached' | 'retry';

/** One entry of GET /ai-calling/languages (server aiCalling.languages.js). */
export interface AgentLanguage {
  code: string; name: string; nativeName: string; support: 'full' | 'limited'; rtl: boolean;
}

export interface AgentLanguageList { languages: AgentLanguage[]; defaultLanguage: string }

export interface TelephonyHealth {
  configured: boolean; livekitReady?: boolean; reachable: boolean; eligible: boolean; reason: string | null;
  primary?: Omit<TelephonyHealth, 'primary' | 'fallback' | 'operations'>;
  fallback?: Omit<TelephonyHealth, 'primary' | 'fallback' | 'operations'> & { enabled?: boolean; allowedCountries?: string[] };
  operations?: {
    status: 'ok' | 'attention';
    runningCampaigns: number; stuckRinging: number; needsReconcile: number; expiredProcessingClaims: number;
    overdueTicks: number; callsLastHour: number; failedLastHour: number; warnings: string[];
  };
}

export interface LeadTransition {
  _id: string;
  previousStatus: string | null; newStatus: string | null; qualification: string | null;
  ruleId: string | null; reason: string | null; actorType: 'system' | 'user' | 'provider_webhook';
  callId: string | null; campaignId: string | null; createdAt: string;
}

export interface CallConsentProfile {
  consent: null | {
    _id: string; status: 'granted' | 'denied' | 'revoked'; evidence: string; source: string;
    capturedAt: string; expiresAt?: string | null; revokedAt?: string | null;
  };
  status?: 'granted' | 'expired' | 'missing' | 'revoked';
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
  transport?: CallTransport;
  /** Paired-phone calls only: live state reported by the laptop gateway. */
  gateway?: null | {
    state: 'queued' | 'claimed' | 'dialing' | 'ended' | 'cancelled' | null;
    audioOpen: boolean;
    audioLost: boolean;
    takenOver: boolean;
    command: 'takeover' | 'hangup' | null;
    audioAgeSeconds: number | null;
    audio: null | {
      rxLevelDbfs: number | null; txLevelDbfs: number | null; upFrames: number | null; downFrames: number | null;
      upSeqGaps: number | null; downUnderruns: number | null; downOverruns: number | null; firstAiAudioMs: number | null; agentConnected: boolean;
    };
  };
}

export interface VoiceSettings { voicePaused: boolean; pausedByEnv: boolean; pausedReason: string; pausedAt: string | null }

export interface DeviceLimits { cooldownSeconds: number; maxCallsPerHour: number; maxCallsPerDay: number; ringTimeoutSeconds: number }

/** A paired phone: the owner's Android phone + SIM behind an ESP32 Bluetooth hands-free bridge. */
export interface PairedDevice {
  id: string;
  name: string;
  phoneLabel: string;
  kind: 'esp32_hfp';
  revoked: boolean;
  revokedAt: string | null;
  online: boolean;
  lastHeartbeatAt: string | null;
  gateway: { version: string | null; platform: string | null; hostname: string | null };
  board: { connected: boolean; port: string | null; bdaddr: string | null; firmware: string | null; idf: string | null; chipRevision: number | null; keyProvisioned: boolean };
  state: { device: string; hfp: string; call: number; callsetup: number; audio: string; codec: string; signal: number | null; battery: number | null; peer: string | null };
  stats: Record<string, number> | null;
  lastError: { code: string; message: string; at: string } | null;
  keyState: 'pending' | 'delivered' | 'provisioned';
  audioVerified: boolean;
  audioVerifiedAt: string | null;
  audioVerification?: { note: string; inboundPhraseHeard: boolean; outboundPhraseHeard: boolean; firmware: string | null };
  limits: DeviceLimits;
  currentCallId: string | null;
  currentCallSince: string | null;
  lastCallEndedAt: string | null;
  attention: { needed: boolean; reason: string; at: string } | null;
  readiness: { ok: boolean; reasons: string[]; messages: string[]; blocking: boolean };
  usage: { callsLastHour: number; callsToday: number } | null;
  createdAt: string;
}

export interface Analytics {
  campaigns: number; totalCalls: number; answered: number; answerRate: number | null;
  qualified: number; qualificationRate: number | null; callbacks: number;
  avgCallSeconds: number; totalCost: number; reviews: number;
  byDisposition: Array<{ _id: string | null; count: number }>;
  byQualification: Array<{ _id: string | null; count: number }>;
  byDay: Array<{ date: string; calls: number; answered: number; qualified: number }>;
}
