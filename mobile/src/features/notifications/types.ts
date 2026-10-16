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
