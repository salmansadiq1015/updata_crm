import { Router } from 'express';
import authController from './auth.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { authLimiter } from '../../shared/middleware/rateLimiter.js';
import {
  loginSchema,
  refreshSchema,
  resetRequestSchema,
  resetConfirmSchema,
  activateSchema,
  changePasswordSchema,
  sessionIdParamSchema,
  auditQuerySchema,
  auditExportSchema,
} from './auth.validation.js';

const router = Router();

// --- Public endpoints ---

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user and obtain JWT tokens
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful, returns access and refresh tokens
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  (req, res, next) => authController.login(req, res, next),
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh an expired access token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post(
  '/refresh',
  validate(refreshSchema),
  (req, res, next) => authController.refresh(req, res, next),
);

/**
 * @swagger
 * /auth/activate:
 *   post:
 *     tags: [Auth]
 *     summary: Activate a new user account with invitation token
 *     security: []
 *     responses:
 *       200:
 *         description: Account activated successfully
 *       400:
 *         description: Invalid or expired activation token
 */
router.post(
  '/activate',
  validate(activateSchema),
  (req, res, next) => authController.activate(req, res, next),
);

/**
 * @swagger
 * /auth/reset-password/request:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset email sent (always returns 200 to prevent email enumeration)
 *       429:
 *         description: Too many requests
 */
router.post(
  '/reset-password/request',
  authLimiter,
  validate(resetRequestSchema),
  (req, res, next) => authController.requestPasswordReset(req, res, next),
);

/**
 * @swagger
 * /auth/reset-password/confirm:
 *   post:
 *     tags: [Auth]
 *     summary: Confirm password reset with token and new password
 *     security: []
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired reset token
 */
router.post(
  '/reset-password/confirm',
  validate(resetConfirmSchema),
  (req, res, next) => authController.confirmPasswordReset(req, res, next),
);

// --- Authenticated endpoints ---

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out and invalidate the current session
 *     responses:
 *       200:
 *         description: Logged out successfully
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/logout',
  authenticate,
  (req, res, next) => authController.logout(req, res, next),
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change the authenticated user's password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Not authenticated or current password incorrect
 */
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  (req, res, next) => authController.changePassword(req, res, next),
);

// --- Session management ---

/**
 * @swagger
 * /auth/sessions:
 *   get:
 *     tags: [Auth]
 *     summary: List all active sessions for the current user
 *     responses:
 *       200:
 *         description: List of active sessions
 *       401:
 *         description: Not authenticated
 */
router.get(
  '/sessions',
  authenticate,
  (req, res, next) => authController.listSessions(req, res, next),
);

/**
 * @swagger
 * /auth/sessions/{id}:
 *   delete:
 *     tags: [Auth]
 *     summary: Revoke a specific session by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session revoked
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Session not found
 */
router.delete(
  '/sessions/:id',
  authenticate,
  validate(sessionIdParamSchema),
  (req, res, next) => authController.revokeSession(req, res, next),
);

/**
 * @swagger
 * /auth/sessions/revoke-others:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke all sessions except the current one
 *     responses:
 *       200:
 *         description: Other sessions revoked
 *       401:
 *         description: Not authenticated
 */
router.post(
  '/sessions/revoke-others',
  authenticate,
  (req, res, next) => authController.revokeOtherSessions(req, res, next),
);

// --- Audit log (requires audit:read permission) ---

/**
 * @swagger
 * /auth/audit:
 *   get:
 *     tags: [Auth]
 *     summary: Query the security audit log
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
 *         name: action
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated audit log entries
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing audit:read permission
 */
router.get(
  '/audit',
  authenticate,
  requirePermission('audit:read'),
  validate(auditQuerySchema),
  (req, res, next) => authController.getAuditLog(req, res, next),
);

/**
 * @swagger
 * /auth/audit/export:
 *   get:
 *     tags: [Auth]
 *     summary: Export audit log as CSV
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Missing audit:read permission
 */
router.get(
  '/audit/export',
  authenticate,
  requirePermission('audit:read'),
  validate(auditExportSchema),
  (req, res, next) => authController.exportAuditLog(req, res, next),
);

export default router;
