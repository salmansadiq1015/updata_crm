import { Router } from 'express';
import orderController from './order.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createOrderSchema,
  updateOrderSchema,
  listOrdersSchema,
  orderIdParamSchema,
  transitionOrderStatusSchema,
} from './order.validation.js';

const router = Router();

// Standard CRUD
router.post('/', authenticate, requirePermission('quotations:write'), validate(createOrderSchema), (req, res, next) => orderController.create(req, res, next));
router.get('/', authenticate, requirePermission('quotations:read'), validate(listOrdersSchema), (req, res, next) => orderController.list(req, res, next));
router.get('/:id', authenticate, requirePermission('quotations:read'), validate(orderIdParamSchema), (req, res, next) => orderController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('quotations:write'), validate(updateOrderSchema), (req, res, next) => orderController.update(req, res, next));
router.patch('/:id/status', authenticate, requirePermission('quotations:write'), validate(transitionOrderStatusSchema), (req, res, next) => orderController.transitionStatus(req, res, next));
router.get('/:id/invoices', authenticate, requirePermission('quotations:read'), validate(orderIdParamSchema), (req, res, next) => orderController.getInvoices(req, res, next));
router.post('/:id/documents/generate', authenticate, requirePermission('quotations:write'), validate(orderIdParamSchema), (req, res, next) => orderController.generateDocument(req, res, next));
router.get('/:id/history', authenticate, requirePermission('quotations:read'), validate(orderIdParamSchema), (req, res, next) => orderController.getHistory(req, res, next));

export default router;
