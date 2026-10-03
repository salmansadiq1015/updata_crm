import discoveryRepository from './discovery.repository.js';
import { enrichResultWithDetails } from './engine/detailsEnricher.js';
import {
  RESULT_MATCHING_STATUS,
  RESULT_IMPORT_STATUS,
} from './discoveryResult.model.js';
import {
  LEAD_IMPORT_MODE,
  LEAD_IMPORT_SELECTION_KIND,
  LEAD_IMPORT_JOB_STATUS,
} from './leadImportJob.model.js';
import queueManager from '../../shared/queue/QueueManager.js';
import auditService from '../auth/audit.service.js';
import { leadImportsTotal } from '../../metrics/index.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

/**
 * Import service — turns discovered businesses into CRM leads (§G / §9 / §27–§34
 * of LEAD_GENERATION_DESIGN.md).
 *
 * SCOPING: discovery results are scoped by createdBy (the importing user owns the
 * session). Lead creation itself is company-wide. The import is IDEMPOTENT and
 * CONCURRENCY-SAFE: each result is claimed atomically (NOT_IMPORTED → QUEUED)
 * and lead creation is guarded by the unique partial googlePlaceId index, so a
 * double "Add All" can never create duplicate leads.
 */

// Imports at or below this many eligible results run synchronously; larger ones
// are handed to the lead-import worker.
export const SYNC_THRESHOLD = 25;

// Lead-import worker processes eligible results in chunks of this size.
export const IMPORT_CHUNK_SIZE = 50;

class ImportService {
  /**
   * Resolve the candidate results for an import run and classify them. Returns
   * the preview counts plus the eligible result docs (the subset that will
   * actually be imported for this mode).
   *
   * Eligibility by mode:
   *   new / skip → matching.status === NEW   && import.status === NOT_IMPORTED
   *   update     → matching.status in {NEW, EXISTING} && import.status === NOT_IMPORTED
   */
  async computeEligibility(sessionId, { mode = LEAD_IMPORT_MODE.NEW, selection = {} } = {}, createdBy) {
    const resultIds = selection?.kind === LEAD_IMPORT_SELECTION_KIND.SELECTED
      ? selection.resultIds
      : undefined;

    const results = await discoveryRepository.findResultsForImport(sessionId, {
      mode,
      resultIds,
      createdBy,
    });

    const counts = {
      total: results.length,
      new: 0,
      existing: 0,
      possibleDuplicates: 0,
      willImport: 0,
    };
    const eligible = [];

    for (const result of results) {
      const matchingStatus = result.matching?.status;
      const importStatus = result.import?.status;

      if (matchingStatus === RESULT_MATCHING_STATUS.NEW) counts.new += 1;
      else if (matchingStatus === RESULT_MATCHING_STATUS.EXISTING) counts.existing += 1;
      else if (matchingStatus === RESULT_MATCHING_STATUS.POSSIBLE_DUPLICATE) counts.possibleDuplicates += 1;

      const notYetImported = importStatus === RESULT_IMPORT_STATUS.NOT_IMPORTED;
      const isEligible = mode === LEAD_IMPORT_MODE.UPDATE
        ? ((matchingStatus === RESULT_MATCHING_STATUS.NEW
            || matchingStatus === RESULT_MATCHING_STATUS.EXISTING) && notYetImported)
        : (matchingStatus === RESULT_MATCHING_STATUS.NEW && notYetImported);

      if (isEligible) {
        counts.willImport += 1;
        eligible.push(result);
      }
    }

    return { counts, eligible };
  }

  /** Server-computed preview counts for the import dialog (§11). */
  async preview(sessionId, options = {}, createdBy) {
    const { counts } = await this.computeEligibility(sessionId, options, createdBy);
    return counts;
  }

  /**
   * Import the eligible results of a session. Small runs (≤ SYNC_THRESHOLD) run
   * inline and return a truthful summary; larger runs create a LeadImportJob,
   * enqueue the worker and return its id (202).
   */
  async importFromSession(sessionId, { mode = LEAD_IMPORT_MODE.NEW, selection = {} } = {}, createdBy, meta = {}) {
    const { eligible } = await this.computeEligibility(sessionId, { mode, selection }, createdBy);

    if (eligible.length <= SYNC_THRESHOLD) {
      const summary = await this.processBatch(eligible, { mode }, createdBy);
      return { summary };
    }

    const LeadImportJob = (await import('./leadImportJob.model.js')).default;
    const job = await LeadImportJob.create({
      createdBy,
      discoverySessionId: sessionId,
      mode,
      selection: {
        kind: selection?.kind || LEAD_IMPORT_SELECTION_KIND.ALL_NEW,
        resultIds: selection?.kind === LEAD_IMPORT_SELECTION_KIND.SELECTED
          ? (selection.resultIds || [])
          : [],
      },
      status: LEAD_IMPORT_JOB_STATUS.QUEUED,
      counts: { total: eligible.length },
    });

    await queueManager.addJob('lead-import', `lead-import-${job._id}`, {
      importJobId: job._id.toString(),
      createdBy: createdBy?.toString?.() ?? createdBy,
    });

    auditService.logEvent({
      eventType: 'lead.bulk_import_queued',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { importJobId: job._id, discoverySessionId: sessionId, mode, total: eligible.length },
      module: 'lead',
    });

    logger.info('Lead import job queued', {
      module: 'businessDiscovery', action: 'import.queue', importJobId: job._id, total: eligible.length,
    });

    return { jobId: job._id };
  }

