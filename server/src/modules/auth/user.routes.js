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
  directoryUsersSchema,
  userIdParamSchema,
  listUserProjectsSchema,
  assignUserProjectSchema,
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

/**
 * @swagger
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get the currently authenticated user's profile
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Not authenticated
 *   patch:
 *     tags: [Users]
 *     summary: Update the current user's own profile
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/me',
  authenticate,
  (req, res, next) => userController.getMe(req, res, next),
);

router.patch(
  '/me',
  authenticate,
  validate(updateMeSchema),
  (req, res, next) => userController.updateMe(req, res, next),
);

router.patch(
  '/me/preferences',
  authenticate,
  (req, res, next) => userController.updatePreferences(req, res, next),
);

// --- Directory (available to all authenticated users, used for task assignment) ---
router.get(
  '/directory',
  authenticate,
  validate(directoryUsersSchema),
  (req, res, next) => userController.directory(req, res, next),
);

// KPI counts for the Employee Management page (before /:id).
router.get(
  '/stats',
  authenticate,
  requirePermission('users:read'),
  (req, res, next) => userController.stats(req, res, next),
);

router.get(
  '/assignment-targets',
  authenticate,
  requirePermission('users:read'),
  (req, res, next) => userController.assignmentTargets(req, res, next),
);

// --- Bulk operations (MUST be before /:id to prevent matching) ---

router.patch(
  '/bulk-update',
  authenticate,
  requirePermission('users:admin'),
  validate(bulkUpdateSchema),
  (req, res, next) => userController.bulkUpdate(req, res, next),
);

router.post(
  '/bulk-delete',
  authenticate,
  requirePermission('users:admin'),
  validate(bulkDeleteSchema),
  (req, res, next) => userController.bulkDeactivate(req, res, next),
);

// --- Admin user management ---

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List all users (admin)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *     responses:
 *       200:
 *         description: Paginated list of users
 *       403:
 *         description: Missing users:read permission
 *   post:
 *     tags: [Users]
 *     summary: Create a new user (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, firstName, lastName, role]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created, invitation email sent
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already in use
 */
router.get(
  '/',
  authenticate,
  requirePermission('users:read'),
  validate(listUsersSchema),
  (req, res, next) => userController.list(req, res, next),
);

router.post(
  '/',
  authenticate,
  requirePermission('users:write'),
  validate(createUserSchema),
  (req, res, next) => userController.create(req, res, next),
);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get a user by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 *   patch:
 *     tags: [Users]
 *     summary: Update a user (admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User updated
 *       404:
 *         description: User not found
 *   delete:
 *     tags: [Users]
 *     summary: Deactivate a user
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deactivated
 *       404:
 *         description: User not found
 */
router.get(
  '/:id',
  authenticate,
  requirePermission('users:read'),
  validate(userIdParamSchema),
  (req, res, next) => userController.getById(req, res, next),
);

router.patch(
  '/:id',
  authenticate,
  requirePermission('users:write'),
  validate(updateUserSchema),
  (req, res, next) => userController.update(req, res, next),
);

router.patch(
  '/:id/deactivate',
  authenticate,
  requirePermission('users:admin'),
  validate(userIdParamSchema),
  (req, res, next) => userController.deactivate(req, res, next),
);

router.patch(
  '/:id/activate',
  authenticate,
  requirePermission('users:admin'),
  validate(userIdParamSchema),
  (req, res, next) => userController.activate(req, res, next),
);

router.get(
  '/:id/projects',
  authenticate,
  requirePermission('users:read'),
  validate(listUserProjectsSchema),
  (req, res, next) => userController.listAssignedProjects(req, res, next),
);

router.post(
  '/:id/projects',
  authenticate,
  requirePermission('users:write'),
  validate(assignUserProjectSchema),
  (req, res, next) => userController.assignProject(req, res, next),
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('users:admin'),
  validate(userIdParamSchema),
  (req, res, next) => userController.deactivate(req, res, next),
);

/**
 * @swagger
 * /users/{id}/avatar:
 *   post:
 *     tags: [Users]
 *     summary: Upload a user avatar image
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded
 *       413:
 *         description: File too large (max 5MB)
 *   delete:
 *     tags: [Users]
 *     summary: Remove a user's avatar
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Avatar removed
 */
router.post(
  '/:id/avatar',
  authenticate,
  uploadLimiter,
  upload.single('avatar'),
  (req, res, next) => userController.uploadAvatar(req, res, next),
);

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
