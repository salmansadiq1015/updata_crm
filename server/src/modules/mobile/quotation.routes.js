import { Router } from 'express';
import quotationController from './quotation.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { quotationSchema } from './quotation.validation.js';

// Nested router for routes under /orders/:id/quotation
const quotationRouter = Router({ mergeParams: true });

quotationRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(quotationSchema),
  (req, res, next) => quotationController.getQuotation(req, res, next),
);

export default quotationRouter;
