import { Router } from 'express';
import scheduledNotificationController from './scheduledNotification.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createScheduledSchema,
  updateScheduledSchema,
  scheduledIdParamSchema,
  listScheduledSchema,
} from './scheduledNotification.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('notifications:scheduled:manage'), validate(listScheduledSchema), (req, res, next) => scheduledNotificationController.list(req, res, next));
router.post('/', authenticate, requirePermission('notifications:scheduled:manage'), validate(createScheduledSchema), (req, res, next) => scheduledNotificationController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('notifications:scheduled:manage'), validate(scheduledIdParamSchema), (req, res, next) => scheduledNotificationController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('notifications:scheduled:manage'), validate(updateScheduledSchema), (req, res, next) => scheduledNotificationController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('notifications:scheduled:manage'), validate(scheduledIdParamSchema), (req, res, next) => scheduledNotificationController.remove(req, res, next));
router.post('/:id/cancel', authenticate, requirePermission('notifications:scheduled:manage'), validate(scheduledIdParamSchema), (req, res, next) => scheduledNotificationController.cancel(req, res, next));
router.post('/:id/pause', authenticate, requirePermission('notifications:scheduled:manage'), validate(scheduledIdParamSchema), (req, res, next) => scheduledNotificationController.pause(req, res, next));
router.post('/:id/resume', authenticate, requirePermission('notifications:scheduled:manage'), validate(scheduledIdParamSchema), (req, res, next) => scheduledNotificationController.resume(req, res, next));

export default router;
