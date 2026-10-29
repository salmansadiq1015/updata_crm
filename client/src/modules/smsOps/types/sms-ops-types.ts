/** Shapes returned by /api/v1/sim-sms (SMS operations) and /api/v1/contact-policy. */

export type HealthStatus = 'online' | 'warning' | 'offline';
export type ReasonSeverity = 'critical' | 'warning' | 'info';

export interface DeviceHealth {
  status: HealthStatus;
  online?: boolean;
  reasons: { code: string; severity: ReasonSeverity }[];
  lastSeenMs: number | null;
}

export interface DeviceSim {
  subscriptionId?: number | null;
  slotIndex: number;
  carrierName: string | null;
  displayName: string | null;
  countryIso: string | null;
  isDefaultSms: boolean;
  selected: boolean;
  numberMasked: string | null;
}

export interface SmsDevice {
  deviceId: string;
  manufacturer?: string | null;
  model: string | null;
  osVersion: string | null;
  sdkInt?: number | null;
  appVersion: string | null;
  buildNumber?: string | null;
  buildProfile: 'play' | 'shared' | 'private' | 'development' | null;
  permissions: Partial<Record<'smsDeclared' | 'sendSms' | 'receiveSms' | 'readPhoneState' | 'postNotifications' | 'batteryOptimizationIgnored', boolean | null>>;
  simState: string | null;
  sims: DeviceSim[];
  network: { type?: string | null; connected?: boolean | null; internetReachable?: boolean | null; airplaneMode?: boolean | null };
  queue: { pending: number; attempting: number; unknown: number; failed: number; inboundPending?: number };
  last: { sendAt?: string | null; inboundAt?: string | null; leaseAt?: string | null; resultPostAt?: string | null };
  lastError?: { code: string | null; message: string | null; at: string | null } | null;
  agent?: { running?: boolean | null; lastCycleAt?: string | null };
  lastHeartbeatAt: string | null;
  health: DeviceHealth;
  queueLoad?: { total: number; ratio: number };
  campaigns?: { id: string; name: string; status: string }[];
  resyncRequestedAt?: string | null;
  resyncCompletedAt?: string | null;
  statusHistory?: { status: HealthStatus; at: string; reasons: string[] }[];
}

export interface Paged<T> { data: T[]; pagination: { page: number; limit: number; total: number; pages: number } }

export interface ReviewProposal {
  fieldKey: string;
  label: string | null;
  type: string | null;
  proposedValue: unknown;
  confidence: number | null;
  evidence: string | null;
  source: string;
  reason: string | null;
  alternatives?: unknown[];
  decision?: 'accept' | 'edit' | 'reject' | null;
  finalValue?: unknown;
}

export interface AnswerReview {
  _id: string;
  reply: string;
  language: string | null;
  proposals: ReviewProposal[];
  status: 'pending' | 'resolved' | 'dismissed';
  lead?: { _id: string; name: string; leadNumber?: string | null } | null;
  campaign?: { _id: string; name: string } | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export type ReviewDecision = { fieldKey: string; action: 'accept' | 'edit' | 'reject'; value?: unknown };

export type RecoveryType = 'unknown_send' | 'unmatched_reply' | 'delivery_failure' | 'sync_failure' | 'provider_failure';
export type RecoveryStatus = 'open' | 'resolved' | 'dismissed';
export type RecoveryActionName =
  | 'mark_sent' | 'mark_not_sent' | 'resend' | 'link_lead' | 'retry_other_sim' | 'request_resync' | 'retry_sync' | 'dismiss';

export interface RecoveryItem {
  _id: string;
  type: RecoveryType;
  severity: 'low' | 'medium' | 'high';
  leadId: string | null;
  lead?: { _id?: string; name: string; leadNumber?: string | null } | null;
  campaignId: string | null;
  conversationId: string | null;
  messageId: string | null;
  deviceId: string | null;
  details: {
    body?: string;
    fromMasked?: string;
    code?: string;
    cause?: string;
    kind?: string;
    suggestedLeads?: { _id: string; name: string; leadNumber?: string | null }[];
    [key: string]: unknown;
  };
  status: RecoveryStatus;
  occurrences?: number;
  resolution?: { action: string | null; by: string | null; at: string | null; note: string | null } | null;
  allowedActions: RecoveryActionName[];
  createdAt: string;
}

export interface RecoveryCounts { open: number; byType: Partial<Record<RecoveryType, number>> }

export interface SmsCallback {
  id: string;
  leadId: string;
  leadName: string | null;
  conversationId: string | null;
  campaignId: string | null;
  dueAt: string | null;
  needsTime: boolean;
  requestedTimeText: string | null;
  evidence: string | null;
  note: string | null;
  status: string;
  createdAt: string;
}

export type ContactChannel = 'voice' | 'sms' | 'email' | 'whatsapp';
export const CONTACT_CHANNELS: ContactChannel[] = ['voice', 'sms', 'email', 'whatsapp'];

export interface ContactPolicySettings {
  enabled: boolean;
  configured?: boolean;
  maxTouchesPerDay: number;
  maxTouchesPerWeek: number;
  minGapMinutes: number;
  channels: Record<ContactChannel, { perDay: number; perWeek: number }>;
  quietHours: { enabled: boolean; start: string; end: string };
  updatedAt?: string | null;
}

export interface ChannelDecision {
  allowed: boolean;
  reason: string | null;
  nextAllowedAt: string | null;
  blocked: boolean;
  blockers: string[];
  counts?: { day: number; week: number; channelDay: number; channelWeek: number; lastTouchAt: string | null };
  timezone?: string | null;
  quietHours?: { applies: boolean; quiet: boolean; until: string | null; unknownTimezone?: boolean };
  policyEnabled?: boolean;
}

export interface LeadContactStatus {
  leadId: string;
  nextAllowedAt: string | null;
  channels: Record<ContactChannel, ChannelDecision>;
  recentTouches: { channel: ContactChannel; source: string; at: string; status: string; manual: boolean; policyWarning: string | null }[];
}

export type SkipSource = 'ai_calling' | 'sim_call' | 'sim_sms' | 'messaging';
export interface CampaignSkips {
  skipped: number;
  skippedContactLimit: number;
  blocked: number;
  byReason: Record<string, { leads: number; attempts: number; nextAllowedAt: string | null }>;
}
