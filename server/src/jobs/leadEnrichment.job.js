import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Lead-enrichment worker (§lead module).
 *
 * Processes a LeadEnrichmentJob: enriches each of the job's leads from its
 * website in BOUNDED concurrency (config.enrichment.concurrency), with per-lead
 * try/catch and a politeness delay between requests to the same host. The queue
 * concurrency is kept low (per-lead fan-out happens inside the service); terminal
 * jobs are never reprocessed (idempotency).
 */
export class LeadEnrichmentWorker extends BaseWorker {
  constructor() {
    super('lead-enrichment');
  }

  /** Terminal jobs are never reprocessed. FAILED stays retryable. */
  async isAlreadyDone(job) {
    const { enrichmentJobId } = job.data;
    if (!enrichmentJobId) return false;
    const { default: LeadEnrichmentJob, LEAD_ENRICHMENT_JOB_STATUS } = await import('../modules/crm/leadEnrichmentJob.model.js');
    const doc = await LeadEnrichmentJob.findById(enrichmentJobId).lean();
    if (!doc) return false;
    return [
      LEAD_ENRICHMENT_JOB_STATUS.COMPLETED,
      LEAD_ENRICHMENT_JOB_STATUS.PARTIAL,
      LEAD_ENRICHMENT_JOB_STATUS.CANCELLED,
    ].includes(doc.status);
  }

  async process(job) {
    const { enrichmentJobId } = job.data;
    if (!enrichmentJobId) {
      logger.warn('Lead enrichment job missing enrichmentJobId — nothing to process', {
        module: 'jobs', action: 'lead-enrichment', jobId: job.id,
      });
      return { skipped: true };
    }

    const { default: leadEnrichmentService } = await import('../modules/crm/leadEnrichment.service.js');
    return leadEnrichmentService.runEnrichmentJob(enrichmentJobId, {
      onProgress: (percent) => job.updateProgress(percent),
    });
  }
}

export default LeadEnrichmentWorker;
