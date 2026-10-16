// GET /crm/leads/follow-ups (server/src/modules/crm/leadFollowUps.service.js).
import { z } from 'zod';

export const FOLLOW_UP_SCOPES = ['mine', 'all'] as const;
export type FollowUpScope = (typeof FOLLOW_UP_SCOPES)[number];

export const followUpSchema = z.object({
  contactLogId: z.string(),
  leadId: z.string(),
  leadNumber: z
    .string()
    .nullish()
    .transform((value) => value ?? null),
  leadName: z.string(),
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
