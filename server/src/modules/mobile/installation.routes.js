import { Router } from 'express';
import installationController from './installation.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  siteInstallationsSchema,
  installationIdSchema,
} from './installation.validation.js';

// Nested router for routes under /sites/:siteId/installations
const installationSiteRouter = Router({ mergeParams: true });

installationSiteRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(siteInstallationsSchema),
  (req, res, next) => installationController.listBySite(req, res, next),
);

// Standalone router for routes under /installations
const installationRouter = Router();

installationRouter.get(
  '/:id',
  authenticate,
  requirePermission('mobile:read'),
  validate(installationIdSchema),
  (req, res, next) => installationController.getById(req, res, next),
);

installationRouter.get(
  '/:id/history',
  authenticate,
  requirePermission('mobile:read'),
  validate(installationIdSchema),
  (req, res, next) => installationController.getHistory(req, res, next),
);

export { installationSiteRouter, installationRouter };
