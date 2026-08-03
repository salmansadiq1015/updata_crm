import { Router } from 'express';
import multer from 'multer';
import ighController from './igh.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  updateIghConfigSchema,
  importJobParamSchema,
  importHistorySchema,
  previewImportSchema,
} from './igh.validation.js';

const router = Router();
// Yearly supplier catalog files (Nussbaum ~11MB) — allow up to 60MB XML.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

// Config
router.get('/config', authenticate, requirePermission('catalog:admin'), (req, res, next) => ighController.getConfig(req, res, next));
router.put('/config', authenticate, requirePermission('catalog:admin'), validate(updateIghConfigSchema), (req, res, next) => ighController.updateConfig(req, res, next));

// Import triggers
router.post('/import/upload', authenticate, requirePermission('catalog:manage'), upload.single('file'), (req, res, next) => ighController.uploadImport(req, res, next));
router.post('/import/preview', authenticate, requirePermission('catalog:manage'), validate(previewImportSchema), (req, res, next) => ighController.previewImport(req, res, next));
router.post('/import/:jobId/approve', authenticate, requirePermission('catalog:manage'), validate(importJobParamSchema), (req, res, next) => ighController.approveImport(req, res, next));
router.post('/import/full', authenticate, requirePermission('catalog:admin'), (req, res, next) => ighController.triggerFullImport(req, res, next));
router.post('/import/delta', authenticate, requirePermission('catalog:admin'), (req, res, next) => ighController.triggerDeltaImport(req, res, next));

// Import history (BEFORE :jobId to avoid route conflicts)
router.get('/import/history', authenticate, requirePermission('catalog:admin'), validate(importHistorySchema), (req, res, next) => ighController.getImportHistory(req, res, next));

// Import job details
router.get('/import/:jobId', authenticate, requirePermission('catalog:admin'), validate(importJobParamSchema), (req, res, next) => ighController.getImportJob(req, res, next));
router.get('/import/:jobId/log', authenticate, requirePermission('catalog:admin'), validate(importJobParamSchema), (req, res, next) => ighController.getImportLog(req, res, next));

export default router;
