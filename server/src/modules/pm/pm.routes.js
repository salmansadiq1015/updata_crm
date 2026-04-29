import { Router } from 'express';
import multer from 'multer';
import projectRoutes from './project.routes.js';
import statusController from './status.controller.js';
import prepActionController from './prepAction.controller.js';
import scheduleController from './schedule.controller.js';
import documentController from './document.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { transitionStatusSchema, statusHistorySchema } from './status.validation.js';
import {
  createPrepActionSchema, updatePrepActionSchema, prepActionIdParamSchema,
} from './prepAction.validation.js';
import {
  createEntrySchema, updateEntrySchema, deleteEntrySchema,
  sendConfirmationSchema, updateConfirmationSchema, exportScheduleSchema,
} from './schedule.validation.js';
import {
  listDocumentsSchema, uploadDocumentSchema, generateDocumentSchema,
  documentIdParamSchema, updateDocumentSchema, restoreDocumentSchema,
} from './document.validation.js';

/**
 * PM route aggregator.
 * Mounts all PM sub-routers under /api/v1/pm.
 *
 * URL structure:
 *   /api/v1/pm/projects                                        — project CRUD
 *   /api/v1/pm/projects/:id/status                              — status transition
 *   /api/v1/pm/projects/:id/status/history                      — status history
 *   /api/v1/pm/projects/:id/prep-actions                        — prep action CRUD
 *   /api/v1/pm/projects/:id/schedule                            — schedule entries
 *   /api/v1/pm/projects/:id/schedule/entries/:entryId           — entry CRUD
 *   /api/v1/pm/projects/:id/schedule/entries/:entryId/confirmations — partner confirmations
 *   /api/v1/pm/projects/:id/documents                           — document CRUD
 */
const router = Router();

// File upload config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// --- Project routes ---
router.use('/projects', projectRoutes);

// --- Status sub-routes ---
router.post(
  '/projects/:id/status',
  authenticate,
  requirePermission('projects:write'),
  validate(transitionStatusSchema),
  (req, res, next) => statusController.transitionStatus(req, res, next),
);
router.get(
  '/projects/:id/status/history',
  authenticate,
  requirePermission('projects:read'),
  validate(statusHistorySchema),
  (req, res, next) => statusController.getStatusHistory(req, res, next),
);

// --- Prep action sub-routes ---
const prepActionRouter = Router({ mergeParams: true });
prepActionRouter.get(
  '/',
  authenticate,
  requirePermission('projects:read'),
  (req, res, next) => prepActionController.list(req, res, next),
);
prepActionRouter.post(
  '/',
  authenticate,
  requirePermission('projects:write'),
  validate(createPrepActionSchema),
  (req, res, next) => prepActionController.create(req, res, next),
);
prepActionRouter.get(
  '/:actionId',
  authenticate,
  requirePermission('projects:read'),
  validate(prepActionIdParamSchema),
  (req, res, next) => prepActionController.getById(req, res, next),
);
prepActionRouter.patch(
  '/:actionId',
  authenticate,
  requirePermission('projects:write'),
  validate(updatePrepActionSchema),
  (req, res, next) => prepActionController.update(req, res, next),
);
prepActionRouter.delete(
  '/:actionId',
  authenticate,
  requirePermission('projects:delete'),
  validate(prepActionIdParamSchema),
  (req, res, next) => prepActionController.delete(req, res, next),
);
router.use('/projects/:id/prep-actions', prepActionRouter);

// --- Schedule sub-routes ---
const scheduleRouter = Router({ mergeParams: true });
scheduleRouter.get(
  '/',
  authenticate,
  requirePermission('projects:read'),
  (req, res, next) => scheduleController.getSchedule(req, res, next),
);
scheduleRouter.get(
  '/export',
  authenticate,
  requirePermission('projects:read'),
  validate(exportScheduleSchema),
  (req, res, next) => scheduleController.exportSchedule(req, res, next),
);
scheduleRouter.post(
  '/entries',
  authenticate,
  requirePermission('projects:write'),
  validate(createEntrySchema),
  (req, res, next) => scheduleController.addEntry(req, res, next),
);
scheduleRouter.patch(
  '/entries/:entryId',
  authenticate,
  requirePermission('projects:write'),
  validate(updateEntrySchema),
  (req, res, next) => scheduleController.updateEntry(req, res, next),
);
scheduleRouter.delete(
  '/entries/:entryId',
  authenticate,
  requirePermission('projects:delete'),
  validate(deleteEntrySchema),
  (req, res, next) => scheduleController.deleteEntry(req, res, next),
);
scheduleRouter.post(
  '/entries/:entryId/confirmations',
  authenticate,
  requirePermission('projects:write'),
  validate(sendConfirmationSchema),
  (req, res, next) => scheduleController.sendConfirmation(req, res, next),
);
scheduleRouter.patch(
  '/entries/:entryId/confirmations/:confId',
  authenticate,
  requirePermission('projects:write'),
  validate(updateConfirmationSchema),
  (req, res, next) => scheduleController.updateConfirmationResponse(req, res, next),
);
router.use('/projects/:id/schedule', scheduleRouter);

// --- Document sub-routes ---
const documentRouter = Router({ mergeParams: true });
documentRouter.get(
  '/',
  authenticate,
  requirePermission('projects:read'),
  validate(listDocumentsSchema),
  (req, res, next) => documentController.list(req, res, next),
);
documentRouter.post(
  '/',
  authenticate,
  requirePermission('projects:write'),
  upload.single('file'),
  validate(uploadDocumentSchema),
  (req, res, next) => documentController.upload(req, res, next),
);
documentRouter.post(
  '/generate',
  authenticate,
  requirePermission('projects:write'),
  validate(generateDocumentSchema),
  (req, res, next) => documentController.generate(req, res, next),
);
documentRouter.get(
  '/:docId',
  authenticate,
  requirePermission('projects:read'),
  validate(documentIdParamSchema),
  (req, res, next) => documentController.getById(req, res, next),
);
documentRouter.get(
  '/:docId/download',
  authenticate,
  requirePermission('projects:read'),
  validate(documentIdParamSchema),
  (req, res, next) => documentController.download(req, res, next),
);
documentRouter.patch(
  '/:docId',
  authenticate,
  requirePermission('projects:write'),
  validate(updateDocumentSchema),
  (req, res, next) => documentController.updateMetadata(req, res, next),
);
documentRouter.post(
  '/:docId/restore',
  authenticate,
  requirePermission('projects:write'),
  validate(restoreDocumentSchema),
  (req, res, next) => documentController.restore(req, res, next),
);
documentRouter.delete(
  '/:docId',
  authenticate,
  requirePermission('projects:delete'),
  validate(documentIdParamSchema),
  (req, res, next) => documentController.delete(req, res, next),
);
router.use('/projects/:id/documents', documentRouter);

export default router;
