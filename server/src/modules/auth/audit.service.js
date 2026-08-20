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

  /**
   * Query audit entries scoped to a single entity (by a value inside details).
   * Used to surface a change-history timeline for a given record.
   */
  async queryByEntity(params) {
    return auditLogRepository.findByEntity(params);
  }

  /**
   * Resolve the acting user of audit entries to a display name.
   *
   * Audit documents only store `userId`, so every activity view has to answer
   * "who did this?" the same way. Batch-loads the users once and returns the
   * entries with a `userName` (falls back to the stored email, then "System"
   * for entries written by background jobs). Never throws — an unresolved name
   * must not break the timeline.
   */
  async withUserNames(entries = []) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return list;
    try {
      const ids = [...new Set(list.map((e) => e?.userId).filter(Boolean).map(String))];
      const nameById = new Map();
      if (ids.length) {
        const User = (await import('./user.model.js')).default;
        const users = await User.find({ _id: { $in: ids } })
          .select('firstName lastName email')
          .lean();
        for (const user of users) {
          const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
          nameById.set(String(user._id), name || user.email || null);
        }
      }
      return list.map((entry) => ({
        ...entry,
        // Timelines mix real audit rows with derived entries that already carry
        // a resolved `actor` — never overwrite that with "System".
        userName: (entry?.userId && nameById.get(String(entry.userId)))
          || entry?.actor
          || entry?.email
          || 'System',
      }));
    } catch (err) {
      logger.warn('Could not resolve audit user names', { module: 'auth', error: err.message });
      return list.map((entry) => ({ ...entry, userName: entry?.actor || entry?.email || 'System' }));
    }
  }
}

const auditService = new AuditService();
export default auditService;
