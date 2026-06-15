import { Router } from 'express';
import documentController from './document.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  generateSchema,
  generateBatchSchema,
  batchStatusParamSchema,
  documentIdParamSchema,
  listDocumentsSchema,
  sourceParamSchema,
} from './document.validation.js';

const router = Router();

// Generate single document
router.post(
  '/generate',
  authenticate,
  requirePermission('templates:write'),
  validate(generateSchema),
  (req, res, next) => documentController.generate(req, res, next),
);

// Generate batch of documents
router.post(
  '/generate/batch',
  authenticate,
  requirePermission('templates:write'),
  validate(generateBatchSchema),
  (req, res, next) => documentController.generateBatch(req, res, next),
);

// Batch status
router.get(
  '/generate/batch/:batchId/status',
  authenticate,
  requirePermission('documents:read'),
  validate(batchStatusParamSchema),
  (req, res, next) => documentController.getBatchStatus(req, res, next),
);

// List documents (cursor-paginated)
router.get(
  '/',
  authenticate,
  requirePermission('documents:read'),
  validate(listDocumentsSchema),
  (req, res, next) => documentController.list(req, res, next),
);

// List by source (BEFORE /:id to avoid param collision)
router.get(
  '/source/:sourceModule/:sourceRecordId',
  authenticate,
  requirePermission('documents:read'),
  validate(sourceParamSchema),
  (req, res, next) => documentController.listBySource(req, res, next),
);

// Get document by ID
router.get(
  '/:id',
  authenticate,
  requirePermission('documents:read'),
  validate(documentIdParamSchema),
  (req, res, next) => documentController.getById(req, res, next),
);

// Download document
router.get(
  '/:id/download',
  authenticate,
  requirePermission('documents:read'),
  validate(documentIdParamSchema),
  (req, res, next) => documentController.download(req, res, next),
);

// Delete document
router.delete(
  '/:id',
  authenticate,
  requirePermission('documents:delete'),
  validate(documentIdParamSchema),
  (req, res, next) => documentController.delete(req, res, next),
);

export default router;
