import { Router } from 'express';
import procurementController from './procurement.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listSuppliersSchema,
  searchSuppliersSchema,
  supplierIdParamSchema,
  createSupplierSchema,
  updateSupplierSchema,
} from './procurement.validation.js';

const router = Router();

router.get('/search', authenticate, requirePermission('crm:read'), validate(searchSuppliersSchema), (req, res, next) => procurementController.searchSuppliers(req, res, next));
router.get('/', authenticate, requirePermission('crm:read'), validate(listSuppliersSchema), (req, res, next) => procurementController.listSuppliers(req, res, next));
router.post('/', authenticate, requirePermission('crm:write'), validate(createSupplierSchema), (req, res, next) => procurementController.createSupplier(req, res, next));
router.get('/:id', authenticate, requirePermission('crm:read'), validate(supplierIdParamSchema), (req, res, next) => procurementController.getSupplierById(req, res, next));
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateSupplierSchema), (req, res, next) => procurementController.updateSupplier(req, res, next));
router.delete('/:id', authenticate, requirePermission('crm:delete'), validate(supplierIdParamSchema), (req, res, next) => procurementController.deleteSupplier(req, res, next));

export default router;
