import { Router } from 'express';
import apInvoiceController from './apInvoice.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createApSchema, updateApSchema, listApSchema,
  approveApSchema, disputeApSchema, apIdParamSchema,
  createBatchSchema, batchIdParamSchema,
} from './apInvoice.validation.js';

const router = Router();

// Named routes BEFORE /:id
router.get('/open-payables', authenticate, requirePermission('accounting:ap:read'), validate(listApSchema), (req, res, next) => apInvoiceController.getOpenPayables(req, res, next));
router.get('/aging', authenticate, requirePermission('accounting:ap:read'), (req, res, next) => apInvoiceController.getAging(req, res, next));
router.get('/summary', authenticate, requirePermission('accounting:ap:read'), (req, res, next) => apInvoiceController.getSummary(req, res, next));
router.post('/payment-batch', authenticate, requirePermission('accounting:ap:manage'), validate(createBatchSchema), (req, res, next) => apInvoiceController.createPaymentBatch(req, res, next));
router.get('/payment-batch/:batchId', authenticate, requirePermission('accounting:ap:read'), validate(batchIdParamSchema), (req, res, next) => apInvoiceController.getPaymentBatch(req, res, next));

// Standard CRUD
router.get('/', authenticate, requirePermission('accounting:ap:read'), validate(listApSchema), (req, res, next) => apInvoiceController.list(req, res, next));
router.post('/', authenticate, requirePermission('accounting:ap:manage'), validate(createApSchema), (req, res, next) => apInvoiceController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:ap:read'), validate(apIdParamSchema), (req, res, next) => apInvoiceController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('accounting:ap:manage'), validate(updateApSchema), (req, res, next) => apInvoiceController.update(req, res, next));
router.post('/:id/approve', authenticate, requirePermission('accounting:ap:approve'), validate(approveApSchema), (req, res, next) => apInvoiceController.approve(req, res, next));
router.post('/:id/second-approve', authenticate, requirePermission('accounting:ap:approve_high'), validate(approveApSchema), (req, res, next) => apInvoiceController.secondApprove(req, res, next));
router.post('/:id/dispute', authenticate, requirePermission('accounting:ap:manage'), validate(disputeApSchema), (req, res, next) => apInvoiceController.dispute(req, res, next));
router.get('/:id/document', authenticate, requirePermission('accounting:ap:read'), validate(apIdParamSchema), (req, res, next) => apInvoiceController.getDocument(req, res, next));

export default router;
