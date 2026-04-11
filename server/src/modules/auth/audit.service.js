import auditLogRepository from './auditLog.repository.js';
import queueManager from '../../shared/queue/QueueManager.js';
import logger from '../../shared/logger/index.js';

/**
 * Audit service — handles audit log writing and querying.
 *
 * Write operations are async via BullMQ queue to never block the request path.
 * Read operations go directly to the repository.
 */
class AuditService {
  /**
   * Enqueue an audit log entry for async writing.
   * This is fire-and-forget from the caller's perspective.
   */
  async logEvent(data) {
    try {
      await queueManager.addJob('audit-log', 'write-audit', {
        timestamp: new Date().toISOString(),
        eventType: data.eventType,
        userId: data.userId?.toString() || null,
        email: data.email || null,
        ipAddress: data.ipAddress || 'unknown',
        userAgent: data.userAgent || null,
        result: data.result || 'success',
        details: data.details || null,
        module: data.module || 'auth',
      });
    } catch (err) {
      // If queue is unavailable, write directly as fallback
      logger.error('Failed to enqueue audit log — writing directly', {
        module: 'audit',
        action: 'logEvent',
        error: { message: err.message },
      });
      try {
        await auditLogRepository.create({
          ...data,
          timestamp: new Date(),
          userId: data.userId?.toString() || null,
        });
      } catch (directErr) {
        logger.error('CRITICAL: Failed to write audit log directly', {
          module: 'audit',
          action: 'logEvent',
          error: { message: directErr.message },
          auditData: data,
        });
      }
    }
  }

  /**
   * Query audit logs with cursor pagination and filters.
   */
  async query(params) {
    return auditLogRepository.findWithCursor(params);
  }

  /**
   * Get export cursor for streaming.
   */
  getExportCursor(filters) {
    return auditLogRepository.findForExport(filters);
  }
}

const auditService = new AuditService();
export default auditService;
