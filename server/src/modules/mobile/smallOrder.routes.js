import { Router } from 'express';
import smallOrderController from './smallOrder.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createSmallOrderSchema,
  updateSmallOrderSchema,
  cancelSmallOrderSchema,
} from './smallOrder.validation.js';

// Nested router for routes under /projects/:id/small-orders
const smallOrderRouter = Router({ mergeParams: true });

smallOrderRouter.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  validate(createSmallOrderSchema),
  (req, res, next) => smallOrderController.create(req, res, next),
);

smallOrderRouter.put(
  '/:id',
  authenticate,
  requirePermission('mobile:write'),
  validate(updateSmallOrderSchema),
  (req, res, next) => smallOrderController.update(req, res, next),
);

smallOrderRouter.delete(
  '/:id',
  authenticate,
  requirePermission('mobile:write'),
  validate(cancelSmallOrderSchema),
  (req, res, next) => smallOrderController.cancel(req, res, next),
);

export default smallOrderRouter;
