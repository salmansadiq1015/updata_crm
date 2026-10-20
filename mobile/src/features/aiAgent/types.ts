// Mobile view of the CRM's AI agent campaigns. Two existing server systems, no
// parallel one: AI calls are server/src/modules/aiCalling (CallCampaign,
// CampaignRecipient); AI SMS are server/src/modules/messaging campaigns with
// channel "sms" (MessageCampaign, MessageRecipient). Parsing is tolerant: unknown
// fields are ignored, missing optional ones become null/0, unknown enum values are
// kept verbatim so the UI can show exactly what the server said.
import { z } from 'zod';

export type AgentChannel = 'call' | 'sms';

const str = z
  .string()
  .nullish()
  .transform((value) => value ?? null);
const num = z
  .number()
  .nullish()
  .catch(null)
  .transform((value) => value ?? 0);
const bool = z
  .boolean()
  .nullish()
  .catch(null)
  .transform((value) => value ?? false);
const idOf = <T extends { _id?: string; id?: string }>(raw: T) => raw.id ?? raw._id ?? '';

// ---------------------------------------------------------------- languages
export const agentLanguageSchema = z.object({
  code: z.string(),
  name: z.string(),
  nativeName: z
    .string()
    .nullish()
    .transform((value) => value ?? ''),
  support: z.enum(['full', 'limited']).catch('full'),
  rtl: bool,
});
export type AgentLanguage = z.infer<typeof agentLanguageSchema>;

export const languageListSchema = z.object({
  languages: z.array(agentLanguageSchema).catch([]),
  defaultLanguage: z
    .string()
    .nullish()
    .transform((value) => value ?? 'en'),
});
export type LanguageList = z.infer<typeof languageListSchema>;

// ---------------------------------------------------------------- readiness
/** GET /ai-calling/telephony/health (telephonyRouter.telephonyHealth). */
export const telephonyHealthSchema = z.object({
  configured: bool,
  livekitReady: bool,
  reason: str,
});
export type TelephonyHealth = z.infer<typeof telephonyHealthSchema>;

const providerStateSchema = z
  .object({ eligible: bool, reason: str })
  .nullish()
  .transform((value) => value ?? { eligible: false, reason: null });

/** GET /messaging/settings/health (messaging.service.providerHealth), SMS parts only. */
export const messagingHealthSchema = z.object({
  settings: z
    .object({
      providers: z
        .object({ textbeeEnabled: bool, twilioEnabled: bool })
        .nullish()
        .transform((value) => value ?? { textbeeEnabled: false, twilioEnabled: false }),
    })
    .nullish()
    .transform((value) => value ?? { providers: { textbeeEnabled: false, twilioEnabled: false } }),
  providers: z
    .object({ textbee: providerStateSchema, twilio: providerStateSchema })
    .nullish()
    .transform(
      (value) =>
        value ?? { textbee: { eligible: false, reason: null }, twilio: { eligible: false, reason: null } },
    ),
});
export type MessagingHealth = z.infer<typeof messagingHealthSchema>;

// ---------------------------------------------------------------- SMS templates
export const MESSAGE_PURPOSES = ['transactional', 'promotional', 'support'] as const;
export type MessagePurpose = (typeof MESSAGE_PURPOSES)[number];

export const agentSmsTemplateSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    channel: z.string(),
    purpose: z.enum(MESSAGE_PURPOSES).catch('promotional'),
    bodyText: z
      .string()
      .nullish()
      .transform((value) => value ?? ''),
    isArchived: bool,
  })
  .transform((raw) => ({ ...raw, id: idOf(raw) }));
export type AgentSmsTemplate = z.infer<typeof agentSmsTemplateSchema>;

