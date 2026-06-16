import { Router } from 'express';
import accountController from './account.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createAccountSchema, updateAccountSchema, listAccountsSchema,
  accountIdParamSchema, balanceQuerySchema, overviewQuerySchema,
} from './account.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:chart:read'), validate(listAccountsSchema), (req, res, next) => accountController.list(req, res, next));
router.get('/tree', authenticate, requirePermission('accounting:chart:read'), (req, res, next) => accountController.getChart(req, res, next));
router.post('/', authenticate, requirePermission('accounting:chart:manage'), validate(createAccountSchema), (req, res, next) => accountController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:chart:read'), validate(accountIdParamSchema), (req, res, next) => accountController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('accounting:chart:manage'), validate(updateAccountSchema), (req, res, next) => accountController.update(req, res, next));
router.get('/:id/balance', authenticate, requirePermission('accounting:chart:read'), validate(balanceQuerySchema), (req, res, next) => accountController.getBalance(req, res, next));
router.get('/:id/overview', authenticate, requirePermission('accounting:chart:read'), validate(overviewQuerySchema), (req, res, next) => accountController.getOverview(req, res, next));
router.get('/:id/overview/export', authenticate, requirePermission('accounting:journal:export'), validate(overviewQuerySchema), (req, res, next) => accountController.exportOverviewCsv(req, res, next));

export default router;
