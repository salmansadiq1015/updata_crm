/**
 * Lead workflow (conversation history, answer history, follow-up inbox,
 * assignment / first-response SLA). Mirrors server/src/modules/crm/
 * leadTimeline.service.js, leadFollowUp.service.js, leadQualification.service.js
 * and leadAssignment.service.js. Every optional server field is nullable: the
 * UI says "not recorded" instead of inventing a value.
 */

export type TimelineEntryType =
  | 'communication'
  | 'contact_log'
  | 'ai_call'
  | 'sms_message'
  | 'sim_call_event'
  | 'incoming_call'
  | 'provider_message'
  | 'qualification'
  | 'follow_up'
  | 'workflow';

export type TimelineChannel = 'phone' | 'sms' | 'email' | 'whatsapp' | 'other';

export type TranscriptTurn = {
  index: number;
  role: 'assistant' | 'customer';
  text: string;
  at: string | null;
  interrupted?: boolean;
};

export type TranscriptRef = {
  callRecordId: string | null;
  turnIndex: number | null;
  startMs: number | null;
  quote: string | null;
};

export type TimelineEntry = {
  id: string;
  type: TimelineEntryType;
  at: string;
  leadId: string | null;
  mergedFrom: string | null;
  channel: TimelineChannel | null;
  direction: 'outbound' | 'inbound' | null;
  title: string;
  status: string | null;
  summary: string | null;
  body: string | null;
  actor: { id: string; name: string | null } | null;
  links: Record<string, string | null>;
  transcript: {
    available: boolean;
    expired: boolean;
    restricted: boolean;
    turnCount: number;
    excerpt: TranscriptTurn[];
  } | null;
  meta: Record<string, unknown>;
};

export type TimelinePage = {
  data: TimelineEntry[];
  pagination: { hasNext: boolean; nextCursor: string | null };
};

export type TimelineFilters = {
  types?: TimelineEntryType[];
  channel?: TimelineChannel;
};

export type CallTranscript = {
  callRecordId: string;
  campaignName: string | null;
  agentName: string | null;
  disposition: string | null;
  startedAt: string | null;
  expired: boolean;
  turns: TranscriptTurn[];
};

export type QualificationValue = string | number | boolean | null;

export type AnswerSource = 'user' | 'ai_proposed_user_confirmed' | 'sms_agent' | 'ai_call_agent' | 'user_correction';

export type AnswerHistoryEntry = {
  id: string;
  fieldKey: string;
  previous: { value: QualificationValue; status: string } | null;
  current: { value: QualificationValue; status: string; evidence: string | null };
  source: AnswerSource | null;
  changedAt: string | null;
  changedByName: string | null;
  communicationId: string | null;
  callRecordId: string | null;
  smsMessageId: string | null;
  transcriptRef: TranscriptRef | null;
  correctionOf: string | null;
  reason: string | null;
};

export type AnswerCorrectionInput = {
  fieldKey: string;
  status: 'answered' | 'unknown' | 'refused' | 'not_applicable';
  value: QualificationValue;
  reason: string;
  correctionOf?: string | null;
};

export type FollowUpStatus = 'open' | 'snoozed' | 'done' | 'cancelled';
export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'open' | 'done';
export type FollowUpScope = 'mine' | 'team' | 'all';

export type ContactSuppression = {
  suppressed: boolean;
  reason: string | null;
  reasons: string[];
  nextAllowedAt: string | null;
  limited: boolean;
};

export type FollowUp = {
  taskType?: string | null;
  priority?: string;
  reminderMinutes?: number | null;
  id: string;
  leadId: string;
  lead: { id: string; name: string; leadNumber: string | null; status: string | null;
    email?: string | null; phone?: string | null; pipelineStage?: string;
    lastContactedAt?: string | null; lastContactChannel?: string | null;
    latestCall?: import('../schemas/lead-call-lifecycle').LeadCallLifecycle | null };
  owner: { id: string; name: string | null };
  createdBy?: string | null;
  dueAt: string | null;
  nextDueAt: string | null;
  timezone: string | null;
  channel: string | null;
  note: string | null;
  status: FollowUpStatus;
  bucket: Exclude<FollowUpBucket, 'open'>;
  snoozedUntil: string | null;
  snoozeCount: number;
  completedAt: string | null;
  completionNote: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  source: {
    type: string;
    communicationId: string | null;
    callRecordId: string | null;
    campaignId: string | null;
    callingAgentId: string | null;
    qualification: string | null;
    recommendedAction: string | null;
    contactLogId: string | null;
    requestedTimeText: string | null;
  };
  suppression: ContactSuppression | null;
  /** AI follow-up calling state (server engine/followUpView.js); null for ordinary human tasks. */
  automation: FollowUpAutomation | null;
  createdAt: string | null;
};

/** LeadFollowUp.automation.state (server engine/followUpDecision.js AUTOMATION_STATES). */
export const FOLLOW_UP_AUTOMATION_STATES = [
  'scheduled', 'queued', 'calling', 'retry_scheduled', 'paused',
  'completed', 'no_answer', 'busy', 'failed', 'cancelled', 'skipped', 'requires_human',
] as const;
export type FollowUpAutomationState = typeof FOLLOW_UP_AUTOMATION_STATES[number];
/** A call is queued, dialling or about to redial: no agent change / call now / reschedule. */
export const FOLLOW_UP_ACTIVE_STATES: readonly FollowUpAutomationState[] = ['queued', 'calling', 'retry_scheduled'];

