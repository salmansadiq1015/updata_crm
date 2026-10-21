// SIM call campaign contracts (server/src/modules/simCall). AI-ASSISTED calling: the user
// talks on their own SIM; the app guides and captures; the server owns the queue, answers
// and CRM sync. Parsing tolerates extra fields; ids are normalised to `id`.
import { z } from 'zod';
import type { QualificationAnswer } from '@/features/communication/types';

const idOf = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? String((value as { _id?: unknown; id?: unknown })._id ?? (value as { id?: unknown }).id ?? '')
    : String(value ?? '');

export const CAMPAIGN_STATUSES = ['draft', 'running', 'paused', 'completed', 'cancelled'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const TASK_STATES = [
  'pending',
  'in_progress',
  'scheduled',
  'needs_review',
  'completed',
  'skipped',
  'ineligible',
  'cancelled',
] as const;
export type TaskState = (typeof TASK_STATES)[number];

/** Outcomes the user confirms. The app never infers "answered" from dialling. */
export const CALL_OUTCOMES = [
  'answered',
  'no_answer',
  'busy',
  'rejected',
  'callback_requested',
  'wrong_number',
  'failed',
  'cancelled',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export type Interest = 'interested' | 'not_interested';
export type OutcomeEvidence = 'user' | 'call_state' | 'call_log';

export const campaignQuestionSchema = z
  .object({
    fieldKey: z.string(),
    label: z.string(),
    text: z.string(),
    description: z
      .string()
      .nullish()
      .transform((v) => v ?? ''),
    type: z.string(),
    required: z.boolean().default(false),
    order: z.number().default(0),
    options: z
      .array(z.union([z.string(), z.object({ value: z.string(), label: z.string().optional() })]))
      .default([])
      .transform((list) => list.map((o) => (typeof o === 'string' ? o : o.value))),
    condition: z.unknown().nullish(),
  })
  .passthrough();
export type CampaignQuestion = z.infer<typeof campaignQuestionSchema>;

export const campaignSummarySchema = z
  .object({
    total: z.number().default(0),
    pending: z.number().default(0),
    inProgress: z.number().default(0),
    scheduled: z.number().default(0),
    needsReview: z.number().default(0),
    completed: z.number().default(0),
    skipped: z.number().default(0),
    ineligible: z.number().default(0),
    cancelled: z.number().default(0),
    answered: z.number().default(0),
    noAnswer: z.number().default(0),
    busy: z.number().default(0),
    rejected: z.number().default(0),
    callbacks: z.number().default(0),
    callbacksDue: z.number().default(0),
    wrongNumber: z.number().default(0),
    failed: z.number().default(0),
    syncFailed: z.number().default(0),
    attempts: z.number().default(0),
  })
  .passthrough();
export type CampaignSummary = z.infer<typeof campaignSummarySchema>;

export const campaignSettingsSchema = z
  .object({
    timezone: z.string().default('UTC'),
    callWindow: z.object({ start: z.string(), end: z.string() }).default({ start: '09:00', end: '19:00' }),
    daysOfWeek: z.array(z.number()).default([1, 2, 3, 4, 5]),
    countdownSeconds: z.number().default(10),
    autoDial: z.boolean().default(false),
    maxAttempts: z.number().default(2),
    retryDelayMinutes: z.number().default(60),
    readAloud: z.boolean().default(true),
  })
  .passthrough();

export const callCampaignSchema = z
  .object({
    _id: z.unknown(),
    name: z.string(),
    description: z
      .string()
      .nullish()
      .transform((v) => v ?? ''),
    status: z.enum(CAMPAIGN_STATUSES),
    instructions: z
      .string()
      .nullish()
      .transform((v) => v ?? ''),
    questionsVersion: z.number().default(1),
    questionnaire: z
      .object({ questions: z.array(campaignQuestionSchema).default([]) })
      .default({ questions: [] }),
    settings: campaignSettingsSchema.default(() => campaignSettingsSchema.parse({})),
    subscriptionId: z
      .number()
      .nullish()
      .transform((v) => v ?? null),
    startsAt: z
      .string()
      .nullish()
      .transform((v) => v ?? null),
    summary: campaignSummarySchema.default(() => campaignSummarySchema.parse({})),
    lastActivityAt: z
      .string()
      .nullish()
      .transform((v) => v ?? null),
    createdAt: z
      .string()
      .nullish()
      .transform((v) => v ?? null),
  })
  .passthrough()
  .transform(({ _id, ...rest }) => ({ ...rest, id: idOf(_id) }));
export type CallCampaign = z.infer<typeof callCampaignSchema>;

export const taskAnswerSchema = z
  .object({
    fieldKey: z.string(),
    status: z.enum(['answered', 'unknown', 'skipped']),
    value: z.unknown().nullish(),
    normalizedValue: z.unknown().nullish(),
  })
  .passthrough();
export type TaskAnswer = z.infer<typeof taskAnswerSchema>;

const syncSchema = z
  .object({
    status: z.enum(['pending', 'ok', 'failed', 'skipped']).default('pending'),
    error: z.string().nullish(),
  })
  .passthrough();

export const callTaskSchema = z
  .object({
    id: z.string(),
    campaignId: z.string(),
    leadId: z.string(),
    lead: z
      .object({
        id: z.string(),
        name: z.string().nullish(),
        leadNumber: z.string().nullish(),
        contactName: z.string().nullish(),
        status: z.string().nullish(),
        city: z.string().nullish(),
      })
      .nullish(),
    state: z.enum(TASK_STATES),
    outcome: z.enum(CALL_OUTCOMES).nullish(),
    notBefore: z.string().nullish(),
    destinationMasked: z.string().nullish(),
    eligibility: z
      .object({ eligible: z.boolean(), reasons: z.array(z.string()) })
      .passthrough()
      .nullish(),
    lock: z
      .object({
        deviceId: z.string().nullish(),
        attemptId: z.string().nullish(),
        until: z.string().nullish(),
      })
      .nullish(),
    attemptCount: z.number().default(0),
    answers: z.array(taskAnswerSchema).default([]),
    callback: z
      .object({
        at: z.string().nullish(),
        timezone: z.string().nullish(),
        reason: z.string().nullish(),
        status: z.enum(['pending', 'done', 'cancelled']).nullish(),
      })
      .passthrough()
      .nullish(),
    attempts: z
      .array(
        z
          .object({
            attemptId: z.string(),
            dialedAt: z.string().nullish(),
            outcome: z.enum(CALL_OUTCOMES).nullish(),
            completedAt: z.string().nullish(),
            notes: z.string().nullish(),
            transcript: z.string().nullish(),
            durationSec: z.number().nullish(),
            offhookDurationSec: z.number().nullish(),
            evidence: z.string().nullish(),
            sync: syncSchema.nullish(),
          })
          .passthrough(),
      )
      .default([]),
    campaign: z
      .object({ id: z.string(), name: z.string(), status: z.string().optional() })
      .passthrough()
      .nullish(),
    overdue: z.boolean().optional(),
  })
  .passthrough();
export type CallTask = z.infer<typeof callTaskSchema>;

export const claimResultSchema = z.object({
  task: callTaskSchema.nullable(),
  resumed: z.boolean().default(false),
  reason: z
    .enum(['not_started', 'outside_calling_hours', 'waiting', 'queue_empty', 'campaign_completed'])
    .nullable(),
  nextAt: z.string().nullish(),
});
export type ClaimResult = z.infer<typeof claimResultSchema>;
export type ClaimReason = NonNullable<ClaimResult['reason']>;

export const dialResultSchema = z.object({ dialNumber: z.string(), destinationMasked: z.string().nullish() });

export const campaignEventSchema = z
  .object({
    _id: z.unknown(),
    type: z.string(),
    at: z.string(),
    details: z.record(z.string(), z.unknown()).nullish(),
    leadId: z.unknown().nullish(),
  })
  .passthrough()
  .transform(({ _id, leadId, ...rest }) => ({
    ...rest,
    id: idOf(_id),
    leadName:
      typeof leadId === 'object' && leadId !== null
        ? String((leadId as { name?: unknown }).name ?? '')
        : null,
  }));
export type CampaignEvent = z.infer<typeof campaignEventSchema>;

export type AnswerInput = { fieldKey: string; status: 'answered' | 'unknown' | 'skipped'; value?: unknown };

export type CompleteInput = {
  attemptId: string;
  outcome: CallOutcome;
  interest?: Interest | null;
  answers?: AnswerInput[];
  notes?: string;
  transcript?: string;
  qualification?: { answers: QualificationAnswer[] };
  callback?: { at: string; timezone: string; reason?: string } | null;
  doNotContact?: boolean;
  call?: {
    evidence: OutcomeEvidence;
    offhookAt?: string | null;
    endedAt?: string | null;
    durationSec?: number | null;
    offhookDurationSec?: number | null;
  };
};

export type CampaignInput = {
  creationKey?: string;
  name: string;
  description?: string;
  leadIds: string[];
  questionnaire: {
    questions: {
      fieldKey: string;
      label: string;
      text: string;
      type: string;
      required: boolean;
      order: number;
      options: string[];
      condition?: { all: { field: string; equals: string | boolean | number }[] } | null;
    }[];
  };
  instructions?: string;
  settings: {
    timezone: string;
    callWindow: { start: string; end: string };
    daysOfWeek: number[];
    countdownSeconds: number;
    autoDial: boolean;
    maxAttempts: number;
    retryDelayMinutes: number;
    readAloud: boolean;
  };
  subscriptionId?: number | null;
};