  /** Add One — import a single discovered result (always synchronous). */
  async importResult(resultId, { mode = LEAD_IMPORT_MODE.NEW } = {}, createdBy, _meta = {}) {
    const result = await discoveryRepository.getResultById(resultId, { createdBy });
    if (!result) throw new NotFoundError('Discovery result', resultId);
    const summary = await this.processBatch([result], { mode }, createdBy);
    return { summary };
  }

  /**
   * Core import loop. Idempotent + concurrency-safe. For each result:
   *  1. atomically claim it (NOT_IMPORTED → QUEUED); a missed guard ⇒ skipped
   *     (another caller already owns it).
   *  2. update mode + existing matched lead ⇒ refresh that lead.
   *  3. non-update mode + existing match ⇒ skip (never duplicate an existing CRM
   *     record).
   *  4. otherwise create a new lead. A duplicate-key (unique googlePlaceId) or
   *     conflict ⇒ link the existing lead and skip; any other error ⇒ failed.
   *
   * `onProgress(summary)` is invoked after every result.
   */
  async processBatch(results = [], { mode = LEAD_IMPORT_MODE.NEW } = {}, createdBy, onProgress) {
    const summary = {
      imported: 0, existing: 0, skipped: 0, failed: 0, duplicates: 0, total: results.length,
    };
    if (!results.length) return summary;

    const { default: leadService } = await import('../crm/lead.service.js');
    const { default: leadRepository } = await import('../crm/lead.repository.js');

    for (const result of results) {
      // 1. Atomic claim.
      let claimed = null;
      try {
        claimed = await discoveryRepository.updateResultImportStatus(
          result._id,
          RESULT_IMPORT_STATUS.QUEUED,
          { expectedStatus: RESULT_IMPORT_STATUS.NOT_IMPORTED, createdBy },
        );
      } catch (err) {
        summary.failed += 1;
        leadImportsTotal.inc({ result: 'failed' });
        logger.error('Lead import claim failed', {
          module: 'businessDiscovery', action: 'import.claim', resultId: result?._id, error: { message: err.message },
        });
        if (onProgress) onProgress(summary);
        continue;
      }
      if (!claimed) {
        summary.skipped += 1;
        leadImportsTotal.inc({ result: 'skipped' });
        if (onProgress) onProgress(summary);
        continue;
      }

      // Lazily fetch Place Details so a result that was never opened in the drawer
      // (e.g. bulk "Add All New") still carries phone / website / address. Idempotent
      // (cached results skip) and best-effort (a provider error imports sweep-only data).
      let working = result;
      if (!working.details?.fetchedAt) {
        const { result: enriched } = await enrichResultWithDetails(working, {
          fieldProfile: 'DETAILS_IMPORT',
          createdBy,
        });
        if (enriched) working = enriched;
      }

      const matchingStatus = working.matching?.status;
      const matchedLeadId = working.matching?.matchedLeadId;

      try {
        if (mode === LEAD_IMPORT_MODE.UPDATE
          && matchingStatus === RESULT_MATCHING_STATUS.EXISTING
          && matchedLeadId) {
          // 2. Refresh an already-linked lead.
          await leadService.update(matchedLeadId, this._mapResultToLeadUpdate(working), { userId: createdBy });
          await discoveryRepository.updateResultImportStatus(result._id, RESULT_IMPORT_STATUS.IMPORTED, {
            createdBy,
            set: { 'import.leadId': matchedLeadId, 'import.importedAt': new Date() },
          });
          summary.imported += 1;
          leadImportsTotal.inc({ result: 'imported' });
        } else if (mode !== LEAD_IMPORT_MODE.UPDATE
          && matchingStatus === RESULT_MATCHING_STATUS.EXISTING) {
          // 3. Skip existing in new/skip mode.
          await discoveryRepository.updateResultImportStatus(result._id, RESULT_IMPORT_STATUS.SKIPPED, {
            createdBy,
            set: matchedLeadId ? { 'import.leadId': matchedLeadId } : {},
          });
          summary.existing += 1;
          leadImportsTotal.inc({ result: 'skipped' });
        } else {
          // 4. Create a new lead.
          const lead = await leadService.create(this.mapResultToLead(working), createdBy);
          await discoveryRepository.updateResultImportStatus(result._id, RESULT_IMPORT_STATUS.IMPORTED, {
            createdBy,
            set: { 'import.leadId': lead._id, 'import.importedAt': new Date() },
          });
          summary.imported += 1;
          leadImportsTotal.inc({ result: 'imported' });
        }
      } catch (err) {
        if (this._isDuplicateKey(err)) {
          // Another lead already backs this place → link it and skip.
          const placeId = result.provider?.placeId;
          let existingLeadId = null;
          try {
            const [existing] = await leadRepository.findByPlaceIds([placeId].filter(Boolean));
            existingLeadId = existing?._id ?? null;
          } catch { /* best-effort link; the skip itself still stands */ }
          await discoveryRepository.updateResultImportStatus(result._id, RESULT_IMPORT_STATUS.SKIPPED, {
            createdBy,
            set: existingLeadId ? { 'import.leadId': existingLeadId } : {},
          });
          summary.duplicates += 1;
          leadImportsTotal.inc({ result: 'skipped' });
        } else {
          await discoveryRepository.updateResultImportStatus(result._id, RESULT_IMPORT_STATUS.FAILED, {
            createdBy,
            set: { 'import.error': { code: String(err.code || ERROR_CODES.LEAD_IMPORT_FAILED), message: err.message } },
          });
          summary.failed += 1;
          leadImportsTotal.inc({ result: 'failed' });
          logger.warn('Lead import row failed', {
            module: 'businessDiscovery', action: 'import.processBatch', resultId: result._id, error: { message: err.message },
          });
        }
      }

      if (onProgress) onProgress(summary);
    }

    return summary;
  }

