import { BaseWorker } from '../shared/queue/BaseWorker.js';
import AuditLog from '../modules/auth/auditLog.model.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

/**
 * Audit cleanup worker.
 *
 * Safety net for the TTL index on auth_audit_log.
 * Runs daily and deletes any records past the retention period
 * that the TTL index may have missed (edge cases with clock skew).
 */
export class AuditCleanupWorker extends BaseWorker {
  constructor() {
    super('audit-cleanup');
  }

  async process(job) {
    const retentionDays = config.audit?.retentionDays || 730;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const result = await AuditLog.deleteMany({
      timestamp: { $lt: cutoffDate },
    });

    logger.info('Audit cleanup completed', {
      module: 'jobs',
      action: 'audit-cleanup',
      deletedCount: result.deletedCount,
      cutoffDate: cutoffDate.toISOString(),
    });

    return { deletedCount: result.deletedCount };
  }
}

export default AuditCleanupWorker;
