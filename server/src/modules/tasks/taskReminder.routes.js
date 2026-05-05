import { Router } from 'express';
import taskReminderController from './taskReminder.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listRemindersSchema, createReminderSchema, deleteReminderSchema,
} from './taskReminder.validation.js';

const router = Router({ mergeParams: true });

router.get('/', authenticate, requirePermission('tasks:read'), validate(listRemindersSchema), (req, res, next) => taskReminderController.list(req, res, next));
router.post('/', authenticate, requirePermission('tasks:write'), validate(createReminderSchema), (req, res, next) => taskReminderController.create(req, res, next));
router.delete('/:reminderId', authenticate, requirePermission('tasks:delete'), validate(deleteReminderSchema), (req, res, next) => taskReminderController.remove(req, res, next));

export default router;
