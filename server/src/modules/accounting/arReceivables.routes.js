import { Router } from 'express';
import arReceivablesController from './arReceivables.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listReceivablesSchema, agingSchema, summarySchema, exportSchema,
  writeOffSchema, recordPaymentSchema, allocatePaymentSchema,
  listPaymentsSchema, paymentIdParamSchema, dunningOverdueSchema,
  generateDunningSchema, dunningTemplateSchema,
} from './arReceivables.validation.js';

const router = Router();

// --- Receivables ---
router.get('/receivables', authenticate, requirePermission('accounting:ar:read'), validate(listReceivablesSchema), (req, res, next) => arReceivablesController.getOpenReceivables(req, res, next));
router.get('/receivables/aging', authenticate, requirePermission('accounting:ar:read'), validate(agingSchema), (req, res, next) => arReceivablesController.getAging(req, res, next));
router.get('/receivables/summary', authenticate, requirePermission('accounting:ar:read'), validate(summarySchema), (req, res, next) => arReceivablesController.getSummary(req, res, next));
router.post('/receivables/export', authenticate, requirePermission('accounting:ar:read'), validate(exportSchema), (req, res, next) => arReceivablesController.exportReceivables(req, res, next));
router.post('/receivables/:id/write-off', authenticate, requirePermission('accounting:ar:manage'), validate(writeOffSchema), (req, res, next) => arReceivablesController.writeOff(req, res, next));

// --- Payments ---
router.get('/payments', authenticate, requirePermission('accounting:ar:manage'), validate(listPaymentsSchema), (req, res, next) => arReceivablesController.listPayments(req, res, next));
router.post('/payments', authenticate, requirePermission('accounting:ar:manage'), validate(recordPaymentSchema), (req, res, next) => arReceivablesController.recordPayment(req, res, next));
router.post('/payments/import', authenticate, requirePermission('accounting:ar:manage'), (req, res, next) => arReceivablesController.importPayments(req, res, next));
router.get('/payments/:id', authenticate, requirePermission('accounting:ar:manage'), validate(paymentIdParamSchema), (req, res, next) => arReceivablesController.getPaymentById(req, res, next));
router.post('/payments/:id/allocate', authenticate, requirePermission('accounting:ar:manage'), validate(allocatePaymentSchema), (req, res, next) => arReceivablesController.allocatePayment(req, res, next));

// --- Dunning ---
router.get('/dunning/overdue', authenticate, requirePermission('accounting:ar:dunning'), validate(dunningOverdueSchema), (req, res, next) => arReceivablesController.getOverdue(req, res, next));
router.post('/dunning/generate', authenticate, requirePermission('accounting:ar:dunning'), validate(generateDunningSchema), (req, res, next) => arReceivablesController.generateDunning(req, res, next));
router.get('/dunning/templates', authenticate, requirePermission('accounting:ar:dunning'), (req, res, next) => arReceivablesController.getDunningTemplates(req, res, next));
router.put('/dunning/templates/:level', authenticate, requirePermission('accounting:ar:dunning'), validate(dunningTemplateSchema), (req, res, next) => arReceivablesController.updateDunningTemplate(req, res, next));

export default router;
