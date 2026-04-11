import { Router } from 'express';
import unitOfMeasureController from './unitOfMeasure.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listUnitsSchema,
  createUnitSchema,
  updateUnitSchema,
  unitCodeParamSchema,
} from './unitOfMeasure.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('catalog:read'), validate(listUnitsSchema), (req, res, next) => unitOfMeasureController.list(req, res, next));
router.post('/', authenticate, requirePermission('catalog:admin'), validate(createUnitSchema), (req, res, next) => unitOfMeasureController.create(req, res, next));
router.put('/:code', authenticate, requirePermission('catalog:admin'), validate(updateUnitSchema), (req, res, next) => unitOfMeasureController.update(req, res, next));
router.delete('/:code', authenticate, requirePermission('catalog:admin'), validate(unitCodeParamSchema), (req, res, next) => unitOfMeasureController.delete(req, res, next));

export default router;
