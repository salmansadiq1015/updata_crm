import leadService from './lead.service.js';
import leadEnrichmentService from './leadEnrichment.service.js';
import leadImportExportService from './leadImportExport.service.js';
import { IMPORT_MODES } from './leadImportExport.validation.js';
import { ValidationError } from '../../shared/errors/AppError.js';

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

  async filterOptions(_req, res, next) {
    try {
      const data = await leadService.getFilterOptions();
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
      return res.success({ data, message: 'Lead import processed' });
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
