import { BaseWorker } from '../shared/queue/BaseWorker.js';
import auditLogRepository from '../modules/auth/auditLog.repository.js';
import logger from '../shared/logger/index.js';

/**
 * Audit log worker.
 *
 * Writes audit log entries to MongoDB asynchronously.
 * This ensures audit logging never blocks the request path.
 * If MongoDB is temporarily slow, entries are buffered in BullMQ.
 */
export class AuditLogWorker extends BaseWorker {
  constructor() {
    super('audit-log');
  }

  async process(job) {
    const data = job.data;

    await auditLogRepository.create({
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      eventType: data.eventType,
      userId: data.userId || null,
      email: data.email || null,
      ipAddress: data.ipAddress || 'unknown',
      userAgent: data.userAgent || null,
      result: data.result || 'success',
      details: data.details || null,
      module: data.module || 'auth',
    });

    return { written: true, eventType: data.eventType };
  }
}

export default AuditLogWorker;
