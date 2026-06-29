import { Router } from 'express';
import accountingDashboardController from './dashboard.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { dashboardSnapshotSchema } from './dashboard.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:journal:read'), validate(dashboardSnapshotSchema), (req, res, next) => accountingDashboardController.getSnapshot(req, res, next));

export default router;
