// In-app notification feed item (server/src/modules/notifications/inAppNotification.model.js).
// Title and body are server-authored text and are displayed as-is, not translated.
import { z } from 'zod';

export const NOTIFICATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;

export const notificationSchema = z
  .object({
    _id: z.string().optional(),
    id: z.string().optional(),
    category: z.string().nullish(),
    priority: z.enum(NOTIFICATION_PRIORITIES).catch('NORMAL'),
    title: z.string(),
    body: z.string().nullish(),
    deepLink: z.string().nullish(),
    relatedEntityType: z.string().nullish(),
    relatedEntityId: z
      .union([z.string(), z.object({ _id: z.string().optional(), id: z.string().optional() })])
      .nullish(),
    isRead: z.boolean().catch(false),
    sentAt: z.string().nullish(),
    createdAt: z.string().nullish(),
  })
  .transform((raw, ctx) => {
    const id = raw.id ?? raw._id;
    if (!id) {
      ctx.addIssue({ code: 'custom', message: 'Notification has no id' });
      return z.NEVER;
    }
    return {
      id,
      category: raw.category ?? 'SYSTEM',
      priority: raw.priority,
      title: raw.title,
      body: raw.body ?? '',
      deepLink: raw.deepLink ?? null,
      relatedEntityType: raw.relatedEntityType ?? null,
      relatedEntityId:
        typeof raw.relatedEntityId === 'string'
          ? raw.relatedEntityId
          : (raw.relatedEntityId?.id ?? raw.relatedEntityId?._id ?? null),
      isRead: raw.isRead,
      sentAt: raw.sentAt ?? raw.createdAt ?? null,
    };
  });

export type AppNotification = z.infer<typeof notificationSchema>;

export const notificationFeedSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative().catch(0),
});

export const unreadCountSchema = z.object({ unreadCount: z.number().int().nonnegative().catch(0) });

export type NotificationTarget =
  | { screen: 'LeadDetail'; params: { leadId: string } }
  | { screen: 'AiAgentCampaignDetail'; params: { kind: 'call' | 'sms'; campaignId: string } };

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/** Only routes backed by an implemented mobile destination are actionable. */
export function notificationTarget(notification: AppNotification): NotificationTarget | null {
  const id = notification.relatedEntityId;
  if (id && OBJECT_ID.test(id)) {
    if (notification.relatedEntityType === 'Lead') return { screen: 'LeadDetail', params: { leadId: id } };
    if (['CallCampaign', 'AiCallCampaign'].includes(notification.relatedEntityType ?? '')) {
      return { screen: 'AiAgentCampaignDetail', params: { kind: 'call', campaignId: id } };
    }
    if (['MessageCampaign', 'SmsCampaign'].includes(notification.relatedEntityType ?? '')) {
      return { screen: 'AiAgentCampaignDetail', params: { kind: 'sms', campaignId: id } };
    }
  }

  const link = notification.deepLink ?? '';
  const patterns: { pattern: RegExp; target: (id: string) => NotificationTarget }[] = [
    {
      pattern: /(?:^updata:\/\/|^\/)(?:crm\/)?leads\/([0-9a-f]{24})(?:$|[/?#])/i,
      target: (leadId) => ({ screen: 'LeadDetail', params: { leadId } }),
    },
    {
      pattern: /(?:^updata:\/\/|^\/)ai-calling\/campaigns\/([0-9a-f]{24})(?:$|[/?#])/i,
      target: (campaignId) => ({ screen: 'AiAgentCampaignDetail', params: { kind: 'call', campaignId } }),
    },
    {
      pattern: /(?:^updata:\/\/|^\/)messaging\/campaigns\/([0-9a-f]{24})(?:$|[/?#])/i,
      target: (campaignId) => ({ screen: 'AiAgentCampaignDetail', params: { kind: 'sms', campaignId } }),
    },
  ];
  for (const { pattern, target } of patterns) {
    const match = pattern.exec(link);
    const matchedId = match?.[1];
    if (matchedId) return target(matchedId);
  }
  return null;
}
