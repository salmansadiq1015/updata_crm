import { Router } from 'express';
import timeTrackingController from './timeTracking.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import {
  analyticsQuerySchema,
  balanceQuerySchema,
  balanceUpsertSchema,
  leaveDecisionSchema,
  leaveRejectSchema,
  leaveRequestCreateSchema,
  leaveRequestIdSchema,
  leaveRequestListSchema,
  orderTimeEntryListSchema,
  overrideTimeEntrySchema,
  timeEntryCreateSchema,
  timeEntryIdSchema,
  timeEntryUpdateSchema,
  timeTrackingQuerySchema,
} from './timeTracking.validation.js';

const router = Router();

router.use(authenticate);

router.get(
  '/overview',
  requirePermission('time-tracking:read'),
  validate(timeTrackingQuerySchema),
  (req, res, next) => timeTrackingController.overview(req, res, next),
);

router.get(
  '/time-entries',
  requirePermission('time-tracking:read'),
  validate(timeTrackingQuerySchema),
  (req, res, next) => timeTrackingController.listTimeEntries(req, res, next),
);

router.get(
  '/time-entries/export',
  requirePermission('time-tracking:read'),
  validate(timeTrackingQuerySchema),
  (req, res, next) => timeTrackingController.exportTimeEntries(req, res, next),
);

router.get(
  '/orders/:orderId/time-entries',
  requirePermission('time-tracking:read'),
  validate(orderTimeEntryListSchema),
  (req, res, next) => timeTrackingController.listOrderTimeEntries(req, res, next),
);

router.post(
  '/orders/:orderId/time-entries',
  requirePermission('time-tracking:write'),
  validate(timeEntryCreateSchema),
  (req, res, next) => timeTrackingController.createTimeEntry(req, res, next),
);

router.put(
  '/time-entries/:entryId',
  requirePermission('time-tracking:write'),
  validate(timeEntryUpdateSchema),
  (req, res, next) => timeTrackingController.updateTimeEntry(req, res, next),
);

router.delete(
  '/time-entries/:entryId',
  requirePermission('time-tracking:write'),
  validate(timeEntryIdSchema),
  (req, res, next) => timeTrackingController.deleteTimeEntry(req, res, next),
);

router.post(
  '/time-entries/:entryId/release',
  requirePermission('time-tracking:write'),
  validate(timeEntryIdSchema),
  (req, res, next) => timeTrackingController.releaseTimeEntry(req, res, next),
);

router.post(
  '/time-entries/:entryId/override',
  requirePermission('time-tracking:admin'),
  validate(overrideTimeEntrySchema),
  (req, res, next) => timeTrackingController.overrideTimeEntry(req, res, next),
);

router.get(
  '/leave-requests',
  requirePermission('time-tracking:read'),
  validate(leaveRequestListSchema),
  (req, res, next) => timeTrackingController.listLeaveRequests(req, res, next),
);

router.post(
  '/leave-requests',
  requirePermission('time-tracking:write'),
  validate(leaveRequestCreateSchema),
  (req, res, next) => timeTrackingController.createLeaveRequest(req, res, next),
);

router.post(
  '/leave-requests/:id/approve',
  requirePermission('time-tracking:write'),
  validate(leaveDecisionSchema),
  (req, res, next) => timeTrackingController.approveLeaveRequest(req, res, next),
);

router.post(
  '/leave-requests/:id/reject',
  requirePermission('time-tracking:write'),
  validate(leaveRejectSchema),
  (req, res, next) => timeTrackingController.rejectLeaveRequest(req, res, next),
);

router.post(
  '/leave-requests/:id/cancel',
  requirePermission('time-tracking:write'),
  validate(leaveRequestIdSchema),
  (req, res, next) => timeTrackingController.cancelLeaveRequest(req, res, next),
);

router.get(
  '/balances',
  requirePermission('time-tracking:read'),
  validate(balanceQuerySchema),
  (req, res, next) => timeTrackingController.balances(req, res, next),
);

router.put(
  '/balances/:employeeId/:year',
  requirePermission('time-tracking:admin'),
  validate(balanceUpsertSchema),
  (req, res, next) => timeTrackingController.upsertBalance(req, res, next),
);

router.get(
  '/calendar',
  requirePermission('time-tracking:read'),
  validate(timeTrackingQuerySchema),
  (req, res, next) => timeTrackingController.calendar(req, res, next),
);

router.get(
  '/analytics',
  requirePermission('time-tracking:read'),
  validate(analyticsQuerySchema),
  (req, res, next) => timeTrackingController.analytics(req, res, next),
);

router.get(
  '/ai/context',
  requirePermission('time-tracking:read'),
  validate(analyticsQuerySchema),
  (req, res, next) => timeTrackingController.aiContext(req, res, next),
);

export default router;
