import { Router } from 'express';
import appointmentController from './appointment.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  getAppointmentSchema,
  updateAppointmentSchema,
  confirmAppointmentSchema,
  cancelAppointmentSchema,
  rescheduleAppointmentSchema,
  updateAppointmentStatusSchema,
} from './appointment.validation.js';

const router = Router({ mergeParams: true });

router.get('/', authenticate, requirePermission('scheduling:read'), validate(getAppointmentSchema), (req, res, next) => appointmentController.getDetails(req, res, next));
router.patch('/', authenticate, requirePermission('scheduling:write'), validate(updateAppointmentSchema), (req, res, next) => appointmentController.updateDetails(req, res, next));
router.post('/confirm', authenticate, requirePermission('scheduling:write'), validate(confirmAppointmentSchema), (req, res, next) => appointmentController.confirm(req, res, next));
router.post('/cancel', authenticate, requirePermission('scheduling:write'), validate(cancelAppointmentSchema), (req, res, next) => appointmentController.cancel(req, res, next));
router.post('/reschedule', authenticate, requirePermission('scheduling:write'), validate(rescheduleAppointmentSchema), (req, res, next) => appointmentController.reschedule(req, res, next));
router.patch('/status', authenticate, requirePermission('scheduling:write'), validate(updateAppointmentStatusSchema), (req, res, next) => appointmentController.updateStatus(req, res, next));

export default router;