// ---------------------------------------------------------------- shared
export const CAMPAIGN_STATUSES = [
  'draft',
  'scheduled',
  'queued',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Statuses in which progress can still change: the only ones we poll. */
export const ACTIVE_CAMPAIGN_STATUSES: readonly string[] = ['scheduled', 'queued', 'running'];

const eligibilitySchema = z
  .object({ eligible: bool, reasons: z.array(z.string()).catch([]) })
  .nullish()
  .transform((value) => value ?? { eligible: false, reasons: [] as string[] });

/** A populated `leadId` ({ _id, name, leadNumber }) or a bare id. */
const leadRefSchema = z
  .union([
    z.string(),
    z.object({
      _id: z.string().optional(),
      id: z.string().optional(),
      name: z.string().nullish(),
      leadNumber: z.string().nullish(),
    }),
  ])
  .nullish()
  .transform((ref) => {
    if (!ref) return { id: '', name: null, leadNumber: null };
    if (typeof ref === 'string') return { id: ref, name: null, leadNumber: null };
    return { id: idOf(ref), name: ref.name ?? null, leadNumber: ref.leadNumber ?? null };
  });

/** Page-based pagination used by both campaign modules ({ page, limit, total, pages }). */
export const pagePaginationSchema = z
  .object({ page: num, limit: num, total: num, pages: num })
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

// ---------------------------------------------------------------- AI call campaigns
export const callSummarySchema = z
  .object({
    total: num,
    eligible: num,
    ineligible: num,
    queued: num,
    inProgress: num,
    completed: num,
    answered: num,
    noAnswer: num,
    failed: num,
    retryScheduled: num,
    qualified: num,
    unqualified: num,
    callbacks: num,
    needsReview: num,
    doNotContact: num,
    suppressed: num,
    missingPhone: num,
    consentRequired: num,
  })
  .partial()
  .nullish()
  .transform((value) => value ?? {});

export const callCampaignSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    status: z.string(),
    isTest: bool,
    summary: callSummarySchema,
    agentConfig: z
      .object({ language: str, agentName: str, voice: str })
      .partial()
      .nullish()
      .transform((value) => value ?? {}),
    questionnaire: z
      .object({ questions: z.array(z.object({ fieldKey: z.string(), label: str })).catch([]) })
      .nullish()
      .transform((value) => value ?? { questions: [] }),
    createdAt: str,
    startedAt: str,
    completedAt: str,
  })
  .transform((raw) => ({ ...raw, id: idOf(raw) }));
export type CallCampaign = z.infer<typeof callCampaignSchema>;

/** POST /ai-calling/campaigns/:id/preview (aiCalling.service.previewCampaign). */
export const callPreviewSchema = z.object({
  totalSelected: num,
  eligible: num,
  missingPhone: num,
  suppressed: num,
  ineligible: num,
  estimatedDurationMinutes: num,
  telephony: telephonyHealthSchema
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
  note: str,
});
export type CallPreview = z.infer<typeof callPreviewSchema>;

export const callRecipientSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    state: z.string(),
    leadId: leadRefSchema,
    eligibility: eligibilitySchema,
    attemptCount: num,
    finalDisposition: str,
    qualification: str,
  })
  .transform((raw) => ({ ...raw, id: idOf(raw), lead: raw.leadId }));
export type CallRecipient = z.infer<typeof callRecipientSchema>;

const populatedRefSchema = z
  .union([
    z.string(),
    z.object({
      _id: z.string().optional(),
      id: z.string().optional(),
      name: z.string().nullish(),
      leadNumber: z.string().nullish(),
    }),
  ])
  .nullish()
  .transform((ref) => {
    if (!ref) return { id: '', name: null, leadNumber: null };
    if (typeof ref === 'string') return { id: ref, name: null, leadNumber: null };
    return { id: idOf(ref), name: ref.name ?? null, leadNumber: ref.leadNumber ?? null };
  });

export const callAnswerSchema = z.object({
  questionFieldKey: z.string(),
  label: str,
  rawAnswer: str,
  normalizedValue: z.unknown().nullish().catch(null),
  validation: str,
  confirmed: bool,
  confidence: z.number().nullish().catch(null),
  reviewStatus: str,
});

/** Authoritative persisted AI call attempt returned by /ai-calling/calls and lead history. */
export const callRecordSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    campaignId: populatedRefSchema,
    recipientId: z
      .union([z.string(), z.object({ _id: z.string().optional(), id: z.string().optional() })])
      .nullish()
      .transform((value) => (typeof value === 'string' ? value : value ? idOf(value) : '')),
    leadId: populatedRefSchema,
    internalCallId: str,
    attemptNumber: num,
    isTest: bool,
    state: z.string(),
    disposition: str,
    qualification: str,
    initiatedAt: str,
    answeredAt: str,
    endedAt: str,
    durationSeconds: num,
    answers: z.array(callAnswerSchema).catch([]),
    transcriptRef: str,
    recordingRef: str,
    reviewRequired: bool,
    failureCode: str,
    failureMessage: str,
    createdAt: str,
  })
  .transform((raw) => ({
    ...raw,
    id: idOf(raw),
    campaign: raw.campaignId,
    lead: raw.leadId,
  }));
export type CallRecord = z.infer<typeof callRecordSchema>;

export const callAnalyticsSchema = z.object({
  campaigns: num,
  totalCalls: num,
  answered: num,
  answerRate: z.number().nullable().catch(null),
  qualified: num,
  qualificationRate: z.number().nullable().catch(null),
  callbacks: num,
  avgCallSeconds: num,
  reviews: num,
});
export type CallAnalytics = z.infer<typeof callAnalyticsSchema>;

