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
  id: string;
  leadId: string;
  lead: { id: string; name: string; leadNumber: string | null; status: string | null };
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
    contactLogId: string | null;
    requestedTimeText: string | null;
  };
  suppression: ContactSuppression | null;
  createdAt: string | null;
};

export type FollowUpPage = {
  data: FollowUp[];
  pagination: { hasNext: boolean; nextCursor: string | null };
};

export type FollowUpSummary = { overdue: number; today: number; upcoming: number; done: number; timezone: string };

export type FollowUpListParams = {
  scope: FollowUpScope;
  bucket: FollowUpBucket;
  tz: string;
  leadId?: string;
  q?: string;
  channel?: string;
  ownerId?: string;
};

export type CreateFollowUpInput = {
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
