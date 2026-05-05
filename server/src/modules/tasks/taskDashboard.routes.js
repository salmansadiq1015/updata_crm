import { Router } from 'express';
import taskDashboardController from './taskDashboard.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  dashboardSchema,
  statsSchema,
  projectTasksSchema,
  projectSummarySchema,
  orderTasksSchema,
  crossProjectReportSchema,
  syncGetSchema,
  syncPushSchema,
  userDefaultsSchema,
} from './taskDashboard.validation.js';

const router = Router();

router.get(
  '/dashboard',
  authenticate,
  requirePermission('tasks:read'),
  validate(dashboardSchema),
  (req, res, next) => taskDashboardController.getDashboard(req, res, next),
);

router.get(
  '/dashboard/stats',
  authenticate,
  requirePermission('tasks:read'),
  validate(statsSchema),
  (req, res, next) => taskDashboardController.getStats(req, res, next),
);

router.get(
  '/sync',
  authenticate,
  requirePermission('tasks:read'),
  validate(syncGetSchema),
  (req, res, next) => taskDashboardController.getSyncChanges(req, res, next),
);

router.post(
  '/sync/push',
  authenticate,
  requirePermission('tasks:write'),
  validate(syncPushSchema),
  (req, res, next) => taskDashboardController.pushSyncChanges(req, res, next),
);

router.get(
  '/users/me/reminder-defaults',
  authenticate,
  requirePermission('tasks:read'),
  validate(dashboardSchema),
  (req, res, next) => taskDashboardController.getUserReminderDefaults(req, res, next),
);

router.put(
  '/users/me/reminder-defaults',
  authenticate,
  requirePermission('tasks:write'),
  validate(userDefaultsSchema),
  (req, res, next) => taskDashboardController.setUserReminderDefaults(req, res, next),
);

// Project task integration routes (mounted under /projects/:projectId/tasks externally)
export const projectTaskRouter = Router();

projectTaskRouter.get(
  '/',
  authenticate,
  requirePermission('tasks:read'),
  validate(projectTasksSchema),
  (req, res, next) => taskDashboardController.getProjectTasks(req, res, next),
);

projectTaskRouter.get(
  '/summary',
  authenticate,
  requirePermission('tasks:read'),
  validate(projectSummarySchema),
  (req, res, next) => taskDashboardController.getProjectTaskSummary(req, res, next),
);

// Order task integration routes (mounted under /orders/:orderId/tasks externally)
export const orderTaskRouter = Router();

orderTaskRouter.get(
  '/',
  authenticate,
  requirePermission('tasks:read'),
  validate(orderTasksSchema),
  (req, res, next) => taskDashboardController.getOrderTasks(req, res, next),
);

// Cross-project report routes (mounted under /projects/tasks externally)
export const crossProjectRouter = Router();

crossProjectRouter.get(
  '/report',
  authenticate,
  requirePermission('tasks:read'),
  validate(crossProjectReportSchema),
  (req, res, next) => taskDashboardController.getCrossProjectReport(req, res, next),
);

export default router;
