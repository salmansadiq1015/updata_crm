// SIM call campaigns (server/src/modules/simCall): AI-assisted calling from the user's own
// phone. The web CRM configures campaigns and shows server-persisted progress/results;
// the calls themselves are placed by the Updata Android app.
export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
export type TaskState =
  | 'pending' | 'in_progress' | 'scheduled' | 'needs_review' | 'completed' | 'skipped' | 'ineligible' | 'cancelled';
export type CallOutcome =
  | 'answered' | 'no_answer' | 'busy' | 'rejected' | 'callback_requested' | 'wrong_number' | 'failed' | 'cancelled';

export interface SimCallQuestion {
  fieldKey: string;
  label: string;
  text: string;
  description?: string;
  type: string;
  required: boolean;
  order: number;
  options: string[];
  condition?: { all?: Record<string, unknown>[]; any?: Record<string, unknown>[] } | null;
}

export interface SimCallSettings {
  timezone: string;
  callWindow: { start: string; end: string };
  daysOfWeek: number[];
  countdownSeconds: number;
  autoDial: boolean;
  maxAttempts: number;
  retryDelayMinutes: number;
  readAloud: boolean;
}

export interface SimCallSummary {
  total: number; pending: number; inProgress: number; scheduled: number; needsReview: number;
  completed: number; skipped: number; ineligible: number; cancelled: number;
  answered: number; noAnswer: number; busy: number; rejected: number; callbacks: number; callbacksDue: number;
  wrongNumber: number; failed: number; syncFailed: number; attempts: number;
}

export interface SimCallCampaign {
  _id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  instructions: string;
  questionsVersion: number;
  questionnaire: { questions: SimCallQuestion[] };
  settings: SimCallSettings;
  subscriptionId: number | null;
  startsAt: string | null;
  summary: SimCallSummary;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface SimCallTask {
  id: string;
  campaignId: string;
  leadId: string;
  lead: { id: string; name: string | null; leadNumber: string | null; contactName: string | null; status: string | null; city: string | null } | null;
  state: TaskState;
  outcome: CallOutcome | null;
  notBefore: string | null;
  destinationMasked: string | null;
  eligibility: { eligible: boolean; reasons: string[] } | null;
  attemptCount: number;
  answers: { fieldKey: string; status: 'answered' | 'unknown' | 'skipped'; value: unknown; normalizedValue: unknown }[];
  callback: { at: string; timezone: string; reason: string; status: 'pending' | 'done' | 'cancelled' } | null;
  overdue?: boolean;
  attempts?: {
    attemptId: string; dialedAt: string | null; outcome: CallOutcome | null; interest: string | null; evidence: string | null;
    offhookDurationSec: number | null; durationSec: number | null; notes: string; transcript: string; completedAt: string | null;
    sync: { status: 'pending' | 'ok' | 'failed' | 'skipped'; error: string | null };
  }[];
  campaign?: { id: string; name: string; status: CampaignStatus } | null;
}

export interface SimCallEvent { _id: string; type: string; at: string; leadId?: { name?: string } | null; details?: Record<string, unknown> | null }

export interface CreateSimCallCampaignInput {
  creationKey?: string;
  name: string;
  description?: string;
  leadIds: string[];
  instructions?: string;
  questionnaire: { questions: SimCallQuestion[] };
  settings: SimCallSettings;
  subscriptionId?: number | null;
}
