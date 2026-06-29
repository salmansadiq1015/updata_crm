import { Router } from 'express';
import taxController from './tax.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import {
  calculateTaxSchema,
  createTaxCodeSchema,
  createTaxExemptionSchema,
  createTaxGroupSchema,
  listTaxCodesSchema,
  listTaxExemptionsSchema,
  listTaxGroupsSchema,
  listTaxTransactionsSchema,
  taxSummarySchema,
  updateTaxCodeSchema,
} from './tax.validation.js';

const router = Router();

router.get('/codes', authenticate, requirePermission('accounting:read'), validate(listTaxCodesSchema), (req, res, next) => taxController.listCodes(req, res, next));
router.post('/codes', authenticate, requirePermission('accounting:admin'), validate(createTaxCodeSchema), (req, res, next) => taxController.createCode(req, res, next));
router.put('/codes/:id', authenticate, requirePermission('accounting:admin'), validate(updateTaxCodeSchema), (req, res, next) => taxController.updateCode(req, res, next));
router.get('/groups', authenticate, requirePermission('accounting:read'), validate(listTaxGroupsSchema), (req, res, next) => taxController.listGroups(req, res, next));
router.post('/groups', authenticate, requirePermission('accounting:admin'), validate(createTaxGroupSchema), (req, res, next) => taxController.createGroup(req, res, next));
router.get('/exemptions', authenticate, requirePermission('accounting:read'), validate(listTaxExemptionsSchema), (req, res, next) => taxController.listExemptions(req, res, next));
router.post('/exemptions', authenticate, requirePermission('accounting:admin'), validate(createTaxExemptionSchema), (req, res, next) => taxController.createExemption(req, res, next));
router.post('/calculate', authenticate, requirePermission('accounting:read'), validate(calculateTaxSchema), (req, res, next) => taxController.calculate(req, res, next));
router.get('/transactions', authenticate, requirePermission('accounting:read'), validate(listTaxTransactionsSchema), (req, res, next) => taxController.listTransactions(req, res, next));
router.get('/summary', authenticate, requirePermission('accounting:read'), validate(taxSummarySchema), (req, res, next) => taxController.summary(req, res, next));
router.get('/vat-report', authenticate, requirePermission('accounting:read'), validate(taxSummarySchema), (req, res, next) => taxController.summary(req, res, next));

export default router;
