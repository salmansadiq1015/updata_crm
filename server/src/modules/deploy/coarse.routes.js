import { Router } from 'express';
import coarseController from './coarse.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  getCoarseMatrixSchema,
  createCoarseSchema,
  updateCoarseSchema,
  moveCoarseSchema,
  coarseIdParamSchema,
  bulkCoarseSchema,
} from './coarse.validation.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('scheduling:admin'),
  validate(getCoarseMatrixSchema),
  (req, res, next) => coarseController.getMatrix(req, res, next),
);

router.post(
  '/allocations',
  authenticate,
  requirePermission('scheduling:admin'),
  validate(createCoarseSchema),
  (req, res, next) => coarseController.create(req, res, next),
);

router.patch(
  '/allocations/:id',
  authenticate,
  requirePermission('scheduling:admin'),
  validate(updateCoarseSchema),
  (req, res, next) => coarseController.update(req, res, next),
);

router.post(
  '/allocations/:id/move',
  authenticate,
  requirePermission('scheduling:admin'),
  validate(moveCoarseSchema),
  (req, res, next) => coarseController.move(req, res, next),
);

router.delete(
  '/allocations/:id',
  authenticate,
  requirePermission('scheduling:admin'),
  validate(coarseIdParamSchema),
  (req, res, next) => coarseController.delete(req, res, next),
);

router.post(
  '/allocations/bulk',
  authenticate,
  requirePermission('scheduling:admin'),
  validate(bulkCoarseSchema),
  (req, res, next) => coarseController.bulkUpsert(req, res, next),
);

export default router;
