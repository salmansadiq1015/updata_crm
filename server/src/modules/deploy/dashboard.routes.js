import { Router } from 'express';
import dashboardController from './dashboard.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  dashboardSummarySchema,
  dashboardUtilizationSchema,
  dashboardAlertsSchema,
} from './dashboard.validation.js';

const router = Router();

router.get(
  '/summary',
  authenticate,
  requirePermission('scheduling:read'),
  validate(dashboardSummarySchema),
  (req, res, next) => dashboardController.summary(req, res, next),
);

router.get(
  '/utilization',
  authenticate,
  requirePermission('scheduling:read'),
  validate(dashboardUtilizationSchema),
  (req, res, next) => dashboardController.utilization(req, res, next),
);

router.get(
  '/alerts',
  authenticate,
  requirePermission('scheduling:read'),
  validate(dashboardAlertsSchema),
  (req, res, next) => dashboardController.alerts(req, res, next),
);

export default router;