// Simulation (POST /ai-calling/campaigns/:id/simulate): text only, no telephony.
export const simulateResultSchema = z.object({
  // Opaque conversation state: sent back unchanged on the next turn.
  state: z.record(z.string(), z.unknown()).nullish().catch(null),
  nextAction: z
    .object({
      type: z.string(),
      reason: str,
      question: z
        .object({ fieldKey: z.string(), text: z.string(), label: str })
        .nullish()
        .catch(null)
        .transform((value) => value ?? null),
    })
    .nullish()
    .transform((value) => value ?? { type: 'end', reason: null, question: null }),
  progress: z
    .object({ total: num, answered: num })
    .nullish()
    .transform((value) => value ?? { total: 0, answered: 0 }),
  outcomePreview: z
    .object({ qualification: str, action: str, reason: str, requiresReview: bool })
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
});
export type SimulateResult = z.infer<typeof simulateResultSchema>;

// ---------------------------------------------------------------- AI SMS campaigns
export const smsSummarySchema = z
  .object({
    total: num,
    eligible: num,
    ineligible: num,
    draft: num,
    queued: num,
    submitting: num,
    accepted: num,
    sent: num,
    delivered: num,
    read: num,
    failed: num,
    undelivered: num,
    unknown: num,
    cancelled: num,
    suppressed: num,
  })
  .partial()
  .nullish()
  .transform((value) => value ?? {});

export const smsCampaignSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    channel: z.string(),
    purpose: z.string().nullish(),
    status: z.string(),
    summary: smsSummarySchema,
    content: z
      .object({ bodyText: str })
      .partial()
      .nullish()
      .transform((value) => value ?? {}),
    monitoring: z
      .object({
        progress: z
          .object({ eligible: num, processed: num, pending: num, percent: num })
          .nullish()
          .catch(null)
          .transform((value) => value ?? null),
      })
      .nullish()
      .catch(null)
      .transform((value) => value ?? { progress: null }),
    createdAt: str,
    startedAt: str,
    completedAt: str,
  })
  .transform((raw) => ({ ...raw, id: idOf(raw) }));
export type SmsCampaign = z.infer<typeof smsCampaignSchema>;

export const smsRecipientSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    status: z.string(),
    leadId: leadRefSchema,
    eligibility: eligibilitySchema,
    rendered: z
      .object({ bodyText: str })
      .partial()
      .nullish()
      .transform((value) => value ?? {}),
    error: z
      .object({ code: str, message: str })
      .partial()
      .nullish()
      .catch(null)
      .transform((value) => value ?? null),
  })
  .transform((raw) => ({ ...raw, id: idOf(raw), lead: raw.leadId }));
export type SmsRecipient = z.infer<typeof smsRecipientSchema>;

// ---------------------------------------------------------------- inputs
export type AgentQuestionType = 'short_text' | 'long_text' | 'single_choice' | 'boolean' | 'currency';

export type AgentQuestion = {
  fieldKey: string;
  label: string;
  text: string;
  type: AgentQuestionType;
  required: boolean;
  options: string[];
  mapTo?: string | null;
};

export type CallSchedule = {
  timezone: string;
  callWindow: { start: string; end: string };
  /** Optional: the server applies its own defaults when absent (aiCalling.validation schedule). */
  daysOfWeek?: number[];
  maxAttemptsPerLead?: number;
  retryDelayMinutes?: number;
  maxCallsPerDay?: number;
};

export type StatusRuleInput = {
  id: string;
  when: { all?: Record<string, unknown>[]; any?: Record<string, unknown>[] };
  action: 'mark_qualified' | 'mark_not_interested' | 'schedule_callback';
  requiresReview: boolean;
};

export type CallCampaignInput = {
  name: string;
  statusRules: StatusRuleInput[];
  questionnaire: {
    questions: (Omit<AgentQuestion, 'options'> & {
      order: number;
      options: { value: string; label: string }[];
    })[];
  };
  agentConfig: {
    agentName: string;
    organizationName: string;
    objective: string;
    language: string;
    voice: string;
    /** Spoken first; the agent delivers it in the campaign language. `{company}` is filled by the server. */
    disclosure: string;
  };
  schedule: CallSchedule;
  selection: { mode: 'explicit'; leadIds: string[] };
  /** Test drafts never change a lead, even if they were started (aiCalling.service). */
  isTest?: boolean;
};

export type SmsCampaignInput = {
  name: string;
  channel: 'sms';
  purpose: MessagePurpose;
  templateId: string | null;
  content: { bodyText: string };
  selection: { mode: 'explicit'; leadIds: string[] };
  timezone: string;
};

/** One row of the merged campaigns list. */
export type AgentCampaignRow =
  | { kind: 'call'; campaign: CallCampaign }
  | { kind: 'sms'; campaign: SmsCampaign };
