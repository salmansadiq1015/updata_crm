import { Router } from 'express';
import emailController from './email.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  sendEmailSchema,
  composeEmailSchema,
  emailIdParamSchema,
  listEmailsSchema,
} from './email.validation.js';

const router = Router();

// Send email — any user with crm:write (or templates:write) can send.
router.post(
  '/send',
  authenticate,
  requirePermission('crm:write'),
  validate(sendEmailSchema),
  (req, res, next) => emailController.send(req, res, next),
);

// Compose email (preview / pre-fill)
router.post(
  '/compose',
  authenticate,
  requirePermission('crm:read'),
  validate(composeEmailSchema),
  (req, res, next) => emailController.compose(req, res, next),
);

// List email records
router.get(
  '/',
  authenticate,
  requirePermission('crm:read'),
  validate(listEmailsSchema),
  (req, res, next) => emailController.list(req, res, next),
);

// Get email record by ID (AFTER /send and /compose)
router.get(
  '/:id',
  authenticate,
  requirePermission('crm:read'),
  validate(emailIdParamSchema),
  (req, res, next) => emailController.getById(req, res, next),
);

// Retry failed email
router.post(
  '/:id/retry',
  authenticate,
  requirePermission('crm:write'),
  validate(emailIdParamSchema),
  (req, res, next) => emailController.retry(req, res, next),
);

export default router;
