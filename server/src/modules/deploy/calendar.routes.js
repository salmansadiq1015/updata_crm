import { Router } from 'express';
import calendarController from './calendar.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { calendarQuerySchema } from './calendar.validation.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('scheduling:read'),
  validate(calendarQuerySchema),
  (req, res, next) => calendarController.getCalendarData(req, res, next),
);

export default router;
