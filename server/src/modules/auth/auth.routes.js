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

// POST /api/v1/auth/login
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  (req, res, next) => authController.login(req, res, next),
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  validate(refreshSchema),
  (req, res, next) => authController.refresh(req, res, next),
);

// POST /api/v1/auth/activate
router.post(
  '/activate',
  validate(activateSchema),
  (req, res, next) => authController.activate(req, res, next),
);

// POST /api/v1/auth/reset-password/request
router.post(
  '/reset-password/request',
  authLimiter,
  validate(resetRequestSchema),
  (req, res, next) => authController.requestPasswordReset(req, res, next),
);

// POST /api/v1/auth/reset-password/confirm
router.post(
  '/reset-password/confirm',
  validate(resetConfirmSchema),
  (req, res, next) => authController.confirmPasswordReset(req, res, next),
);

// --- Authenticated endpoints ---

// POST /api/v1/auth/logout
router.post(
  '/logout',
  authenticate,
  (req, res, next) => authController.logout(req, res, next),
);

// POST /api/v1/auth/change-password
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  (req, res, next) => authController.changePassword(req, res, next),
);

// --- Session management ---

// GET /api/v1/auth/sessions
router.get(
  '/sessions',
  authenticate,
  (req, res, next) => authController.listSessions(req, res, next),
);

// DELETE /api/v1/auth/sessions/:id
router.delete(
  '/sessions/:id',
  authenticate,
  validate(sessionIdParamSchema),
  (req, res, next) => authController.revokeSession(req, res, next),
);

// POST /api/v1/auth/sessions/revoke-others
router.post(
  '/sessions/revoke-others',
  authenticate,
  (req, res, next) => authController.revokeOtherSessions(req, res, next),
);

// --- Audit log (requires audit:read permission) ---

// GET /api/v1/auth/audit
router.get(
  '/audit',
  authenticate,
  requirePermission('audit:read'),
  validate(auditQuerySchema),
  (req, res, next) => authController.getAuditLog(req, res, next),
);

// GET /api/v1/auth/audit/export
router.get(
  '/audit/export',
  authenticate,
  requirePermission('audit:read'),
  validate(auditExportSchema),
  (req, res, next) => authController.exportAuditLog(req, res, next),
);

export default router;
