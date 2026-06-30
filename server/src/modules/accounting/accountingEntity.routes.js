import { Router } from 'express';
import accountingEntityController from './accountingEntity.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import {
  accountingEntityIdParamSchema,
  accountingEntityStatusSchema,
  createAccountingEntitySchema,
  listAccountingEntitiesSchema,
  updateAccountingEntitySchema,
} from './accountingEntity.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:journal:read'), validate(listAccountingEntitiesSchema), (req, res, next) => accountingEntityController.list(req, res, next));
router.post('/', authenticate, requirePermission('accounting:journal:write'), validate(createAccountingEntitySchema), (req, res, next) => accountingEntityController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:journal:read'), validate(accountingEntityIdParamSchema), (req, res, next) => accountingEntityController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('accounting:journal:write'), validate(updateAccountingEntitySchema), (req, res, next) => accountingEntityController.update(req, res, next));
router.post('/:id/activate', authenticate, requirePermission('accounting:journal:write'), validate(accountingEntityStatusSchema), (req, res, next) => accountingEntityController.activate(req, res, next));
router.post('/:id/deactivate', authenticate, requirePermission('accounting:journal:write'), validate(accountingEntityStatusSchema), (req, res, next) => accountingEntityController.deactivate(req, res, next));

export default router;
