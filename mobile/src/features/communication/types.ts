// Mobile view of the CRM's device-communication records
// (server/src/modules/crm/leadCommunication.*). Tolerant parsing like the lead schema:
// unknown fields are ignored, absent optional ones become null.
import { z } from 'zod';

export const CHANNELS = ['phone', 'sms'] as const;
export type Channel = (typeof CHANNELS)[number];

export const ROUTES = ['telecom_direct', 'dialer_handoff', 'sms_composer'] as const;
export type CommunicationRoute = (typeof ROUTES)[number];

export type DestinationField = 'phone' | 'mobile';

export const CALL_DISPOSITIONS = [
  'interested',
  'not_interested',
  'callback_requested',
  'no_answer',
  'busy',
  'voicemail',
  'wrong_number',
  'human_follow_up',
  'do_not_contact',
  'unknown',
] as const;
export const SMS_DISPOSITIONS = ['sent', 'not_sent', 'unknown'] as const;
export const DISPOSITIONS = [...CALL_DISPOSITIONS, 'sent', 'not_sent'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const CONNECTED_VALUES = ['yes', 'no', 'unknown'] as const;
export type Connected = (typeof CONNECTED_VALUES)[number];

export const SMS_SEND_STATUSES = [
  'composer_opened',
  'user_reported_sent',
  'user_reported_not_sent',
  'unknown',
] as const;
export type SmsSendStatus = (typeof SMS_SEND_STATUSES)[number];

export const EVENT_TYPES = [
  'created',
  'dispatch_requested',
  'dispatched',
  'dispatch_failed',
  'call_state_idle',
  'call_state_ringing',
  'call_state_offhook',
  'app_backgrounded',
  'app_foregrounded',
  'composer_opened',
  'composer_returned',
  'notes_edited',
  'disposition_selected',
  'qualification_reviewed',
  'submitted',
] as const;
export type CommunicationEventType = (typeof EVENT_TYPES)[number];

export type CommunicationEvent = {
  seq: number;
  type: CommunicationEventType;
  at: string;
  source: 'native' | 'app' | 'user';
  data?: Record<string, string | number | boolean | null>;
};

export const ANSWER_STATUSES = ['answered', 'unknown', 'refused', 'not_applicable'] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export type QualificationAnswer = {
  fieldKey: string;
  label: string;
  value: string | number | boolean | null;
  status: AnswerStatus;
  source: 'user' | 'ai_proposed_user_confirmed';
  evidence: string | null;
  confidence: number | null;
};

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? null);
const nullableNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? null);

const STEP_STATUSES = ['ok', 'skipped', 'failed'] as const;
const stepSchema = z
  .object({ status: z.enum(STEP_STATUSES).catch('failed'), error: nullableString, at: nullableString })
  .nullish()
  .transform((step) => step ?? null);

export const RECEIPT_STEPS = [
  'outcome',
  'contactLog',
  'leadContact',
  'statusChange',
  'qualification',
  'suppression',
] as const;
export type ReceiptStep = (typeof RECEIPT_STEPS)[number];

export const receiptSchema = z
  .object({
    steps: z
      .object({
        outcome: stepSchema,
        contactLog: stepSchema,
        leadContact: stepSchema,
        statusChange: stepSchema,
        qualification: stepSchema,
        suppression: stepSchema,
      })
      .partial()
      .nullish()
      .transform((steps) => steps ?? {}),
    completedAt: nullableString,
  })
  .nullish()
  .transform((receipt) => receipt ?? { steps: {}, completedAt: null });
export type Receipt = z.infer<typeof receiptSchema>;

export function receiptStatus(receipt: Receipt): 'complete' | 'partial' | 'pending' {
  const steps = RECEIPT_STEPS.map((key) => receipt.steps[key]?.status);
  if (steps.some((status) => status === 'failed')) return 'partial';
  if (steps.every((status) => status === 'ok' || status === 'skipped')) return 'complete';
  return 'pending';
}

const qualificationAnswerSchema = z.object({
  fieldKey: z.string(),
  label: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
  value: z
    .union([z.string(), z.number(), z.boolean()])
    .nullish()
    .transform((v) => v ?? null),
  status: z.enum(ANSWER_STATUSES).catch('unknown'),
  source: z.enum(['user', 'ai_proposed_user_confirmed']).catch('user'),
  evidence: nullableString,
  confidence: nullableNumber,
});

