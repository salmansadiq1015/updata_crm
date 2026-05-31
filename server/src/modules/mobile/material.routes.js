import { Router } from 'express';
import materialController from './material.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createMaterialSchema,
  deleteMaterialSchema,
  listMaterialsSchema,
  updateMaterialSchema,
} from './material.validation.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listMaterialsSchema),
  (req, res, next) => materialController.listByOrder(req, res, next),
);

router.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  validate(createMaterialSchema),
  (req, res, next) => materialController.create(req, res, next),
);

router.patch(
  '/:materialId',
  authenticate,
  requirePermission('mobile:write'),
  validate(updateMaterialSchema),
  (req, res, next) => materialController.update(req, res, next),
);

router.delete(
  '/:materialId',
  authenticate,
  requirePermission('mobile:write'),
  validate(deleteMaterialSchema),
  (req, res, next) => materialController.remove(req, res, next),
);

export default router;
