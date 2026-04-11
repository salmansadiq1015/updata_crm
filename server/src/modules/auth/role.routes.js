import { Router } from 'express';
import roleController from './role.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createRoleSchema,
  updateRoleSchema,
  roleIdParamSchema,
} from './role.validation.js';

const router = Router();

// GET /api/v1/roles
router.get(
  '/',
  authenticate,
  requirePermission('roles:read'),
  (req, res, next) => roleController.list(req, res, next),
);

// POST /api/v1/roles
router.post(
  '/',
  authenticate,
  requirePermission('roles:admin'),
  validate(createRoleSchema),
  (req, res, next) => roleController.create(req, res, next),
);

// GET /api/v1/roles/:id
router.get(
  '/:id',
  authenticate,
  requirePermission('roles:read'),
  validate(roleIdParamSchema),
  (req, res, next) => roleController.getById(req, res, next),
);

// PATCH /api/v1/roles/:id
router.patch(
  '/:id',
  authenticate,
  requirePermission('roles:admin'),
  validate(updateRoleSchema),
  (req, res, next) => roleController.update(req, res, next),
);

// DELETE /api/v1/roles/:id
router.delete(
  '/:id',
  authenticate,
  requirePermission('roles:admin'),
  validate(roleIdParamSchema),
  (req, res, next) => roleController.delete(req, res, next),
);

export default router;

// Separate permissions router
export const permissionRouter = Router();

// GET /api/v1/permissions
permissionRouter.get(
  '/',
  authenticate,
  requirePermission('roles:read'),
  (req, res, next) => roleController.listPermissions(req, res, next),
);
