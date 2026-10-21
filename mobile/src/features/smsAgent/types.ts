// SIM SMS agent contracts (server/src/modules/simSms). Parsing is tolerant of
// extra fields; ids are normalised to `id`.
import { z } from 'zod';

const idOf = (value: unknown) =>
  typeof value === 'object' && value !== null
    ? String((value as { _id?: unknown })._id ?? '')
    : String(value ?? '');

export const SIM_CAMPAIGN_STATUSES = ['draft', 'running', 'paused', 'completed', 'cancelled'] as const;
export type SimCampaignStatus = (typeof SIM_CAMPAIGN_STATUSES)[number];

export const simSummarySchema = z
  .object({
    total: z.number().default(0),
    eligible: z.number().default(0),
    ineligible: z.number().default(0),
    active: z.number().default(0),
    awaitingReply: z.number().default(0),
    completed: z.number().default(0),
    stopped: z.number().default(0),
    expired: z.number().default(0),
    needsAttention: z.number().default(0),
    failed: z.number().default(0),
    qualified: z.number().default(0),
    review: z.number().default(0),
    messagesSent: z.number().default(0),
    repliesReceived: z.number().default(0),
    sendFailures: z.number().default(0),
    lastSendError: z
      .object({ code: z.string().nullable(), at: z.string().nullable(), nextRetryAt: z.string().nullable() })
      .partial()
      .nullable(),
  })
  .partial()
  .transform((s) => ({
    total: 0,
    eligible: 0,
    ineligible: 0,
    active: 0,
    awaitingReply: 0,
    completed: 0,
    stopped: 0,
    expired: 0,
    needsAttention: 0,
    failed: 0,
    qualified: 0,
    review: 0,
    messagesSent: 0,
    repliesReceived: 0,
    sendFailures: 0,
    ...s,
    lastSendError: s.lastSendError?.code
      ? {
          code: s.lastSendError.code,
          at: s.lastSendError.at ?? null,
          nextRetryAt: s.lastSendError.nextRetryAt ?? null,
        }
      : null,
  }));
export type SimSummary = z.infer<typeof simSummarySchema>;

export const simCampaignSchema = z
  .object({
    _id: z.string(),
    name: z.string(),
    status: z.string(),
    isTest: z.boolean().optional().default(false),
    summary: simSummarySchema.optional(),
    settings: z
      .object({ timezone: z.string().optional(), minSecondsBetweenSends: z.number().optional() })
      .passthrough()
      .optional(),
    createdAt: z.string().optional(),
  })
  .passthrough()
  .transform((c) => ({ ...c, id: c._id, summary: simSummarySchema.parse(c.summary ?? {}) }));
export type SimCampaign = z.infer<typeof simCampaignSchema>;

export const simConversationSchema = z
  .object({
    _id: z.string(),
    leadId: z.unknown(),
    state: z.string(),
    destinationMasked: z.string().nullable().optional(),
    eligibility: z.object({ eligible: z.boolean(), reasons: z.array(z.string()) }).optional(),
    disposition: z.string().nullable().optional(),
    qualification: z.string().nullable().optional(),
    lastOutboundAt: z.string().nullable().optional(),
    lastInboundAt: z.string().nullable().optional(),
  })
  .passthrough()
  .transform((c) => {
    const lead =
      typeof c.leadId === 'object' && c.leadId !== null
        ? (c.leadId as { _id?: string; name?: string; leadNumber?: string })
        : null;
    return {
      ...c,
      id: c._id,
      lead: { id: idOf(c.leadId), name: lead?.name ?? null, number: lead?.leadNumber ?? null },
    };
  });
export type SimConversation = z.infer<typeof simConversationSchema>;

export const simMessageSchema = z
  .object({
    _id: z.string(),
    direction: z.enum(['outbound', 'inbound']),
    kind: z.string(),
    body: z.string(),
    status: z.string(),
    sentAt: z.string().nullable().optional(),
    deliveredAt: z.string().nullable().optional(),
    receivedAt: z.string().nullable().optional(),
    failureCode: z.string().nullable().optional(),
    createdAt: z.string(),
  })
  .passthrough()
  .transform((m) => ({ ...m, id: m._id }));
export type SimMessage = z.infer<typeof simMessageSchema>;

export const simConversationDetailSchema = z.object({
  conversation: simConversationSchema,
  messages: z.array(simMessageSchema),
  answers: z.array(
    z
      .object({
        fieldKey: z.string(),
        label: z.string(),
        validation: z.string(),
        normalizedValue: z.unknown().optional(),
        rawAnswer: z.string().optional(),
      })
      .passthrough(),
  ),
});
export type SimConversationDetail = z.infer<typeof simConversationDetailSchema>;

export const leasedMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  campaignId: z.string(),
  leadId: z.string(),
  leadName: z.string().nullable().optional(),
  to: z.string(),
  body: z.string(),
  segments: z.number().optional(),
  subscriptionId: z.number().nullable().optional(),
  kind: z.string(),
});
export type LeasedMessage = z.infer<typeof leasedMessageSchema>;
export const leaseResultSchema = z.object({
  message: leasedMessageSchema.nullable(),
  retryAfterMs: z.number(),
});
export type LeaseResult = z.infer<typeof leaseResultSchema>;

export type SimCampaignInput = {
  name: string;
  leadIds: string[];
  isTest?: boolean;
  questionnaire: { questions: Record<string, unknown>[] };
  statusRules: Record<string, unknown>[];
  agent: { agentName: string; organizationName: string; intro?: string; closing?: string; language?: string };
  settings: {
    timezone: string;
    sendWindow: { start: string; end: string };
    daysOfWeek?: number[];
    maxMessagesPerDay?: number;
    minSecondsBetweenSends?: number;
    replyTimeoutHours?: number;
    maxReminders?: number;
  };
  subscriptionId?: number | null;
};
