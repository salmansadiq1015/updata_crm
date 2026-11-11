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
  linkTargetsSchema,
  updateDocumentSchema,
  bulkDocumentsSchema,
} from './documentIndex.validation.js';
import { satisfiesPermission, loadUserPermissions } from '../../shared/middleware/authenticate.js';
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

router.get('/stats', authenticate, requirePermission('documents:read'), (req, res, next) => documentIndexController.stats(req, res, next));
router.get('/facets', authenticate, requirePermission('documents:read'), (req, res, next) => documentIndexController.facets(req, res, next));
router.get(
  '/link-targets',
  authenticate,
  requirePermission('documents:write'),
  validate(linkTargetsSchema),
  (req, res, next) => documentIndexController.linkTargets(req, res, next),
);

// Bulk delete needs documents:delete on top of write; the per-record checks
// still run inside the service for every id.
async function requireBulkPermission(req, res, next) {
  if (req.body?.action !== 'delete' || req.user?.role?.name === 'Admin') return next();
  try {
    if (satisfiesPermission(await loadUserPermissions(req.user), 'documents:delete')) return next();
  } catch (err) { return next(err); }
  return res.status(403).json({ success: false, error: { statusCode: 403, code: 'INSUFFICIENT_PERMISSIONS', message: 'Insufficient permissions. Required: documents:delete', details: [] } });
}
router.post(
  '/bulk',
  authenticate,
  requirePermission('documents:write'),
  validate(bulkDocumentsSchema),
  requireBulkPermission,
  (req, res, next) => documentIndexController.bulk(req, res, next),
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

router.patch(
  '/:id',
  authenticate,
  requirePermission('documents:write'),
  validate(updateDocumentSchema),
  (req, res, next) => documentIndexController.update(req, res, next),
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('documents:delete'),
  validate(documentRecordParamSchema),
  (req, res, next) => documentIndexController.delete(req, res, next),
);

export default router;
