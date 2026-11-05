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
  maxLength?: number | null;
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
  /** Free-text conversation instructions (agent type template or admin-written). */
  instructions?: string;
  organizationName?: string;
  disclosure?: string;
  language?: string;
  supportedLanguages?: string[];
  automaticLanguageDetection?: boolean;
  automaticLanguageSwitching?: boolean;
  followLeadLanguage?: boolean;
  languageSwitchSensitivity?: 'low' | 'medium' | 'high';
  repetitionDelaySeconds?: number;
  maxRepetitionAttempts?: number;
  repetitionStrategy?: 'exact' | 'natural' | 'simplified' | 'contextual' | 'progressive';
  maxUnansweredQuestions?: number;
  automaticCallTermination?: boolean;
  automaticNextLead?: boolean;
  trackResponseBehavior?: boolean;
  trackEngagement?: boolean;
  classifyEngagement?: boolean;
  saveBehaviorHistory?: boolean;
  conversationAnalytics?: boolean;
  voice?: string;
  speakingStyle?: 'professional' | 'friendly' | 'concise' | 'formal' | 'custom';
  customStyle?: string;
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
  runMode?: 'immediate' | 'scheduled';
  agentId?: string | null;
  agentSnapshot?: { name: string; title: string; description: string; avatarFileId: string | null; version: number };
  executionEndsAt?: string | null;
  continueAcrossDays?: boolean;
  waitReason?: string | null;
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

export interface CampaignRunStatus {
  runMode?: 'immediate' | 'scheduled';
  displayStatus?: string;
  status: CampaignStatus; pending: number; inProgress: number; canStart: boolean;
  blockers: Array<{ code: string; message: string }>;
  waits: Array<{ code: string; message: string; reasons?: string[] }>;
  nextAt: string | null; checkedAt: string; sequential: boolean;
  schedule: Pick<Schedule, 'timezone' | 'callWindow' | 'daysOfWeek'>;
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
  classification?: string | null;
  questionFieldKey: string; label: string; type: string; rawAnswer: string;
  normalizedValue: unknown; validation: string; confirmed: boolean; reviewStatus: string;
}

export interface CallTranscriptTurn {
  itemId: string;
  role: 'assistant' | 'customer';
  text: string;
  at: string;
  interrupted?: boolean;
}

export interface CallAgentActivity {
  agentState: 'initializing' | 'idle' | 'listening' | 'thinking' | 'speaking' | null;
  speaker: 'assistant' | 'customer' | null;
  at: string | null;
}

export interface QuestionCoverage {
  total: number; applicable: number; answered: number; unknown: number; needsClarification: number;
  needsConfirmation: number; unanswered: number; notApplicable: number; requiredGaps: string[];
  questions: Array<{
    fieldKey: string; label: string; question: string; required: boolean; eligible: boolean;
    status: 'answered' | 'unknown' | 'needs_clarification' | 'needs_confirmation' | 'not_applicable' | 'not_answered' | 'pending';
    rawAnswer: string; normalizedValue: unknown; validation: string | null; confirmed: boolean; source: string | null; noResponseCount?: number; reason?: string | null;
  }>;
}

export interface ConversationInsights {
  version: number; basis: 'recorded_evidence';
  intent: 'not_established' | 'do_not_contact' | 'human_requested' | 'callback_requested' | 'declined';
  observations: Array<{ code: string; label: string; evidence: string }>;
  nextSteps: string[];
  participation: { agentTurns: number; leadTurns: number; interruptedAgentTurns: number };
  limitation: string;
}

