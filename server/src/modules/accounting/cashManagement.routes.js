import { Router } from 'express';
import cashManagementController from './cashManagement.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  balancesSchema, forecastSchema, manualBalanceSchema,
} from './cashManagement.validation.js';

const router = Router();

router.get('/balances', authenticate, requirePermission('accounting:cash:read'), validate(balancesSchema), (req, res, next) => cashManagementController.getBalances(req, res, next));
router.get('/forecast', authenticate, requirePermission('accounting:cash:read'), validate(forecastSchema), (req, res, next) => cashManagementController.getForecast(req, res, next));
router.post('/balances/manual', authenticate, requirePermission('accounting:cash:manage'), validate(manualBalanceSchema), (req, res, next) => cashManagementController.updateManualBalance(req, res, next));

export default router;
