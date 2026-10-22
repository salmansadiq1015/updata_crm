// SMS link assistant (server/src/modules/linkAssistant). Unknown fields are ignored.
import { z } from 'zod';

export const linkCampaignSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    status: z.string(),
    channel: z.string().nullish(),
    agentConfig: z.object({ organizationName: z.string().nullish() }).passthrough().nullish(),
    linkConfig: z
      .object({
        reminders: z
          .object({ enabled: z.boolean(), afterHours: z.number(), max: z.number() })
          .partial()
          .nullish(),
        defaultLanguage: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()
  .transform((c) => ({
    id: String(c.id ?? c._id),
    name: c.name,
    status: c.status,
    company: c.agentConfig?.organizationName || '',
    defaultLanguage: c.linkConfig?.defaultLanguage || 'en',
  }));
export type LinkCampaign = z.infer<typeof linkCampaignSchema>;

export const smsTemplateSchema = z.object({
  language: z.string(),
  template: z.string(),
  stats: z.object({ segments: z.number(), encoding: z.string(), characters: z.number() }).passthrough(),
});
export type SmsTemplate = z.infer<typeof smsTemplateSchema>;

export const linkSettingsSchema = z
  .object({ paused: z.boolean(), baseUrl: z.string().nullish(), aiConfigured: z.boolean().nullish() })
  .passthrough();

export const dueReminderSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  leadId: z.string(),
  sessionId: z.string(),
  status: z.string(),
  remindersSent: z.number(),
});
export type DueReminder = z.infer<typeof dueReminderSchema>;

const funnelSchema = z.record(z.string(), z.string().nullish()).nullish();

export const contactStatusSchema = z.object({
  leadId: z.string(),
  smsBlocked: z.boolean(),
  callsBlocked: z.boolean(),
  optedOut: z.boolean(),
  lastOptOut: z.object({ source: z.string(), at: z.string() }).nullish(),
});
export type ContactStatus = z.infer<typeof contactStatusSchema>;

export const linkSessionSchema = z
  .object({
    id: z.string(),
    campaignId: z.string(),
    status: z.string(),
    outcome: z.string().nullish(),
    language: z.string().nullish(),
    funnel: funnelSchema,
    expiresAt: z.string().nullish(),
    lastActivityAt: z.string().nullish(),
  })
  .passthrough();
export type LinkSession = z.infer<typeof linkSessionSchema>;

export const linkSessionDetailSchema = linkSessionSchema.extend({
  campaignName: z.string().nullish(),
  answers: z.array(
    z.object({
      fieldKey: z.string(),
      label: z.string(),
      value: z.unknown().nullish(),
      unknown: z.boolean(),
      confirmed: z.boolean(),
    }),
  ),
  reviewRequired: z.boolean().nullish(),
  qualification: z.string().nullish(),
});
export type LinkSessionDetail = z.infer<typeof linkSessionDetailSchema>;
