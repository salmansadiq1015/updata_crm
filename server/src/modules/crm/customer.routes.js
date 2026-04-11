import { Router } from 'express';
import customerController from './customer.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createCustomerSchema, updateCustomerSchema, listCustomersSchema,
  searchCustomersSchema, duplicateCheckSchema, customerIdParamSchema,
  mergeCustomersSchema, bulkUpdateCustomersSchema, bulkDeleteCustomersSchema,
} from './customer.validation.js';

const router = Router();

// Named routes BEFORE /:id
router.get('/search', authenticate, requirePermission('crm:read'), validate(searchCustomersSchema), (req, res, next) => customerController.search(req, res, next));
router.get('/duplicates', authenticate, requirePermission('crm:read'), validate(duplicateCheckSchema), (req, res, next) => customerController.checkDuplicates(req, res, next));
router.patch('/bulk-update', authenticate, requirePermission('crm:admin'), validate(bulkUpdateCustomersSchema), (req, res, next) => customerController.bulkUpdate(req, res, next));
router.post('/bulk-delete', authenticate, requirePermission('crm:admin'), validate(bulkDeleteCustomersSchema), (req, res, next) => customerController.bulkDeactivate(req, res, next));
router.post('/merge', authenticate, requirePermission('crm:admin'), validate(mergeCustomersSchema), (req, res, next) => customerController.merge(req, res, next));

// Standard CRUD
router.get('/', authenticate, requirePermission('crm:read'), validate(listCustomersSchema), (req, res, next) => customerController.list(req, res, next));
router.post('/', authenticate, requirePermission('crm:write'), validate(createCustomerSchema), (req, res, next) => customerController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('crm:read'), validate(customerIdParamSchema), (req, res, next) => customerController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateCustomerSchema), (req, res, next) => customerController.update(req, res, next));
router.post('/:id/archive', authenticate, requirePermission('crm:delete'), validate(customerIdParamSchema), (req, res, next) => customerController.archive(req, res, next));

export default router;
