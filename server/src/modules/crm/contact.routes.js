import { Router } from 'express';
import contactController from './contact.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createContactSchema, updateContactSchema, contactIdParamSchema,
  customerIdParamSchema, searchContactsSchema,
} from './contact.validation.js';

const router = Router();

// List all contacts (address book)
router.get('/', authenticate, requirePermission('crm:read'), (req, res, next) => contactController.listAll(req, res, next));

// Named routes BEFORE /:id
router.get('/search', authenticate, requirePermission('crm:read'), validate(searchContactsSchema), (req, res, next) => contactController.search(req, res, next));

// Standard CRUD
router.get('/:id', authenticate, requirePermission('crm:read'), validate(contactIdParamSchema), (req, res, next) => contactController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateContactSchema), (req, res, next) => contactController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('crm:delete'), validate(contactIdParamSchema), (req, res, next) => contactController.delete(req, res, next));
router.post('/:id/set-primary', authenticate, requirePermission('crm:write'), validate(contactIdParamSchema), (req, res, next) => contactController.setPrimary(req, res, next));

// --- Nested customer contacts router ---
const customerContactsRouter = Router({ mergeParams: true });

customerContactsRouter.get('/', authenticate, requirePermission('crm:read'), validate(customerIdParamSchema), (req, res, next) => contactController.listByCustomer(req, res, next));
customerContactsRouter.post('/', authenticate, requirePermission('crm:write'), validate(customerIdParamSchema), (req, res, next) => contactController.create(req, res, next));

export { customerContactsRouter };
export default router;
