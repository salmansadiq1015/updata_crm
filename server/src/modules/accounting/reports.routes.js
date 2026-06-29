import { Router } from 'express';
import accountingReportsController from './reports.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  balanceSheetSchema,
  cashFlowSchema,
  generalLedgerSchema,
  profitLossSchema,
  trialBalanceSchema,
} from './reports.validation.js';

const router = Router();

router.get('/profit-loss', authenticate, requirePermission('accounting:journal:read'), validate(profitLossSchema), (req, res, next) => accountingReportsController.getProfitLoss(req, res, next));
router.get('/profit-loss/export', authenticate, requirePermission('accounting:journal:export'), validate(profitLossSchema), (req, res, next) => accountingReportsController.exportProfitLossCsv(req, res, next));
router.get('/balance-sheet', authenticate, requirePermission('accounting:journal:read'), validate(balanceSheetSchema), (req, res, next) => accountingReportsController.getBalanceSheet(req, res, next));
router.get('/trial-balance', authenticate, requirePermission('accounting:journal:read'), validate(trialBalanceSchema), (req, res, next) => accountingReportsController.getTrialBalance(req, res, next));
router.get('/cash-flow', authenticate, requirePermission('accounting:journal:read'), validate(cashFlowSchema), (req, res, next) => accountingReportsController.getCashFlow(req, res, next));
router.get('/general-ledger', authenticate, requirePermission('accounting:journal:read'), validate(generalLedgerSchema), (req, res, next) => accountingReportsController.getGeneralLedger(req, res, next));

export default router;
