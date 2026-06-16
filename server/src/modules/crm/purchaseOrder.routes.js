import { Router } from 'express';
import procurementController from './procurement.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listPurchaseOrdersSchema,
  purchaseOrderIdParamSchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  receivePurchaseOrderSchema,
} from './procurement.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('crm:read'), validate(listPurchaseOrdersSchema), (req, res, next) => procurementController.listPurchaseOrders(req, res, next));
router.post('/', authenticate, requirePermission('crm:write'), validate(createPurchaseOrderSchema), (req, res, next) => procurementController.createPurchaseOrder(req, res, next));
router.get('/:id', authenticate, requirePermission('crm:read'), validate(purchaseOrderIdParamSchema), (req, res, next) => procurementController.getPurchaseOrderById(req, res, next));
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updatePurchaseOrderSchema), (req, res, next) => procurementController.updatePurchaseOrder(req, res, next));
router.post('/:id/cancel', authenticate, requirePermission('crm:write'), validate(purchaseOrderIdParamSchema), (req, res, next) => procurementController.cancelPurchaseOrder(req, res, next));
router.post('/:id/receive', authenticate, requirePermission('crm:write'), validate(receivePurchaseOrderSchema), (req, res, next) => procurementController.receivePurchaseOrder(req, res, next));

export default router;
