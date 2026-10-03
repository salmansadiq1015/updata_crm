import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

/**
 * Lead-import worker (§G / §9 / §10).
 *
 * Processes a LeadImportJob: fetches the eligible discovery results, imports
 * them in chunks (persisting running counts + progress), and finalizes the job
 * as COMPLETED or PARTIAL. The import itself is idempotent + concurrency-safe
 * (atomic per-result claim + unique googlePlaceId index), so a crash/retry can
 * never create duplicate leads.
 */
export class LeadImportWorker extends BaseWorker {
  constructor() {
    super('lead-import');
  }

  /** Terminal jobs are never reprocessed (idempotency). FAILED stays retryable. */
  async isAlreadyDone(job) {
    const { importJobId } = job.data;
    if (!importJobId) return false;
    const LeadImportJob = (await import('../modules/businessDiscovery/leadImportJob.model.js')).default;
    const { LEAD_IMPORT_JOB_STATUS } = await import('../modules/businessDiscovery/leadImportJob.model.js');
    const doc = await LeadImportJob.findById(importJobId).lean();
    if (!doc) return false;
    return [
      LEAD_IMPORT_JOB_STATUS.COMPLETED,
      LEAD_IMPORT_JOB_STATUS.PARTIAL,
      LEAD_IMPORT_JOB_STATUS.CANCELLED,
    ].includes(doc.status);
  }

  async process(job) {
    const { importJobId } = job.data;

    const LeadImportJobModule = await import('../modules/businessDiscovery/leadImportJob.model.js');
    const LeadImportJob = LeadImportJobModule.default;
    const { LEAD_IMPORT_JOB_STATUS } = LeadImportJobModule;
    const { default: importService, IMPORT_CHUNK_SIZE } = await import('../modules/businessDiscovery/import.service.js');

    const jobDoc = await LeadImportJob.findById(importJobId).lean();
    if (!jobDoc) {
      logger.warn('Lead import job not found — nothing to process', {
        module: 'jobs', action: 'lead-import', importJobId,
      });
      return { importJobId, skipped: true };
    }

    const createdBy = job.data.createdBy || jobDoc.createdBy;
    const { mode, selection, discoverySessionId } = jobDoc;

    try {
      await LeadImportJob.findByIdAndUpdate(importJobId, {
        status: LEAD_IMPORT_JOB_STATUS.RUNNING,
        startedAt: new Date(),
      });

      // Resolve the eligible results (same classification as the sync path).
      const { eligible } = await importService.computeEligibility(
        discoverySessionId,
        { mode, selection },
        createdBy,
      );

      const total = eligible.length;
      const agg = { imported: 0, existing: 0, skipped: 0, failed: 0, duplicates: 0 };
      let processed = 0;

      await LeadImportJob.findByIdAndUpdate(importJobId, { 'counts.total': total });

      for (let i = 0; i < eligible.length; i += IMPORT_CHUNK_SIZE) {
        const chunk = eligible.slice(i, i + IMPORT_CHUNK_SIZE);
        const summary = await importService.processBatch(chunk, { mode }, createdBy);

        agg.imported += summary.imported;
        agg.existing += summary.existing;
        agg.skipped += summary.skipped;
        agg.failed += summary.failed;
        agg.duplicates += summary.duplicates;
        processed += chunk.length;

        await job.updateProgress(Math.round((processed / Math.max(total, 1)) * 100));
        await LeadImportJob.findByIdAndUpdate(importJobId, {
          'counts.processed': processed,
          'counts.created': agg.imported,
          'counts.existing': agg.existing,
          'counts.duplicates': agg.duplicates,
          'counts.skipped': agg.skipped,
          'counts.failed': agg.failed,
        });
      }

      const finalStatus = agg.failed > 0
        ? LEAD_IMPORT_JOB_STATUS.PARTIAL
        : LEAD_IMPORT_JOB_STATUS.COMPLETED;

      await LeadImportJob.findByIdAndUpdate(importJobId, {
        status: finalStatus,
        completedAt: new Date(),
        'counts.total': total,
        'counts.processed': processed,
        'counts.created': agg.imported,
        'counts.existing': agg.existing,
        'counts.duplicates': agg.duplicates,
        'counts.skipped': agg.skipped,
        'counts.failed': agg.failed,
        log: `Import ${finalStatus}: created ${agg.imported}, existing ${agg.existing}, duplicates ${agg.duplicates}, skipped ${agg.skipped}, failed ${agg.failed} of ${total}.`,
      });

      // Audit (lazy to avoid any bootstrap ordering issue).
      const { default: auditService } = await import('../modules/auth/audit.service.js');
      auditService.logEvent({
        eventType: 'lead.bulk_import_completed',
        userId: createdBy,
        ipAddress: 'internal',
        result: agg.failed > 0 ? 'partial' : 'success',
        details: { importJobId, discoverySessionId, mode, total, ...agg },
        module: 'lead',
      });

      // Best-effort in-app notification to the importing user.
      try {
        const { default: notificationService } = await import('../modules/notifications/notification.service.js');
        await notificationService.create({
          type: 'lead.bulk_import_completed',
          category: 'CRM',
          priority: 'NORMAL',
          channels: ['IN_APP'],
          recipientIds: [createdBy],
          sourceModule: 'businessDiscovery',
          sourceEvent: 'lead.bulk_import_completed',
          payload: {
            title: 'Lead import completed',
            body: `Imported ${agg.imported} lead(s). ${agg.existing + agg.duplicates} existing/duplicate, ${agg.failed} failed.`,
            importJobId: String(importJobId),
            discoverySessionId: discoverySessionId ? String(discoverySessionId) : null,
            status: finalStatus,
            counts: { total, ...agg },
          },
        }, createdBy);
      } catch (notifyErr) {
        logger.warn('Lead import completion notification failed (ignored)', {
          module: 'jobs', action: 'lead-import', importJobId, error: { message: notifyErr.message },
        });
      }

      logger.info('Lead import job finished', {
        module: 'jobs', action: 'lead-import', importJobId, status: finalStatus, total, ...agg,
      });

      return { importJobId, status: finalStatus, total, ...agg };
    } catch (err) {
      await LeadImportJob.findByIdAndUpdate(importJobId, {
        status: LEAD_IMPORT_JOB_STATUS.FAILED,
        completedAt: new Date(),
        error: { code: String(err.code || 'LEAD_IMPORT_FAILED'), message: err.message },
        log: `Import failed: ${err.message}`,
      });

      logger.error('Lead import job failed', {
        module: 'jobs', action: 'lead-import', importJobId, error: { message: err.message, stack: err.stack },
      });

      throw err;
    }
  }
}

export default LeadImportWorker;
