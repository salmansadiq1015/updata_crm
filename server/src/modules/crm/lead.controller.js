import leadService from './lead.service.js';
import leadFollowUpService from './leadFollowUp.service.js';
import leadEnrichmentService from './leadEnrichment.service.js';
import leadImportExportService from './leadImportExport.service.js';
import extensionImportService from '../extension/extensionImport.service.js';
import { IMPORT_MODES } from './leadImportExport.validation.js';
import { ValidationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

/**
 * Lead controller (§11). Identity is always derived from req.user._id — never
 * from the client. Leads are shared company-wide, so reads are not scoped by
 * the caller; createdBy is recorded on create for provenance only.
 */
class LeadController {
  async list(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const result = await leadService.list(query);
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) { next(err); }
  }

  async filterOptions(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await leadService.getFilterOptions(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  /**
   * Leads for the map view: the whole filtered set (projected, located-first)
   * plus located/unlocated counts. Not cursor-paginated — the map fits bounds,
   * clusters and syncs the sidebar list over the complete set at once.
   */
  async mapLeads(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await leadService.listForMap(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  /** Upcoming / overdue follow-ups across leads (ascending, capped at 200). */
  async followUps(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await leadFollowUpService.listLegacy(query, req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async create(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const lead = await leadService.create(req.body, req.user._id, meta);
      return res.success({ data: lead, message: 'Lead created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async getById(req, res, next) {
    try {
      const lead = await leadService.getById(req.params.id);
      return res.success({ data: lead });
    } catch (err) { next(err); }
  }

  async update(req, res, next) {
    try {
      const meta = { userId: req.user._id, ipAddress: req.ip, userAgent: req.get('user-agent') };
      const lead = await leadService.update(req.params.id, req.body, meta);
      return res.success({ data: lead, message: 'Lead updated successfully' });
    } catch (err) { next(err); }
  }

  async remove(req, res, next) {
    try {
      const meta = { userId: req.user._id, ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await leadService.softDelete(req.params.id, meta);
      return res.success({ data: result, message: 'Lead deleted successfully' });
    } catch (err) { next(err); }
  }

  /** Bulk soft-delete — ONE request, ONE updateMany. Returns an accurate count. */
  async bulkRemove(req, res, next) {
    try {
      const meta = { userId: req.user._id, ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await leadService.bulkSoftDelete(req.body.leadIds, meta);
      return res.success({
        data: result,
        message: `${result.deleted} lead(s) deleted`,
      });
    } catch (err) { next(err); }
  }

  /** Bulk (re)assign — ONE request, ONE updateMany. Returns an accurate count. */
  async bulkAssign(req, res, next) {
    try {
      const meta = { userId: req.user._id, ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await leadService.bulkAssign(req.body.leadIds, req.body.assignedTo ?? null, meta);
      return res.success({
        data: result,
        message: `${result.updated} lead(s) updated`,
      });
    } catch (err) { next(err); }
  }

  async convert(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await leadService.convertToCustomer(
        req.params.id,
        { assignedTo: req.body.assignedTo, note: req.body.note },
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Lead converted to customer successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async duplicates(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const data = await leadService.findDuplicates(query);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  /**
   * Log a WhatsApp contact for a lead. The server only records the event; the
   * client opens the wa.me link. Responds with { waNumber, logged } so the
   * client can build https://wa.me/<waNumber>?text=<message>.
   */
  async logWhatsApp(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await leadService.logWhatsApp(req.params.id, req.body, req.user._id, meta);
      return res.success({ data: result, message: 'WhatsApp contact logged' });
    } catch (err) { next(err); }
  }

  /**
   * Geocode a lead from its address and store the coordinates on success. The
   * response always carries the lead plus { geocoded, reason? }, so the client
   * can report honestly whether a real location was found (never invents one).
   */
  async geocode(req, res, next) {
    try {
      const meta = { userId: req.user._id, ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await leadService.geocodeLead(req.params.id, meta);
      return res.success({
        data: result,
        message: result.geocoded ? 'Lead geocoded' : 'Lead could not be geocoded from its address',
      });
    } catch (err) { next(err); }
  }

  /** A lead's logged communications (contact-log entries), newest first. */
  async contactLog(req, res, next) {
    try {
      const data = await leadService.listCommunications(req.params.id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  /**
   * Enrich a single lead from its website (synchronous). Fills only missing
   * contact fields and responds with { lead, found, applied }. A dead/blocked
   * site does not error — the lead's enrichment status reflects the outcome.
   */
  async enrich(req, res, next) {
    try {
      const meta = { userId: req.user._id, ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await leadEnrichmentService.enrichLead(req.params.id, req.user._id, meta);
      return res.success({
        data: { lead: result.lead, found: result.found, applied: result.applied },
        message: 'Lead enriched',
      });
    } catch (err) { next(err); }
  }

  /** Queue a bulk website-enrichment run for up to 500 leads; responds 202 with { jobId }. */
  async enrichBulk(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await leadEnrichmentService.enrichLeadsBulk(req.body.leadIds, req.user._id, meta);
      return res.success({ data: result, message: 'Lead enrichment queued', statusCode: 202 });
    } catch (err) { next(err); }
  }

  /** Status + counts of a bulk lead-enrichment job (scoped to its owner). */
  async getEnrichJob(req, res, next) {
    try {
      const data = await leadEnrichmentService.getEnrichJob(req.params.jobId, req.user._id);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  /**
   * Import leads from an uploaded CSV / Excel / PDF file (multipart field 'file').
   * `mode` is validated here because a multipart body + Joi stripUnknown would
   * strip the multer file field.
   */
  async importLeads(req, res, next) {
    try {
      if (!req.file || !req.file.buffer) {
        throw new ValidationError('An import file is required', [{ field: 'file', message: 'An import file is required' }]);
      }

      const mode = req.body?.mode ?? 'new';
      if (!IMPORT_MODES.includes(mode)) {
        throw new ValidationError('Invalid import mode', [
          { field: 'mode', message: `mode must be one of: ${IMPORT_MODES.join(', ')}` },
        ]);
      }

      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await leadImportExportService.importLeads(
        {
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
          mode,
        },
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Lead import processed' });
    } catch (err) { next(err); }
  }

  /** Import structured batches from the local-first browser extension. */
  async bulkImport(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent'), requestId: req.requestId };
      const data = await leadImportExportService.importExtensionLeads(req.body.leads, req.user._id, meta);

      // Record run-level progress + stream it to the user (best-effort: tracking
      // must never break the import the user already completed).
      let job = null;
      const { importId, importTotal, importFinal } = req.body;
      if (importId) {
        try {
          job = await extensionImportService.recordBatch(req.user._id, {
            importId,
            importTotal,
            importFinal: Boolean(importFinal),
            batch: {
              processed: data.total,
              created: data.created,
              existing: data.existing,
              failed: data.failed,
            },
          });
        } catch (trackErr) {
          logger.warn('Extension import tracking failed (non-blocking)', {
            module: 'crm', action: 'lead.bulkImport.track', requestId: req.requestId,
            error: { message: trackErr.message },
          });
        }
      }

      return res.success({ data: { ...data, job }, message: 'Lead import processed' });
    } catch (err) { next(err); }
  }

  /** Export matching leads as CSV / Excel / PDF (streamed as an attachment). */
  async exportLeads(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { format, q, ...filters } = query;
      const { filename, contentType, buffer } = await leadImportExportService.exportLeads(
        { format, filters: { ...filters, search: q } },
        req.user._id,
      );
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    } catch (err) { next(err); }
  }

  /** Download an import template (CSV / Excel) with the documented columns. */
  async downloadTemplate(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { filename, contentType, buffer } = await leadImportExportService.buildTemplate(query.format);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    } catch (err) { next(err); }
  }
}

const leadController = new LeadController();
export default leadController;