  /** Fetch a lead-import job (scoped to its owner) as a DTO. */
  async getImportJob(jobId, createdBy) {
    const LeadImportJob = (await import('./leadImportJob.model.js')).default;
    const filter = { _id: jobId };
    if (createdBy) filter.createdBy = createdBy;
    const job = await LeadImportJob.findOne(filter).lean();
    if (!job) throw new NotFoundError('Lead import job', jobId);
    return this.toImportJobDTO(job);
  }

  toImportJobDTO(job) {
    if (!job) return null;
    return {
      id: job._id,
      status: job.status,
      mode: job.mode,
      selection: job.selection,
      discoverySessionId: job.discoverySessionId,
      counts: job.counts,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  /**
   * Map a discovery result → a lead creation DTO (§72). Preserves source/geo
   * provenance; never fabricates contact fields that the provider did not give.
   */
  mapResultToLead(result) {
    const business = result.business || {};
    const context = result.discoveryContext || {};
    const businessType = Array.isArray(context.businessTypeIds) && context.businessTypeIds.length
      ? context.businessTypeIds.join(',').slice(0, 120)
      : null;

    return {
      name: business.name,
      type: 'business',
      address: {
        street: business.address?.street ?? null,
        city: business.address?.city ?? null,
        postalCode: business.address?.postalCode ?? null,
        canton: business.address?.canton ?? null,
        country: business.address?.country || 'CH',
      },
      phone: business.phone ?? null,
      mobile: null,
      email: business.email ?? null,
      website: business.website ?? null,
      location: business.location ?? null, // GeoJSON Point [lng, lat]
      providerMeta: {
        rating: business.rating ?? null,
        reviewCount: business.reviewCount ?? null,
        priceLevel: business.priceLevel ?? null,
      },
      source: 'google_places',
      sourceMetadata: {
        googlePlaceId: result.provider?.placeId ?? null,
        discoverySessionId: result.discoverySessionId ?? null,
        discoveryResultId: result._id ?? null,
        businessType,
        keyword: context.keyword ?? null,
        discoveredAt: result.discoveredAt ?? null,
      },
    };
  }

  /** Subset of the mapped fields used to refresh an existing lead (update mode). */
  _mapResultToLeadUpdate(result) {
    const business = result.business || {};
    return {
      name: business.name,
      phone: business.phone ?? null,
      email: business.email ?? null,
      website: business.website ?? null,
      address: {
        street: business.address?.street ?? null,
        city: business.address?.city ?? null,
        postalCode: business.address?.postalCode ?? null,
        canton: business.address?.canton ?? null,
        country: business.address?.country || 'CH',
      },
      location: business.location ?? null,
      providerMeta: {
        rating: business.rating ?? null,
        reviewCount: business.reviewCount ?? null,
        priceLevel: business.priceLevel ?? null,
      },
    };
  }

  /** True for a Mongo duplicate-key (11000) or an application conflict. */
  _isDuplicateKey(err) {
    if (!err) return false;
    if (err.code === 11000 || err.code === '11000') return true;
    if (err.statusCode === 409) return true;
    if (err.code === ERROR_CODES.CONFLICT
      || err.code === ERROR_CODES.LEAD_DUPLICATE
      || err.code === ERROR_CODES.LEAD_ALREADY_IMPORTED) return true;
    return false;
  }
}

const importService = new ImportService();
export default importService;
