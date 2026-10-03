import { Router } from 'express';
import importController from './import.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  importPreviewRoute,
  importSessionRoute,
  importResultRoute,
  importJobIdParam,
} from './import.validation.js';

/**
 * Lead-import routes (§11). Mounted under /api/v1/business-discovery by the
 * orchestrator. Middleware order: authenticate → requirePermission → validate →
 * controller. All import endpoints are gated on lead:import.
 */
const router = Router();

// Server-computed preview of how many leads a session import would create.
router.get('/sessions/:id/import/preview', authenticate, requirePermission('lead:import'), validate(importPreviewRoute), (req, res, next) => importController.preview(req, res, next));

// Bulk import (Add All New / Add Selected) → sync summary or 202 { jobId }.
router.post('/sessions/:id/import', authenticate, requirePermission('lead:import'), validate(importSessionRoute), (req, res, next) => importController.importSession(req, res, next));

// Add One — import a single discovered result.
router.post('/results/:resultId/import', authenticate, requirePermission('lead:import'), validate(importResultRoute), (req, res, next) => importController.importResult(req, res, next));

// Import-job progress / summary.
router.get('/import-jobs/:jobId', authenticate, requirePermission('lead:import'), validate(importJobIdParam), (req, res, next) => importController.getImportJob(req, res, next));

export default router;
