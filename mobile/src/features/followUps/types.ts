// GET /crm/leads/follow-ups (server/src/modules/crm/leadFollowUps.service.js).
import { z } from 'zod';

export const FOLLOW_UP_SCOPES = ['mine', 'all'] as const;
export type FollowUpScope = (typeof FOLLOW_UP_SCOPES)[number];

/** AI follow-up calling state (server LeadFollowUp.automation); absent on ordinary tasks and older servers. */
export const followUpAutomationSchema = z.object({
  mode: z.enum(['ai', 'human']).catch('human'),
  state: z.string().nullish().transform((value) => value ?? null),
  reason: z.string().nullish().transform((value) => value ?? null),
  agentId: z.string().nullish().transform((value) => value ?? null),
  agentName: z.string().nullish().transform((value) => value ?? null),
  attempts: z.number().nullish().transform((value) => value ?? 0),
  lastError: z.string().nullish().transform((value) => value ?? null),
  callState: z.string().nullish().transform((value) => value ?? null),
  summary: z.string().nullish().transform((value) => value ?? null),
});
export type FollowUpAutomation = z.infer<typeof followUpAutomationSchema>;
/** States in which an AI follow-up call is queued or on the line ("Call now" is not offered). */
export const AI_ACTIVE_STATES = ['queued', 'calling', 'retry_scheduled'] as const;

export const followUpSchema = z.object({
  contactLogId: z.string(),
  followUpId: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  automation: followUpAutomationSchema.nullish().transform((value) => value ?? null),
  leadId: z.string(),
  leadNumber: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  leadName: z.string(),
  pipelineStage: z.string().nullish(),
  latestCall: z
    .object({
      callStatus: z.string().nullish(),
      qualificationStatus: z.string().nullish(),
      outcome: z.string().nullish(),
      missingFields: z.array(z.string()).default([]),
      recommendedAction: z.string().nullish(),
    })
    .nullish(),
  followUpAt: z.string(),
  followUpTimezone: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  channel: z.string(),
  subject: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  note: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
});

export type FollowUp = z.infer<typeof followUpSchema>;
