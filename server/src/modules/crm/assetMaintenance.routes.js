import { Router } from 'express';
import assetMaintenanceController from './assetMaintenance.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  assetMaintenanceBulkCreateSchema,
  assetMaintenanceContextSchema,
  assetMaintenanceListSchema,
  assetMaintenanceScheduleSchema,
} from './assetMaintenance.validation.js';

const router = Router();

router.get(
  '/work-items',
  authenticate,
  requirePermission('crm:read'),
  validate(assetMaintenanceListSchema),
  (req, res, next) => assetMaintenanceController.listWorkItems(req, res, next),
);

router.get(
  '/context/:installationId',
  authenticate,
  requirePermission('crm:read'),
  validate(assetMaintenanceContextSchema),
  (req, res, next) => assetMaintenanceController.getContext(req, res, next),
);

router.post(
  '/bulk-maintenance',
  authenticate,
  requirePermission('crm:write'),
  validate(assetMaintenanceBulkCreateSchema),
  (req, res, next) => assetMaintenanceController.bulkCreateMaintenance(req, res, next),
);

router.post(
  '/schedule',
  authenticate,
  requirePermission('crm:read'),
  requirePermission('scheduling:write'),
  validate(assetMaintenanceScheduleSchema),
  (req, res, next) => assetMaintenanceController.schedule(req, res, next),
);

export default router;
