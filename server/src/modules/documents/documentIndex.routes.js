import { Router } from 'express';
import multer from 'multer';
import documentIndexController from './documentIndex.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  documentRecordParamSchema,
  listAttachableSchema,
  listDocumentsSchema,
  uploadDocumentSchema,
} from './documentIndex.validation.js';
import config from '../../config/index.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxFileSize },
});

router.get(
  '/attachable',
  authenticate,
  requirePermission('documents:read'),
  validate(listAttachableSchema),
  (req, res, next) => documentIndexController.listAttachable(req, res, next),
);

router.get(
  '/',
  authenticate,
  requirePermission('documents:read'),
  validate(listDocumentsSchema),
  (req, res, next) => documentIndexController.list(req, res, next),
);

router.post(
  '/upload',
  authenticate,
  requirePermission('documents:write'),
  upload.single('file'),
  validate(uploadDocumentSchema),
  (req, res, next) => documentIndexController.upload(req, res, next),
);

router.get(
  '/:id/download',
  authenticate,
  requirePermission('documents:read'),
  validate(documentRecordParamSchema),
  (req, res, next) => documentIndexController.download(req, res, next),
);

// Visum: POST to sign off, DELETE to clear.
router.post(
  '/:id/visum',
  authenticate,
  requirePermission('documents:write'),
  validate(documentRecordParamSchema),
  (req, res, next) => documentIndexController.setVisum(req, res, next),
);

router.delete(
  '/:id/visum',
  authenticate,
  requirePermission('documents:write'),
  validate(documentRecordParamSchema),
  (req, res, next) => documentIndexController.setVisum(req, res, next),
);

// Digitales Dossier: POST releases to the field, DELETE revokes.
router.post(
  '/:id/release',
  authenticate,
  requirePermission('documents:write'),
  validate(documentRecordParamSchema),
  (req, res, next) => documentIndexController.setReleased(req, res, next),
);

router.delete(
  '/:id/release',
  authenticate,
  requirePermission('documents:write'),
  validate(documentRecordParamSchema),
  (req, res, next) => documentIndexController.setReleased(req, res, next),
);

// Archive: POST to archive, DELETE to restore from archive.
router.post(
  '/:id/archive',
  authenticate,
  requirePermission('documents:write'),
  validate(documentRecordParamSchema),
  (req, res, next) => documentIndexController.setArchived(req, res, next),
);

router.delete(
  '/:id/archive',
  authenticate,
  requirePermission('documents:write'),
  validate(documentRecordParamSchema),
  (req, res, next) => documentIndexController.setArchived(req, res, next),
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('documents:delete'),
  validate(documentRecordParamSchema),
  (req, res, next) => documentIndexController.delete(req, res, next),
);

export default router;