/** Follow-up reason / call outcome codes (server FOLLOW_UP_OUTCOMES + MANUAL). */
export const FOLLOW_UP_REASONS = [
  'CALLBACK_REQUESTED', 'INTERESTED_NEEDS_MORE_TIME', 'INFORMATION_REQUESTED', 'NO_ANSWER', 'BUSY',
  'TEMPORARILY_UNAVAILABLE', 'APPOINTMENT_PENDING', 'APPOINTMENT_CONFIRMATION_REQUIRED', 'QUALIFICATION_INCOMPLETE',
  'HUMAN_FOLLOW_UP_REQUIRED', 'NOT_INTERESTED', 'DO_NOT_CONTACT', 'COMPLETED', 'HANDOFF', 'MANUAL',
] as const;

export type FollowUpAutomation = {
  mode: 'ai' | 'human';
  agentId: string | null;
  state: FollowUpAutomationState | null;
  reason: string | null;
  outcome: string | null;
  round: number;
  attempts: number;
  campaignId: string | null;
  callRecordId: string | null;
  previousCallId: string | null;
  notBefore: string | null;
  lastError: string | null;
  instructions: string | null;
  timeResolution: { kind: string; approximate: boolean; requestedText: string | null; shiftedFrom: string | null } | null;
  stateChangedAt: string | null;
  history: { state: string; at: string | null; reason: string | null }[];
  call: {
    state: string | null;
    disposition: string | null;
    qualification: string | null;
    durationSeconds: number;
    answeredAt: string | null;
    endedAt: string | null;
    summary: string | null;
  } | null;
  agent: { id: string; name: string; title: string | null; agentType: string | null; avatarPresetId: string | null; availability: string | null } | null;
};

/** `management` filter of GET /crm/follow-ups (omitted = all follow-ups). */
export type FollowUpManagement = 'ai' | 'human' | 'ai_scheduled' | 'ai_active' | 'ai_completed' | 'ai_failed' | 'attention';

/** An outbound AI calling agent that a follow-up can be handed to (GET /ai-calling/agents). */
export type FollowUpAgentOption = {
  id: string;
  name: string;
  title: string | null;
  agentType: string | null;
  availability: string | null;
  avatarUrl: string | null;
  followUp: { enabled: boolean; autoCall: boolean; manualCall: boolean };
};

/** Organisation switch for AUTOMATIC follow-up calls (GET /ai-calling/settings/follow-up). */
export type FollowUpAutomationSettings = {
  enabled: boolean;
  forcedOffByEnv: boolean;
  pausedReason: string | null;
  voicePaused: boolean;
};

export type FollowUpAiAction =
  | { id: string; action: 'assign-agent'; body: { agentId: string; dueAt?: string | null; instructions?: string | null } }
  | { id: string; action: 'call-now' | 'pause' | 'resume'; body?: Record<string, never> }
  | { id: string; action: 'assign-human'; body: { ownerId?: string | null } };

export type FollowUpPage = {
  data: FollowUp[];
  pagination: { hasNext: boolean; nextCursor: string | null };
};

export type FollowUpSummary = { overdue: number; today: number; upcoming: number; done: number; timezone: string;
  totalLeads: number; qualifiedLeads: number; pending: number; completed: number;
  emailsSent: number; emailsDelivered: number; emailsFailed: number;
  aiManaged: number; aiScheduled: number; aiInProgress: number; aiCompleted: number; aiFailed: number; attention: number };

export type FollowUpListParams = {
  scope: FollowUpScope;
  bucket: FollowUpBucket;
  tz: string;
  leadId?: string;
  q?: string;
  channel?: string;
  ownerId?: string;
  qualification?: string;
  order?: 'asc' | 'desc';
  management?: FollowUpManagement;
  agentId?: string;
};

export type CreateFollowUpInput = {
  taskType?: string | null;
  priority?: string;
  reminderMinutes?: number | null;
  leadId: string;
  dueAt: string;
  timezone?: string | null;
  channel?: string | null;
  note?: string | null;
  ownerId?: string | null;
};

export type SlaStatus = 'none' | 'pending' | 'met' | 'overdue' | 'late';

export type LeadSla = {
  assignedAt: string | null;
  assignmentSource: 'manual' | 'auto' | 'import' | null;
  firstResponseDueAt: string | null;
  firstRespondedAt: string | null;
  firstResponseChannel: string | null;
  slaStatus: SlaStatus;
  escalationLevel: number;
};

export type AssignmentStrategy = 'round_robin' | 'least_loaded';

export type AssignmentRule = {
  _id?: string | null;
  name: string | null;
  match: { source: string | null; city: string | null; businessType: string | null };
  userIds: string[];
  strategy: AssignmentStrategy | null;
};

export type AssignmentPolicy = {
  enabled: boolean;
  strategy: AssignmentStrategy;
  eligibleUserIds: string[];
  rules: AssignmentRule[];
  sla: {
    enabled: boolean;
    firstResponseMinutes: number;
    businessHours: { enabled: boolean; timezone: string; days: number[]; start: string; end: string };
  };
  escalation: { enabled: boolean; afterMinutes: number; maxLevel: number; userIds: string[]; followUpAfterMinutes: number };
};