export const communicationSchema = z
  .object({
    id: z.string().optional(),
    _id: z.string().optional(),
    operationId: z.string(),
    leadId: z.string(),
    channel: z.enum(CHANNELS),
    route: z.enum(ROUTES).catch('dialer_handoff'),
    mode: z.enum(['manual', 'assisted']).catch('manual'),
    state: z.enum(['started', 'dispatched', 'dispatch_failed', 'completed']).catch('started'),
    destinationField: z.enum(['phone', 'mobile']).catch('phone'),
    destinationMasked: nullableString,
    sim: z
      .object({
        slotIndex: nullableNumber,
        carrierName: nullableString,
        displayName: nullableString,
        originNumber: nullableString,
      })
      .partial()
      .nullish()
      .transform((sim) => sim ?? null),
    observed: z
      .object({
        ringingObserved: z.boolean().nullish(),
        offhookAt: nullableString,
        idleAfterOffhookAt: nullableString,
        offhookDurationSec: nullableNumber,
        evidence: z.enum(['telephony_events', 'none']).catch('none'),
      })
      .partial()
      .nullish()
      .transform((observed) => observed ?? null),
    outcome: z
      .object({
        disposition: z.enum(DISPOSITIONS).catch('unknown'),
        connected: z.enum(CONNECTED_VALUES).catch('unknown'),
        notes: nullableString,
        followUpAt: nullableString,
        followUpTimezone: nullableString,
        statusChange: nullableString,
        doNotContact: z.boolean().nullish(),
      })
      .nullish()
      .transform((outcome) => outcome ?? null),
    sms: z
      .object({
        body: nullableString,
        encoding: nullableString,
        segments: nullableNumber,
        sendStatus: z.enum(SMS_SEND_STATUSES).catch('unknown'),
      })
      .nullish()
      .transform((sms) => sms ?? null),
    qualification: z
      .object({ answers: z.array(qualificationAnswerSchema).catch([]) })
      .nullish()
      .transform((q) => q ?? null),
    receipt: receiptSchema,
    createdAt: nullableString,
    completedAt: nullableString,
    createdBy: z
      .union([
        z.string(),
        z.object({
          firstName: z.string().nullish(),
          lastName: z.string().nullish(),
          email: z.string().nullish(),
        }),
      ])
      .nullish()
      .transform((user) => {
        if (!user || typeof user === 'string') return null;
        return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || null;
      }),
  })
  .transform(({ _id, ...raw }) => ({ ...raw, id: raw.id ?? _id ?? raw.operationId }));
export type Communication = z.infer<typeof communicationSchema>;

/** POST /communications also returns the number exactly as the CRM stores it. */
export const createdCommunicationSchema = z
  .object({ dialNumber: z.string().nullish() })
  .passthrough()
  .transform((raw) => ({
    communication: communicationSchema.parse(raw),
    dialNumber: raw.dialNumber ?? null,
  }));

export const completeResponseSchema = z.object({
  communication: communicationSchema,
  receipt: receiptSchema,
});

export const ELIGIBILITY_REASONS = [
  'NO_DESTINATION',
  'PHONE_SUPPRESSED',
  'SMS_SUPPRESSED',
  'SMS_CONSENT_DENIED',
  'INVALID_NUMBER',
] as const;

export const eligibilitySchema = z.object({
  eligible: z.boolean(),
  reasons: z.array(z.string()).catch([]),
  destinationMasked: nullableString,
});
export type Eligibility = z.infer<typeof eligibilitySchema>;

export const QUESTION_TYPES = [
  'short_text',
  'long_text',
  'boolean',
  'single_choice',
  'currency',
  'integer',
  'date',
] as const;

export const qualificationFieldSchema = z.object({
  fieldKey: z.string(),
  label: z.string(),
  type: z.string(),
  options: z
    .array(z.string())
    .nullish()
    .transform((options) => options ?? []),
  helpText: nullableString,
});
export type QualificationField = z.infer<typeof qualificationFieldSchema>;

export const storedQualificationSchema = z.object({
  fieldKey: z.string(),
  label: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
  value: z
    .union([z.string(), z.number(), z.boolean()])
    .nullish()
    .transform((v) => v ?? null),
  status: z.enum(ANSWER_STATUSES).catch('unknown'),
  source: nullableString,
  evidence: nullableString,
  updatedAt: nullableString,
});
export type StoredQualification = z.infer<typeof storedQualificationSchema>;

export const qualificationSchema = z.object({
  schema: z.array(qualificationFieldSchema),
  fields: z
    .array(storedQualificationSchema)
    .nullish()
    .transform((fields) => fields ?? []),
});

export const proposalSchema = z.object({
  fieldKey: z.string(),
  label: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
  proposedValue: z
    .union([z.string(), z.number(), z.boolean()])
    .nullish()
    .transform((v) => v ?? null),
  status: z.enum(ANSWER_STATUSES).catch('answered'),
  evidence: nullableString,
  confidence: nullableNumber,
});
export type Proposal = z.infer<typeof proposalSchema>;

export const proposeResponseSchema = z.object({
  available: z.boolean(),
  reason: nullableString,
  model: nullableString,
  proposals: z.array(proposalSchema).catch([]),
});
export type ProposeResponse = z.infer<typeof proposeResponseSchema>;

export const transcribeResponseSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  text: z.string().default(''),
  confidence: z.number().nullable().optional(),
});
export type TranscribeResponse = z.infer<typeof transcribeResponseSchema>;

export const smsTemplateSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    channel: z.string(),
    bodyText: z
      .string()
      .nullish()
      .transform((v) => v ?? ''),
    fallbackValues: z
      .record(z.string(), z.string())
      .nullish()
      .catch(null)
      .transform((v) => v ?? {}),
    isArchived: z.boolean().nullish(),
  })
  .transform(({ _id, ...raw }) => ({ ...raw, id: raw.id ?? _id ?? raw.name }));
export type SmsTemplate = z.infer<typeof smsTemplateSchema>;

/** Body of POST /communications/:operationId/complete. */
export type CompletePayload = {
  outcome: {
    disposition: Disposition;
    connected: Connected;
    notes: string;
    followUpAt?: string | null;
    followUpTimezone?: string | null;
    statusChange?: string | null;
    doNotContact?: boolean;
  };
  sms?: {
    templateId?: string | null;
    body: string;
    encoding: string;
    segments: number;
    sendStatus: SmsSendStatus;
  };
  qualification?: { answers: QualificationAnswer[] };
};