export interface CallBehaviorEvent {
  id: string; at: string; type: string; fieldKey?: string; classification?: string;
  language?: string; explicit?: boolean; evidence?: string; responseMs?: number; reason?: string;
}
export interface CallRecord {
  conversationLanguage?: { initial: string; current: string; detected?: string | null; switches: Array<{ at: string; from: string; to: string; mode: string }> };
  behaviorAnalytics?: { totalQuestions: number; questionsAsked: number | null; answered: number; unanswered: number; repeats: number | null; silenceEvents: number | null; clarificationRequests: number | null; incompleteAnswers: number | null; interruptions: number | null; averageResponseMs: number | null; longestResponseMs: number | null; completionPercentage: number; engagement: string | null; languageSwitches: number };
  conversationState?: { events?: CallBehaviorEvent[] };
  terminationReason?: string | null;
  aiVoice?: VoiceProviderSession | null;
  gateway?: { takenOverAt?: string | null; audioLostAt?: string | null; endReason?: string | null };
  _id: string;
  internalCallId: string;
  attemptNumber: number;
  state: string;
  disposition: string | null;
  qualification: string | null;
  durationSeconds: number;
  answers: CallAnswer[];
  questionCoverage?: QuestionCoverage;
  conversationInsights?: ConversationInsights;
  transcript?: CallTranscriptTurn[];
  transcriptVersion?: number;
  transcriptUpdatedAt?: string | null;
  transcriptExpiresAt?: string | null;
  agentActivity?: CallAgentActivity | null;
  callContext?: {
    agentName: string; objective: string; phase: string; currentQuestion: string | null;
    answered: number; total: number;
    questions: Array<{ fieldKey: string; label: string; text: string; required?: boolean }>;
  };
  callNotes?: {
    description: string;
    summary: string;
    blockers: string[];
    source: 'ai_agent' | 'call_results';
    generatedAt: string;
  };
  reviewRequired: boolean;
  cost?: { amount: number; currency: string };
  createdAt?: string;
  initiatedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  campaignId?: { _id: string; name: string } | string;
  leadId?: { _id: string; leadNumber?: string; name?: string; phone?: string | null; mobile?: string | null; email?: string | null; status?: string } | string;
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
/** Pre-save check of whether chosen leads can actually be reached (see previewEligibility). */
export type EligibilityPreview = {
  total: number;
  found: number;
  unavailable: number;
  eligible: number;
  reasonCounts: Record<string, number>;
  leads: Array<{ leadId: string; name: string; status?: string; phone: string | null; eligible: boolean; reasons: string[] }>;
};

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
  agentName?: string;
  agentActivity?: CallAgentActivity | null;
  transcriptPreview?: CallTranscriptTurn[];
  transcriptVersion?: number;
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
  archived?: boolean;
  archivedAt?: string | null;
  online: boolean;
  lastHeartbeatAt: string | null;
  gateway: { version: string | null; platform: string | null; hostname: string | null; playbackGainDb?: number | null; autoConnect?: boolean | null };
  board: { connected: boolean; port: string | null; bdaddr: string | null; firmware: string | null; idf: string | null; chipRevision: number | null; keyProvisioned: boolean };
  state: { device: string; hfp: string; call: number; callsetup: number; audio: string; codec: string; signal: number | null; battery: number | null; peer: string | null };
  stats: Record<string, number> | null;
  lastError: { code: string; message: string; at: string } | null;
  keyState: 'pending' | 'delivered' | 'provisioned';
  setup?: { autoConnect: boolean; playbackGainDb: number; command: { id: string; action: SetupAction; state: 'pending' | 'running' | 'succeeded' | 'failed' | 'expired'; expiresAt: string; message: string } | null };
  audioTest?: { callId: string | null; firmware: string | null; playbackGainDb: number | null; createdAt: string | null };
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

export type SetupAction = 'status' | 'pair_phone' | 'connect_phone' | 'disconnect_phone' | 'provision_key' | 'reconnect_usb';
export interface BridgeAudioTest {
  id: string; state: string; answeredAt: string | null; endedAt: string | null; durationSeconds: number;
  answers: Array<{ field: string; value: unknown; validation: string }>;
  audio: { upFrames?: number; downFrames?: number; rxLevelDbfs?: number; txLevelDbfs?: number } | null;
  failureMessage: string | null;
}

export interface Analytics {
  campaigns: number; totalCalls: number; answered: number; answerRate: number | null;
  qualified: number; qualificationRate: number | null; callbacks: number;
  avgCallSeconds: number; totalCost: number; reviews: number;
  byDisposition: Array<{ _id: string | null; count: number }>;
  byQualification: Array<{ _id: string | null; count: number }>;
  byDay: Array<{ date: string; calls: number; answered: number; qualified: number }>;
}

/** outbound = campaigns only (default for legacy agents), inbound = answers incoming calls only, both = either. */
export type AgentUsage = 'outbound' | 'inbound' | 'both';
/** Business role template (server engine/agentTypes.js). Several agents may share a type. */
export const AGENT_TYPES = ['sales', 'follow_up', 'customer_support', 'receptionist', 'lead_qualification', 'appointment', 'retention', 'collection', 'feedback', 'renewal', 'onboarding', 'custom'] as const;
export type AgentType = (typeof AGENT_TYPES)[number];
export const FOLLOW_UP_TRIGGERS = ['CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'INFORMATION_REQUESTED', 'TEMPORARILY_UNAVAILABLE', 'QUALIFICATION_INCOMPLETE', 'APPOINTMENT_PENDING'] as const;
export type FollowUpTrigger = (typeof FOLLOW_UP_TRIGGERS)[number];
/** Follow-up calling automation for one agent (server callingAgent.model.js followUpSchema). */
export interface AgentFollowUpConfig {
  enabled?: boolean; autoCall?: boolean; manualCall?: boolean;
  triggers?: FollowUpTrigger[];
  objective?: string; instructions?: string;
  questions?: Question[];
  schedule?: Schedule;
  maxRounds?: number; minHoursBetweenRounds?: number; defaultCallbackDelayMinutes?: number;
  unavailableRetryHours?: number; incompleteRetryHours?: number; informationRetryHours?: number; needsTimeRetryDays?: number;
  eligibleLeadStatuses?: string[]; stopLeadStatuses?: string[];
  /** outcome code (or QUALIFIED) → agent id that takes the next conversation. */
  routes?: Record<string, string | null>;
  /** Ordered rules on lead/call facts; the first match beats `routes` (server engine/followUpRouting.js). */
  routingRules?: FollowUpRoutingRule[];
  /** Who is told / takes over when a follow-up needs a person (empty = organisation default, then owner). */
  escalation?: { userIds?: string[]; assignTo?: 'owner' | 'first_recipient'; email?: boolean };
  escalateToUserId?: string | null;
}
export const ROUTING_LEAD_SOURCES = ['extension', 'google_places', 'manual', 'widget', 'import', 'incoming_call'] as const;
export interface FollowUpRoutingRule {
  id?: string; name?: string; enabled?: boolean; agentId: string;
  when: { outcomes?: string[]; leadSources?: string[]; leadStatuses?: string[]; leadTypes?: string[]; languages?: string[]; countries?: string[]; cities?: string[]; businessTypes?: string[] };
}
export interface AgentTemplate { type: AgentType; objective: string; instructions: string; followUpInstructions: string; triggers: FollowUpTrigger[]; speakingStyle?: string; usage?: AgentUsage }
export type FollowUpAutomationState = 'scheduled' | 'queued' | 'calling' | 'retry_scheduled' | 'paused' | 'completed' | 'no_answer' | 'busy' | 'failed' | 'cancelled' | 'skipped' | 'requires_human';
export interface FollowUpAutomationView {
  mode: 'ai' | 'human'; agentId: string | null; state: FollowUpAutomationState | null; reason: string | null; outcome: string | null;
  round: number; attempts: number; campaignId: string | null; callRecordId: string | null; previousCallId: string | null;
  notBefore: string | null; lastError: string | null; instructions: string | null;
  timeResolution: { kind: string; approximate: boolean; requestedText: string | null; shiftedFrom: string | null } | null;
  stateChangedAt: string | null; history: Array<{ state: string; at: string; reason: string | null }>;
  call: { state: string; disposition: string | null; qualification: string | null; durationSeconds: number; answeredAt: string | null; endedAt: string | null; summary: string | null } | null;
}
export interface AgentFollowUpItem {
  id: string; leadId: string; status: string; dueAt: string; nextDueAt: string; timezone: string | null; note: string | null;
  lead: { id: string; name: string; leadNumber: string | null; status: string; phone: string | null } | null;
  automation: FollowUpAutomationView | null;
}
export interface FollowUpSettings { enabled: boolean; forcedOffByEnv: boolean; pausedReason: string; changedAt: string | null; changedBy: string | null; voicePaused: boolean; escalationUserIds?: string[] }
export interface FollowUpSummary {
  total: number; byState: Record<string, number>; byOutcome: Record<string, number>;
  scheduled: number; inProgress: number; completed: number; failed: number; noAnswer: number; requiresHuman: number; paused: number; cancelled: number; callbacks: number;
  attempts: number; connected: number; answerRate: number; qualified: number; qualificationRate: number; avgDurationSeconds: number; avgAttemptsPerLead: number;
  leadsReached: number; totalCost: number; costPerCall: number; costPerQualified: number;
  humanManaged?: number;
  automation: FollowUpSettings;
}
export interface CallingAgentInput {
  name: string; title?: string; description?: string;
  usage?: AgentUsage;
  agentType?: AgentType;
  followUp?: AgentFollowUpConfig;
  availability?: 'draft' | 'active' | 'paused' | 'archived';
  avatarFileId?: string | null;
  avatarPresetId?: string | null;
  assignedLeadIds?: string[];
  agentConfig?: Partial<AgentConfig>;
  questionnaire?: { questions: Question[] };
  statusRules?: StatusRule[]; schedule?: Schedule;
  transport?: CallTransport; pairedDeviceId?: string | null;
  /** Incoming calls (inboundCalling): how this agent behaves as the receptionist. */
  inbound?: {
    greeting?: string; instructions?: string; escalationInstructions?: string;
    /** Routing after the call: who gets the call, whether that beats the lead owner, and the work status per result. */
    assignToUserId?: string | null; assignOverridesLeadOwner?: boolean; statusByResult?: Record<string, string>;
    /** "Questions before goodbye" (inboundCalling/engine/closingQuestions.js). */
    closingQuestions?: Array<{ key: string; label: string; question: string; type: string; required: boolean; options: string[] }>;
  };
}
export interface CallingAgent extends CallingAgentInput {
  _id: string; availability: NonNullable<CallingAgentInput['availability']>; version: number;
  agentConfig: AgentConfig; questionnaire: { questions: Question[] }; statusRules: StatusRule[]; schedule: Schedule;
  assignedLeadIds: string[]; avatarUrl: string | null;
  readiness: { ready: boolean; missing: string[] }; eligibility: EligibilityPreview;
  metrics: { campaigns: number; activeCampaigns: number; completed: number; answered: number; inProgress: number; failed: number; qualified: number; noAnswer: number; totalCallSeconds: number };
  latestCampaign: Campaign | null; lastActiveAt: string | null; createdAt: string; updatedAt: string;
}
export interface AgentImage { _id: string; name: string; url: string; size: number; createdAt: string; presetId?: string; thumbnailUrl?: string; category?: 'people' | 'ai'; description?: string }
export interface AgentFilters { page?: number; search?: string; availability?: string; readiness?: string; campaignStatus?: string; sort?: string; usage?: 'inbound' | 'outbound' }
export interface AgentLaunchInput {
  idempotencyKey: string; name?: string; mode: 'now' | 'scheduled'; scheduledAt?: string | null;
  transport?: CallTransport; pairedDeviceId?: string | null;
  schedule?: Schedule; executionEndsAt?: string | null; continueAcrossDays: boolean;
}

export interface CallTokenUsage {
  inputAudio: number; inputCachedAudio: number; inputText: number; inputCachedText: number;
  outputAudio: number; outputText: number; input: number; output: number; total: number;
}
export type LeadTone = 'positive' | 'neutral' | 'hesitant' | 'negative';
export type CallOutcomeProfile = 'engaged' | 'partially_engaged' | 'callback_requested' | 'declined' | 'opted_out' | 'not_reached';
export interface CostComponents { model: number; telephony: number; platform: number; other?: number; modelDetail?: { audioIn: number; audioOut: number; textIn: number; textOut: number } }
export interface AnalyzedCallCost {
  amount: number; currency: string; source: 'token_usage' | 'per_minute_estimate' | 'provider_reported' | 'none';
  estimate: boolean; model: string | null; pricedAs: string | null; unpriced: boolean;
  tokens: CallTokenUsage | null; rates: Record<string, number> | null; components: CostComponents; billedMinutes: number | null;
  invoiceVerified?: boolean;
  models?: Array<{ model: string | null; provider: string | null; amount: number; unpriced: boolean; issues?: string[] }>;
}
export interface AnalyzedCall {
  aiVoice?: VoiceProviderSession | null;
  id: string; internalCallId: string; attemptNumber: number; leadId: string; leadName: string; leadPhone: string | null;
  campaignId: string; campaignName: string; isTest: boolean; provider: string | null;
  at: string; answeredAt: string | null; endedAt: string | null; durationSeconds: number; state: string;
  disposition: string | null; qualification: string | null; reviewRequired: boolean;
  failure: { code: string; message: string } | null;
  summary: string; description: string; blockers: string[]; notesSource: 'ai_agent' | 'call_results' | null;
  behavior: {
    outcome: CallOutcomeProfile; tone: LeadTone | null; toneEvidence: string | null;
    participation: { leadTurns: number; agentTurns: number; interruptions: number };
    answers: { valid: number; total: number };
    questions?: number; callbackRequested?: boolean; humanRequested?: boolean;
  };
  cost: AnalyzedCallCost;
  /** Incoming-call rows (GET /inbound-calls/costs): the caller is the "lead", the agent the "campaign". */
  outcome?: string | null; answeredBy?: 'ai' | 'human' | null; qualificationResult?: string | null; inquiry?: string | null;
  agentId?: string | null; agentName?: string | null; device?: string | null; sim?: string | null; leadCreated?: boolean; matchStatus?: string | null;
  costDiagnostics?: {
    cacheHitPercent: number | null; cachedInputTokens: number | null; estimatedCacheSavings: number | null; estimatedCostPerMinute: number | null;
    responseCount: number | null; averageOutputTokens: number | null; droppedResponses: number; compactions: number | null;
    configuration: Record<string, unknown> | null;
    responses: Array<{ responseId: string; cancelled: boolean; tokens: CallTokenUsage; inputCachedTokens?: number; estimatedCost: number | null; ttftMs: number | null; cacheObservation: string }>;
  };
}
export interface AnalyzedLead {
  pricingIncomplete?: boolean;
  /** Incoming calls: callers without a lead have leadId null and a `caller:<number>` key. */
  callerKey?: string;
  leadId: string; name: string; phone: string | null; status: string | null; calls: number; connected: number;
  seconds: number; cost: number; tokens: number; avgCostPerCall: number | null; lastCallAt: string; lastCallId: string;
  lastDisposition: string | null; lastQualification: string | null; lastTone: LeadTone | null; lastSummary: string;
}
export interface AgentCallAnalytics {
  agent: { id: string; name: string } | null; currency: string;
  /** 'inbound' for GET /inbound-calls/costs (same shape plus the inbound extras below). */
  scope?: 'inbound';
  byAgent?: Array<{ agentId: string | null; name: string; calls: number; seconds: number; cost: number; tokens: number; avgCostPerCall: number | null }>;
  providerComparison?: ProviderCostComparison;
  totals: {
    calls: number; connected: number; completed: number; qualified: number; leads: number; totalCost: number; totalSeconds: number;
    avgCostPerCall: number | null; avgCostPerConnectedCall: number | null; avgCostPerLead: number | null; costPerQualifiedLead: number | null;
    costPerMinute: number | null; avgDurationSeconds: number; connectRate: number | null;
    tokens: CallTokenUsage; avgTokensPerCall: number | null;
    components: { model: number; telephony: number; platform: number; other: number };
    modelDetail: { audioIn: number; audioOut: number; textIn: number; textOut: number };
    callsWithUsage: number; callsWithoutCost: number;
    answeredByAi?: number; missed?: number; leadsCreated?: number; aiSeconds?: number; avgCostPerAiCall?: number | null; costPerNewLead?: number | null;
  };
  testing: { calls: number; totalCost: number; seconds: number; tokens: number };
  pricing: { telephonyRatePerMinute: number; platformRatePerMinute: number; model: string | null };
  billing?: {
    status: 'not_reconciled'; timezone: 'UTC'; currency: 'USD'; from: string | null; to: string | null;
    modelEstimate: number; additionalEstimate: number; unpricedCalls: number; foreignCurrencyCalls: number; excludes: string[];
  };
  tone: Record<LeadTone | 'unrecorded', number>;
  outcomes: Partial<Record<CallOutcomeProfile, number>>;
  byDay: Array<{ date: string; calls: number; connected: number; cost: number; seconds: number; tokens: number }>;
  leads: AnalyzedLead[]; calls: AnalyzedCall[]; truncated: boolean;
}

export interface ProviderCostComparison {
  providers: Array<{
    provider: string; models: string[]; calls: number; seconds: number; turns: number;
    inputAudio: number; outputAudio: number; inputText: number; outputText: number; cachedInput: number;
    calculatedCostUsd: number; reportedCostUsd: number; calculatedCalls: number; reportedCalls: number; unpricedCalls: number; fallbacks: number; errors: number;
    audioInputCostUsd: number; audioOutputCostUsd: number; textInputCostUsd: number; textOutputCostUsd: number;
    averageLatencyMs: number | null; qualificationCompletionRate: number | null; qualificationAccuracy: null;
    calculatedCostPerMinute: number | null; calculatedCostPerConnectedMinute: number | null;
    calculatedCostPerQualifiedLead: number | null; distribution: number | null;
  }>;
  daily: ProviderPeriodCost[]; monthly: ProviderPeriodCost[]; estimatedSavings: null; savingsStatus: string;
  errors: Array<{ provider: string; count: number }>;
}
export interface ProviderPeriodCost { period: string; provider: string; calls: number; calculatedCostUsd: number; reportedCostUsd: number; unpricedCalls: number }
export interface VoiceProviderSession {
  provider: 'gemini' | 'openai'; model: string; fallback: boolean;
  attempts?: Array<{ provider: string; model: string; status: string; reason?: string; latencyMs: number; at: string }>;
}
