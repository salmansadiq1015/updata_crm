import { Router } from 'express';
import appointmentReminderController from './appointmentReminder.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listSchema,
  createSchema,
  getByIdSchema,
  updateStatusSchema,
} from './appointmentReminder.validation.js';
import reminderSettingsController from './reminderSettings.controller.js';
import { updateReminderSettingsSchema } from './reminderSettings.validation.js';

const router = Router();

router.get('/settings', authenticate, requirePermission('quotations:admin'), (req, res, next) => reminderSettingsController.get(req, res, next));
router.put('/settings', authenticate, requirePermission('quotations:admin'), validate(updateReminderSettingsSchema), (req, res, next) => reminderSettingsController.update(req, res, next));
router.get('/appointments', authenticate, requirePermission('quotations:read'), validate(listSchema), (req, res, next) => appointmentReminderController.list(req, res, next));
router.post('/appointments', authenticate, requirePermission('quotations:write'), validate(createSchema), (req, res, next) => appointmentReminderController.create(req, res, next));
router.get('/appointments/:id', authenticate, requirePermission('quotations:read'), validate(getByIdSchema), (req, res, next) => appointmentReminderController.getById(req, res, next));
router.patch('/appointments/:id/status', authenticate, requirePermission('quotations:write'), validate(updateStatusSchema), (req, res, next) => appointmentReminderController.updateStatus(req, res, next));

export default router;
