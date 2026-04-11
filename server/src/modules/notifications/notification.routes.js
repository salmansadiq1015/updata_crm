import { Router } from 'express';
import notificationController from './notification.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createNotificationSchema,
  notificationIdParamSchema,
  searchNotificationsSchema,
} from './notification.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('notifications:read'), validate(searchNotificationsSchema), (req, res, next) => notificationController.search(req, res, next));
router.post('/', authenticate, requirePermission('notifications:dispatch'), validate(createNotificationSchema), (req, res, next) => notificationController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('notifications:read'), validate(notificationIdParamSchema), (req, res, next) => notificationController.getById(req, res, next));

export default router;
