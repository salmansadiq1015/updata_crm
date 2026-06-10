import { Router } from 'express';
import Joi from 'joi';
import reportController from './report.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import {
  createReportSchema,
  updateReportSchema,
  reportIdParamSchema,
  submitReportSchema,
  bulkReportIdsSchema,
} from './report.validation.js';

const listReportsQuerySchema = {
  query: Joi.object({
    status: Joi.string().valid('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'),
    orderId: objectId,
    projectId: objectId,
    technicianId: objectId,
    dateFrom: Joi.date().iso(),
    dateTo: Joi.date().iso(),
    search: Joi.string().trim().max(200).allow(''),
    includeArchived: Joi.boolean(),
  }),
};

// Nested router for routes under /orders/:id
const reportOrderRouter = Router({ mergeParams: true });

reportOrderRouter.get(
  '/reports',
  authenticate,
  requirePermission('mobile:read'),
  (req, res, next) => reportController.listByOrder(req, res, next),
);

reportOrderRouter.post(
  '/reports',
  authenticate,
  requirePermission('mobile:write'),
  validate(createReportSchema),
  (req, res, next) => reportController.create(req, res, next),
);

// Standalone router for routes under /reports
const reportRouter = Router();

reportRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listReportsQuerySchema),
  (req, res, next) => reportController.list(req, res, next),
);

// Bulk operations (before /:reportId to avoid param conflict)
reportRouter.post(
  '/bulk-delete',
  authenticate,
  requirePermission('mobile:write'),
  validate(bulkReportIdsSchema),
  (req, res, next) => reportController.bulkDelete(req, res, next),
);

reportRouter.post(
  '/bulk-archive',
  authenticate,
  requirePermission('mobile:write'),
  validate(bulkReportIdsSchema),
  (req, res, next) => reportController.bulkArchive(req, res, next),
);

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

reportRouter.delete(
  '/:reportId',
  authenticate,
  requirePermission('mobile:write'),
  validate(reportIdParamSchema),
  (req, res, next) => reportController.delete(req, res, next),
);

reportRouter.patch(
  '/:reportId/archive',
  authenticate,
  requirePermission('mobile:write'),
  validate(reportIdParamSchema),
  (req, res, next) => reportController.archive(req, res, next),
);

reportRouter.patch(
  '/:reportId/unarchive',
  authenticate,
  requirePermission('mobile:write'),
  validate(reportIdParamSchema),
  (req, res, next) => reportController.unarchive(req, res, next),
);

reportRouter.post(
  '/:reportId/submit',
  authenticate,
  requirePermission('mobile:write'),
  validate(submitReportSchema),
  (req, res, next) => reportController.submit(req, res, next),
);

export { reportOrderRouter, reportRouter };
