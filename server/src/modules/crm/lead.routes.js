import { Router } from 'express';
import multer from 'multer';
import leadController from './lead.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { uploadLimiter, enrichLimiter } from '../../shared/middleware/rateLimiter.js';
import {
  createLead,
  updateLead,
  listLeads,
  leadIdParam,
  convertLead,
  duplicates,
  logWhatsApp,
  leadContactLog,
  enrichLead,
  enrichBulk,
  enrichJobIdParam,
  bulkImport,
} from './lead.validation.js';
import { exportLeads, importTemplate } from './leadImportExport.validation.js';

/**
 * Lead routes — mounted at /api/v1/crm/leads by crm.routes.js (§11).
 * Middleware order: authenticate → requirePermission → validate → controller.
 * Named routes are registered BEFORE /:id so they are not read as an id.
 */
const router = Router();

// Multer: memory storage — the import service parses the buffer in-process.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Named routes BEFORE /:id
router.get('/duplicates', authenticate, requirePermission('lead:read'), validate(duplicates), (req, res, next) => leadController.duplicates(req, res, next));
router.get('/filter-options', authenticate, requirePermission('lead:read'), (req, res, next) => leadController.filterOptions(req, res, next));

// Import / export (named routes, BEFORE /:id)
router.post('/import', authenticate, requirePermission('lead:import'), uploadLimiter, upload.single('file'), (req, res, next) => leadController.importLeads(req, res, next));
// Structured JSON batches are already bounded by validation (500 records) and
// the global API limiter. Do not pass them through the file-upload limiter:
// that limiter has a separate Redis store/keyspace and is only for multipart
// uploads, so a limiter/storage fault must not turn a valid JSON import into a
// 500 after authentication.
router.post('/bulk-import', authenticate, requirePermission('lead:import'), validate(bulkImport), (req, res, next) => leadController.bulkImport(req, res, next));
router.get('/import/template', authenticate, requirePermission('lead:import'), validate(importTemplate), (req, res, next) => leadController.downloadTemplate(req, res, next));
router.get('/export', authenticate, requirePermission('lead:read'), validate(exportLeads), (req, res, next) => leadController.exportLeads(req, res, next));

// Website enrichment (named routes, BEFORE /:id). The outbound sync + bulk
// routes are rate-limited per user; the job-status poll is not.
router.post('/enrich-bulk', authenticate, requirePermission('lead:enrich'), enrichLimiter, validate(enrichBulk), (req, res, next) => leadController.enrichBulk(req, res, next));
router.get('/enrich-jobs/:jobId', authenticate, requirePermission('lead:read'), validate(enrichJobIdParam), (req, res, next) => leadController.getEnrichJob(req, res, next));

// Standard CRUD
router.get('/', authenticate, requirePermission('lead:read'), validate(listLeads), (req, res, next) => leadController.list(req, res, next));
router.post('/', authenticate, requirePermission('lead:write'), validate(createLead), (req, res, next) => leadController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('lead:read'), validate(leadIdParam), (req, res, next) => leadController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('lead:write'), validate(updateLead), (req, res, next) => leadController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('lead:delete'), validate(leadIdParam), (req, res, next) => leadController.remove(req, res, next));

// Convert a lead into a customer
router.post('/:id/convert', authenticate, requirePermission('lead:convert'), validate(convertLead), (req, res, next) => leadController.convert(req, res, next));

// Enrich a single lead from its website (synchronous, outbound → rate-limited)
router.post('/:id/enrich', authenticate, requirePermission('lead:enrich'), enrichLimiter, validate(enrichLead), (req, res, next) => leadController.enrich(req, res, next));

// Lead communication: log a WhatsApp contact (server records only; the client
// opens the wa.me link) and read a lead's logged communications.
router.post('/:id/whatsapp', authenticate, requirePermission('lead:whatsapp'), validate(logWhatsApp), (req, res, next) => leadController.logWhatsApp(req, res, next));
router.get('/:id/contact-log', authenticate, requirePermission('lead:read'), validate(leadContactLog), (req, res, next) => leadController.contactLog(req, res, next));

export default router;
