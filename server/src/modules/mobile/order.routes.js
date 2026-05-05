import { Router } from 'express';
import orderController from './order.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listOrdersSchema,
  orderIdParamSchema,
  updateStatusSchema,
} from './order.validation.js';

const router = Router();

router.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  (req, res, next) => orderController.createOrder(req, res, next),
);

router.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listOrdersSchema),
  (req, res, next) => orderController.listOrders(req, res, next),
);

router.get(
  '/:id',
  authenticate,
  requirePermission('mobile:read'),
  validate(orderIdParamSchema),
  (req, res, next) => orderController.getOrderDetail(req, res, next),
);

router.put(
  '/:id',
  authenticate,
  requirePermission('mobile:write'),
  validate(orderIdParamSchema),
  (req, res, next) => orderController.updateOrder(req, res, next),
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('mobile:write'),
  validate(orderIdParamSchema),
  (req, res, next) => orderController.deleteOrder(req, res, next),
);

router.post(
  '/bulk-delete',
  authenticate,
  requirePermission('mobile:write'),
  (req, res, next) => orderController.bulkDeleteOrders(req, res, next),
);

router.put(
  '/:id/status',
  authenticate,
  requirePermission('mobile:write'),
  validate(updateStatusSchema),
  (req, res, next) => orderController.updateStatus(req, res, next),
);

router.get(
  '/:id/history',
  authenticate,
  requirePermission('mobile:read'),
  validate(orderIdParamSchema),
  (req, res, next) => orderController.getOrderHistory(req, res, next),
);

export default router;
