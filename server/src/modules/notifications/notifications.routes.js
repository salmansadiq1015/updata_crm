import { Router } from 'express';
import notificationRoutes from './notification.routes.js';
import notificationFeedRoutes from './notificationFeed.routes.js';
import notificationPreferenceRoutes from './notificationPreference.routes.js';
import notificationTemplateRoutes from './notificationTemplate.routes.js';
import scheduledNotificationRoutes from './scheduledNotification.routes.js';
import notificationMetricsRoutes from './notificationMetrics.routes.js';
import notificationWebhookRoutes from './notificationWebhook.routes.js';

const router = Router();

// Core notification dispatch & history
router.use('/', notificationRoutes);

// Export individual routers for mounting at different paths
export {
  notificationFeedRoutes,
  notificationPreferenceRoutes,
  notificationTemplateRoutes,
  scheduledNotificationRoutes,
  notificationMetricsRoutes,
  notificationWebhookRoutes,
};

export default router;
