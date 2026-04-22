import { Router } from 'express';
import maintenanceController from './maintenance.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  updateMaintenanceSchema, maintenanceIdParamSchema,
  maintenanceDashboardSchema, maintenanceListSchema,
  maintenanceExportSchema,
} from './maintenance.validation.js';

const router = Router();

// Named routes BEFORE /:id
router.get('/dashboard', authenticate, requirePermission('crm:read'), validate(maintenanceDashboardSchema), (req, res, next) => maintenanceController.dashboard(req, res, next));
router.get('/due', authenticate, requirePermission('crm:read'), validate(maintenanceListSchema), (req, res, next) => maintenanceController.listDue(req, res, next));
router.get('/overdue', authenticate, requirePermission('crm:read'), validate(maintenanceListSchema), (req, res, next) => maintenanceController.listOverdue(req, res, next));
router.get('/export', authenticate, requirePermission('crm:read'), validate(maintenanceExportSchema), (req, res, next) => maintenanceController.exportCsv(req, res, next));

// By ID
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateMaintenanceSchema), (req, res, next) => maintenanceController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('crm:delete'), validate(maintenanceIdParamSchema), (req, res, next) => maintenanceController.delete(req, res, next));

export default router;
