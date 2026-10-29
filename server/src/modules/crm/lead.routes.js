import { Router } from 'express';
import multer from 'multer';
import leadController from './lead.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { uploadLimiter, enrichLimiter, geocodeLimiter } from '../../shared/middleware/rateLimiter.js';
import {
  createLead,
  updateLead,
  listLeads,
  mapLeads,
  leadFilterOptions,
  followUps,
  leadIdParam,
  convertLead,
  duplicates,
  logWhatsApp,
  leadContactLog,
  enrichLead,
  enrichBulk,
  enrichJobIdParam,
  geocodeLead,
  bulkImport,
  bulkDelete,
  bulkAssign,
} from './lead.validation.js';
import { exportLeads, importTemplate } from './leadImportExport.validation.js';
import leadCommunicationRoutes from './leadCommunication.routes.js';
import leadQualificationRoutes from './leadQualification.routes.js';
import { leadScoreRouter } from './leadScoring.routes.js';
import leadTimelineRoutes from './leadTimeline.routes.js';

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
router.get('/filter-options', authenticate, requirePermission('lead:read'), validate(leadFilterOptions), (req, res, next) => leadController.filterOptions(req, res, next));
// Follow-ups agenda across leads (contact-log followUpAt), for the mobile app.
router.get('/follow-ups', authenticate, requirePermission('lead:read'), validate(followUps), (req, res, next) => leadController.followUps(req, res, next));
// Map view: all filtered leads (projected, located-first) + located/unlocated counts.
router.get('/map', authenticate, requirePermission('lead:read'), validate(mapLeads), (req, res, next) => leadController.mapLeads(req, res, next));

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

// Bulk delete / bulk (re)assign — ONE request for all selected ids. POST (with a
// JSON body) matches the rest of the app's bulk endpoints (tasks/customers/
// projects/users) and avoids DELETE/PATCH-body stripping by proxies/CDNs.
router.post('/bulk-delete', authenticate, requirePermission('lead:delete'), validate(bulkDelete), (req, res, next) => leadController.bulkRemove(req, res, next));
router.post('/bulk-assign', authenticate, requirePermission('lead:write'), validate(bulkAssign), (req, res, next) => leadController.bulkAssign(req, res, next));

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

// Geocode a lead from its address (keyless OSM/Nominatim by default; outbound →
// rate-limited). Writes coordinates only when a real location is found.
router.post('/:id/geocode', authenticate, requirePermission('lead:write'), geocodeLimiter, validate(geocodeLead), (req, res, next) => leadController.geocode(req, res, next));

// Lead communication: log a WhatsApp contact (server records only; the client
// opens the wa.me link) and read a lead's logged communications.
router.post('/:id/whatsapp', authenticate, requirePermission('lead:whatsapp'), validate(logWhatsApp), (req, res, next) => leadController.logWhatsApp(req, res, next));
router.get('/:id/contact-log', authenticate, requirePermission('lead:read'), validate(leadContactLog), (req, res, next) => leadController.contactLog(req, res, next));

// Device-originated (mobile SIM call / SMS composer) communications and the
// lead qualification they feed. Sub-routers use mergeParams for :leadId.
router.use('/:leadId/communications', leadCommunicationRoutes);
router.use('/:leadId/qualification', leadQualificationRoutes);
// Explainable score: GET explanation, POST /recalculate.
router.use('/:leadId/score', leadScoreRouter);
// Unified conversation history across every channel (+ merged leads).
router.use('/:leadId/timeline', leadTimelineRoutes);

export default router;
