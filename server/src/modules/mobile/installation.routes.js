import { Router } from 'express';
import multer from 'multer';
import installationController from './installation.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  siteInstallationsSchema,
  installationIdSchema,
  createSiteInstallationSchema,
  updateInstallationSchema,
} from './installation.validation.js';

// Nested router for routes under /sites/:siteId/installations
const installationSiteRouter = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

installationSiteRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(siteInstallationsSchema),
  (req, res, next) => installationController.listBySite(req, res, next),
);

installationSiteRouter.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  validate(createSiteInstallationSchema),
  (req, res, next) => installationController.createForSite(req, res, next),
);

// Standalone router for routes under /installations
const installationRouter = Router();

installationRouter.post(
  '/nameplate/ocr',
  authenticate,
  requirePermission('mobile:write'),
  upload.single('image'),
  (req, res, next) => installationController.extractNameplate(req, res, next),
);

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

installationRouter.post(
  '/:id/nameplate',
  authenticate,
  requirePermission('mobile:write'),
  validate(installationIdSchema),
  upload.single('image'),
  (req, res, next) => installationController.uploadNameplate(req, res, next),
);

installationRouter.post(
  '/:id/nameplate/ocr',
  authenticate,
  requirePermission('mobile:write'),
  validate(installationIdSchema),
  upload.single('image'),
  (req, res, next) => installationController.extractNameplate(req, res, next),
);

installationRouter.put(
  '/:id',
  authenticate,
  requirePermission('mobile:write'),
  validate(updateInstallationSchema),
  (req, res, next) => installationController.update(req, res, next),
);

export { installationSiteRouter, installationRouter };
