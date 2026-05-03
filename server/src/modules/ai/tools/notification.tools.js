import { z } from 'zod';
import { createTool } from './tool.runner.js';

// notificationService.create(data, userId, meta)
// Required fields: type (string), category (enum), channels (array, min 1), recipientIds (array)
// payload: { title, body } is the conventional way to pass human-readable content
// The service fans out per-recipient per-channel internally via queueManager.
// We use IN_APP as the default channel so the tool works without external adapters.

// Map agent-facing 'type' enum to notification type strings and categories:
const TYPE_MAP = {
  INFO: { type: 'AI_AGENT_INFO', category: 'SYSTEM' },
  WARNING: { type: 'AI_AGENT_WARNING', category: 'SYSTEM' },
  SUCCESS: { type: 'AI_AGENT_SUCCESS', category: 'SYSTEM' },
  ACTION_REQUIRED: { type: 'AI_AGENT_ACTION_REQUIRED', category: 'SYSTEM' },
};

export const sendNotificationTool = createTool({
  name: 'send_notification',
  description: 'Sends an in-app notification to one or more ERP users.',
  schema: z.object({
    recipientIds: z.array(z.string()).min(1).max(50).describe('Array of MongoDB user ObjectIds'),
    title: z.string().max(255).describe('Notification title'),
    body: z.string().max(1000).describe('Notification body text'),
    type: z.enum(['INFO', 'WARNING', 'SUCCESS', 'ACTION_REQUIRED']).default('INFO'),
  }),
  requiredPermission: 'notifications:send',
  execute: async ({ recipientIds, title, body, type }, { userId }) => {
    const { default: notificationService } = await import('../../notifications/notification.service.js');

    const { type: notifType, category } = TYPE_MAP[type];

    const results = await Promise.allSettled(
      recipientIds.map((recipientId) =>
        notificationService.create(
          {
            type: notifType,
            category,
            channels: ['IN_APP'],
            recipientIds: [recipientId],
            payload: { title, body },
          },
          userId,
          { source: 'ai-agent' },
        ),
      ),
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    return { sent, failed };
  },
});
