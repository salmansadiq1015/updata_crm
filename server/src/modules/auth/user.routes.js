import { Router } from 'express';
import multer from 'multer';
import userController from './user.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { uploadLimiter } from '../../shared/middleware/rateLimiter.js';
import {
  createUserSchema,
  updateUserSchema,
  updateMeSchema,
  listUsersSchema,
  userIdParamSchema,
  bulkUpdateSchema,
  bulkDeleteSchema,
} from './user.validation.js';

const router = Router();

// Multer for avatar uploads (memory storage, 5MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// --- /me routes MUST be before /:id to prevent 'me' matching as an ID ---

// GET /api/v1/users/me
router.get(
  '/me',
  authenticate,
  (req, res, next) => userController.getMe(req, res, next),
);

// PATCH /api/v1/users/me
router.patch(
  '/me',
  authenticate,
  validate(updateMeSchema),
  (req, res, next) => userController.updateMe(req, res, next),
);

// --- Bulk operations (MUST be before /:id to prevent matching) ---

// PATCH /api/v1/users/bulk-update
router.patch(
  '/bulk-update',
  authenticate,
  requirePermission('users:admin'),
  validate(bulkUpdateSchema),
  (req, res, next) => userController.bulkUpdate(req, res, next),
);

// POST /api/v1/users/bulk-delete
router.post(
  '/bulk-delete',
  authenticate,
  requirePermission('users:admin'),
  validate(bulkDeleteSchema),
  (req, res, next) => userController.bulkDeactivate(req, res, next),
);

// --- Admin user management ---

// GET /api/v1/users
router.get(
  '/',
  authenticate,
  requirePermission('users:read'),
  validate(listUsersSchema),
  (req, res, next) => userController.list(req, res, next),
);

// POST /api/v1/users
router.post(
  '/',
  authenticate,
  requirePermission('users:write'),
  validate(createUserSchema),
  (req, res, next) => userController.create(req, res, next),
);

// GET /api/v1/users/:id
router.get(
  '/:id',
  authenticate,
  requirePermission('users:read'),
  validate(userIdParamSchema),
  (req, res, next) => userController.getById(req, res, next),
);

// PATCH /api/v1/users/:id
router.patch(
  '/:id',
  authenticate,
  requirePermission('users:write'),
  validate(updateUserSchema),
  (req, res, next) => userController.update(req, res, next),
);

// DELETE /api/v1/users/:id (soft delete / deactivate)
router.delete(
  '/:id',
  authenticate,
  requirePermission('users:admin'),
  validate(userIdParamSchema),
  (req, res, next) => userController.deactivate(req, res, next),
);

// POST /api/v1/users/:id/avatar
router.post(
  '/:id/avatar',
  authenticate,
  uploadLimiter,
  upload.single('avatar'),
  (req, res, next) => userController.uploadAvatar(req, res, next),
);

// DELETE /api/v1/users/:id/avatar
router.delete(
  '/:id/avatar',
  authenticate,
  (req, res, next) => userController.removeAvatar(req, res, next),
);

// --- Admin session management for specific user ---

// GET /api/v1/users/:id/sessions
router.get(
  '/:id/sessions',
  authenticate,
  requirePermission('users:admin'),
  validate(userIdParamSchema),
  (req, res, next) => userController.listUserSessions(req, res, next),
);

// DELETE /api/v1/users/:id/sessions
router.delete(
  '/:id/sessions',
  authenticate,
  requirePermission('users:admin'),
  validate(userIdParamSchema),
  (req, res, next) => userController.revokeUserSessions(req, res, next),
);

export default router;
