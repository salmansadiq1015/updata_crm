import { Router } from 'express';
import reportController from './report.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createReportSchema,
  updateReportSchema,
  reportIdParamSchema,
  submitReportSchema,
} from './report.validation.js';

// Nested router for routes under /orders/:id
const reportOrderRouter = Router({ mergeParams: true });

reportOrderRouter.post(
  '/reports',
  authenticate,
  requirePermission('mobile:write'),
  validate(createReportSchema),
  (req, res, next) => reportController.create(req, res, next),
);

// Standalone router for routes under /reports/:reportId
const reportRouter = Router();

reportRouter.get(
  '/:reportId',
  authenticate,
  requirePermission('mobile:read'),
  validate(reportIdParamSchema),
  (req, res, next) => reportController.getById(req, res, next),
);

reportRouter.put(
  '/:reportId',
  authenticate,
  requirePermission('mobile:write'),
  validate(updateReportSchema),
  (req, res, next) => reportController.update(req, res, next),
);

reportRouter.post(
  '/:reportId/submit',
  authenticate,
  requirePermission('mobile:write'),
  validate(submitReportSchema),
  (req, res, next) => reportController.submit(req, res, next),
);

export { reportOrderRouter, reportRouter };
