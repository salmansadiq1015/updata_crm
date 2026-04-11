import { Router } from 'express';
import invoiceController from './invoice.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createInvoiceSchema,
  createAdvanceSchema,
  createFinalSchema,
  updateInvoiceSchema,
  listInvoicesSchema,
  invoiceIdParamSchema,
  transitionStatusSchema,
  finalizeSchema,
  sendSchema,
  recordPaymentSchema,
} from './invoice.validation.js';

const router = Router();

// Named routes BEFORE /:id
router.post('/advance', authenticate, requirePermission('invoicing:write'), validate(createAdvanceSchema), (req, res, next) => invoiceController.createAdvance(req, res, next));
router.post('/final', authenticate, requirePermission('invoicing:write'), validate(createFinalSchema), (req, res, next) => invoiceController.createFinal(req, res, next));

// Standard CRUD
router.post('/', authenticate, requirePermission('invoicing:write'), validate(createInvoiceSchema), (req, res, next) => invoiceController.create(req, res, next));
router.get('/', authenticate, requirePermission('invoicing:read'), validate(listInvoicesSchema), (req, res, next) => invoiceController.list(req, res, next));

// /:id routes
router.get('/:id', authenticate, requirePermission('invoicing:read'), validate(invoiceIdParamSchema), (req, res, next) => invoiceController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('invoicing:write'), validate(updateInvoiceSchema), (req, res, next) => invoiceController.update(req, res, next));
router.patch('/:id/status', authenticate, requirePermission('invoicing:write'), validate(transitionStatusSchema), (req, res, next) => invoiceController.transitionStatus(req, res, next));
router.post('/:id/finalize', authenticate, requirePermission('invoicing:write'), validate(finalizeSchema), (req, res, next) => invoiceController.finalize(req, res, next));
router.post('/:id/send', authenticate, requirePermission('invoicing:write'), validate(sendSchema), (req, res, next) => invoiceController.send(req, res, next));
router.post('/:id/payments', authenticate, requirePermission('invoicing:write'), validate(recordPaymentSchema), (req, res, next) => invoiceController.recordPayment(req, res, next));
router.get('/:id/payments', authenticate, requirePermission('invoicing:read'), validate(invoiceIdParamSchema), (req, res, next) => invoiceController.getPayments(req, res, next));
router.post('/:id/documents/generate', authenticate, requirePermission('invoicing:write'), validate(invoiceIdParamSchema), (req, res, next) => invoiceController.generateDocument(req, res, next));
router.get('/:id/history', authenticate, requirePermission('invoicing:read'), validate(invoiceIdParamSchema), (req, res, next) => invoiceController.getHistory(req, res, next));

export default router;
