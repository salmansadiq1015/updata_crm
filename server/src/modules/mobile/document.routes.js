import { Router } from 'express';
import multer from 'multer';
import documentController from './document.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listDocumentsSchema,
  downloadDocumentSchema,
  uploadDocumentSchema,
} from './document.validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Nested router for routes under /orders/:id/documents
const documentRouter = Router({ mergeParams: true });

documentRouter.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listDocumentsSchema),
  (req, res, next) => documentController.listDocuments(req, res, next),
);

documentRouter.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  upload.single('file'),
  validate(uploadDocumentSchema),
  (req, res, next) => documentController.uploadDocument(req, res, next),
);

documentRouter.get(
  '/:docId/download',
  authenticate,
  requirePermission('mobile:read'),
  validate(downloadDocumentSchema),
  (req, res, next) => documentController.downloadDocument(req, res, next),
);

export default documentRouter;
