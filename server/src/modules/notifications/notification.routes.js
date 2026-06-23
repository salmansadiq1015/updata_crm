import { Router } from 'express';
import notificationController from './notification.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  anonymizeNotificationHistorySchema,
  createNotificationSchema,
  flagStaleDeliveriesSchema,
  notificationIdParamSchema,
  searchNotificationHistorySchema,
  searchNotificationsSchema,
} from './notification.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('notifications:read'), validate(searchNotificationsSchema), (req, res, next) => notificationController.search(req, res, next));
router.post('/', authenticate, requirePermission('notifications:dispatch'), validate(createNotificationSchema), (req, res, next) => notificationController.create(req, res, next));
router.get('/history/export', authenticate, requirePermission('notifications:read'), validate(searchNotificationHistorySchema), (req, res, next) => notificationController.exportHistory(req, res, next));
router.get('/history', authenticate, requirePermission('notifications:read'), validate(searchNotificationHistorySchema), (req, res, next) => notificationController.history(req, res, next));
router.post('/history/anonymize', authenticate, requirePermission('notifications:write'), validate(anonymizeNotificationHistorySchema), (req, res, next) => notificationController.anonymizeHistory(req, res, next));
router.post('/deliveries/flag-stale', authenticate, requirePermission('notifications:write'), validate(flagStaleDeliveriesSchema), (req, res, next) => notificationController.flagStaleDeliveries(req, res, next));
router.get('/:id', authenticate, requirePermission('notifications:read'), validate(notificationIdParamSchema), (req, res, next) => notificationController.getById(req, res, next));

export default router;
