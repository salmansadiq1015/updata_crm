import { Router } from 'express';
import contactLogController from './contactLog.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listContactLogSchema,
  listCustomerContactLogSchema,
  createContactLogSchema,
  updateContactLogSchema,
  contactLogIdParamSchema,
} from './contactLog.validation.js';

/** Nested under /customers/:customerId/contact-log — the central view. */
export const customerContactLogRouter = Router({ mergeParams: true });

customerContactLogRouter.get('/', authenticate, requirePermission('crm:read'), validate(listCustomerContactLogSchema), (req, res, next) => contactLogController.listByCustomer(req, res, next));
customerContactLogRouter.post('/', authenticate, requirePermission('crm:write'), validate(createContactLogSchema), (req, res, next) => contactLogController.create(req, res, next));

/** Standalone /contact-log — scoped listings and per-entry operations. */
const router = Router();

router.get('/', authenticate, requirePermission('crm:read'), validate(listContactLogSchema), (req, res, next) => contactLogController.list(req, res, next));
router.get('/:id', authenticate, requirePermission('crm:read'), validate(contactLogIdParamSchema), (req, res, next) => contactLogController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateContactLogSchema), (req, res, next) => contactLogController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('crm:delete'), validate(contactLogIdParamSchema), (req, res, next) => contactLogController.delete(req, res, next));

export default router;
