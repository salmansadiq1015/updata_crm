import { Router } from 'express';
import accountingReportsController from './reports.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { profitLossSchema } from './reports.validation.js';

const router = Router();

router.get('/profit-loss', authenticate, requirePermission('accounting:journal:read'), validate(profitLossSchema), (req, res, next) => accountingReportsController.getProfitLoss(req, res, next));
router.get('/profit-loss/export', authenticate, requirePermission('accounting:journal:export'), validate(profitLossSchema), (req, res, next) => accountingReportsController.exportProfitLossCsv(req, res, next));

export default router;
