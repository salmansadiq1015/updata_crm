import workReportRepository from './workReport.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };

class ReportService {
  async create(orderId, data, technicianId, meta = {}) {
    const reportNumber = await counterService.getNextReportNumber();

    const report = await workReportRepository.create({
      ...data,
      orderId,
      reportNumber,
      technicianId,
      createdBy: technicianId,
    });

    eventBus.publish(EVENT_TYPES.MOBILE_REPORT_CREATED, {
      reportId: report._id,
      reportNumber,
      orderId,
      technicianId,
    }, { source: 'mobile:reports' });

    auditService.logEvent({
      eventType: 'report.created',
      userId: technicianId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { reportId: report._id, reportNumber, orderId },
      module: 'mobile',
    });

    logger.info('Work report created', { module: 'mobile', action: 'create', reportId: report._id, reportNumber });

    return workReportRepository.findById(report._id);
  }

  async getById(id) {
    const cacheKey = `mobile:report:${id}`;
    const report = await cacheManager.getOrSet(
      cacheKey,
      () => workReportRepository.findById(id),
      ENTITY_TTL,
    );
    if (!report) throw new NotFoundError('WorkReport', id);
    return report;
  }

  async update(id, data, userId, meta = {}) {
    const existing = await workReportRepository.findById(id);
    if (!existing) throw new NotFoundError('WorkReport', id);

    const now = new Date();
    const isEditable =
      existing.status === 'DRAFT' ||
      (existing.status === 'SUBMITTED' && existing.editableUntil && now <= new Date(existing.editableUntil));

    if (!isEditable) {
      throw new ConflictError('Work report is not editable. Only DRAFT or recently SUBMITTED reports within the editing window can be modified.');
    }

    const updated = await workReportRepository.updateById(id, { ...data, updatedBy: userId });

    await cacheManager.del(`mobile:report:${id}`);

    auditService.logEvent({
      eventType: 'report.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { reportId: id, changedFields: Object.keys(data) },
      module: 'mobile',
    });

    return updated;
  }

  async submit(id, userId, meta = {}) {
    const existing = await workReportRepository.findById(id);
    if (!existing) throw new NotFoundError('WorkReport', id);

    if (existing.status !== 'DRAFT') {
      throw new ConflictError('Work report has already been submitted.');
    }

    if (!existing.workPerformed || existing.workPerformed.trim().length === 0) {
      throw new ConflictError('Work performed field is required before submission.');
    }

    const now = new Date();
    const editableUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const updated = await workReportRepository.updateById(id, {
      status: 'SUBMITTED',
      submittedAt: now,
      editableUntil,
      updatedBy: userId,
    });

    // Auto-release pending time entries for this order
    const TimeEntry = (await import('./timeEntry.model.js')).default;
    await TimeEntry.updateMany(
      { orderId: existing.orderId, releaseStatus: 'PENDING', isDeleted: false },
      { $set: { releaseStatus: 'RELEASED' } },
    );

    eventBus.publish(EVENT_TYPES.MOBILE_REPORT_SUBMITTED, {
      reportId: id,
      reportNumber: existing.reportNumber,
      orderId: existing.orderId,
      technicianId: existing.technicianId,
    }, { source: 'mobile:reports' });

    queueManager.addJob('auth-email', 'send-report-submitted', {
      reportNumber: existing.reportNumber,
      orderId: existing.orderId,
    });

    await cacheManager.del(`mobile:report:${id}`);

    auditService.logEvent({
      eventType: 'report.submitted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { reportId: id, reportNumber: existing.reportNumber },
      module: 'mobile',
    });

    return updated;
  }
}

const reportService = new ReportService();
export default reportService;
