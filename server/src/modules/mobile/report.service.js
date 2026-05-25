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
  _isEditable(report) {
    if (!report) return false;
    if (report.status === 'DRAFT') return true;
    if (report.status !== 'SUBMITTED' || !report.editableUntil) return false;
    return new Date() <= new Date(report.editableUntil);
  }

  _assertEditable(report) {
    if (!this._isEditable(report)) {
      throw new ConflictError('Work report is locked. Only DRAFT reports or SUBMITTED reports within the editing window can be changed.');
    }
  }

  async listByOrder(orderId) {
    return workReportRepository.findByOrderId(orderId);
  }

  async list(filters = {}) {
    return workReportRepository.list(filters);
  }

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

    // Admin status transitions (APPROVED/REJECTED) bypass the editability window.
    const isAdminStatusChange = data.status === 'APPROVED' || data.status === 'REJECTED';

    if (!isAdminStatusChange) {
      this._assertEditable(existing);
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

  async delete(id, userId, meta = {}) {
    const existing = await workReportRepository.findById(id);
    if (!existing) throw new NotFoundError('WorkReport', id);

    this._assertEditable(existing);

    await workReportRepository.softDelete(id);
    await cacheManager.del(`mobile:report:${id}`);

    auditService.logEvent({
      eventType: 'report.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { reportId: id, reportNumber: existing.reportNumber },
      module: 'mobile',
    });

    logger.info('Work report deleted', { module: 'mobile', action: 'delete', reportId: id });
  }

  async bulkDelete(ids, userId, meta = {}) {
    const existingReports = await workReportRepository.findByIds(ids);
    const foundIds = new Set(existingReports.map((report) => report._id.toString()));
    const missingIds = ids.filter((id) => !foundIds.has(id.toString()));
    if (missingIds.length > 0) {
      throw new NotFoundError('WorkReports', missingIds.join(', '));
    }

    const lockedReports = existingReports.filter((report) => !this._isEditable(report));
    if (lockedReports.length > 0) {
      throw new ConflictError('Bulk delete contains locked work reports. Only DRAFT reports or SUBMITTED reports within the editing window can be deleted.');
    }

    await workReportRepository.bulkSoftDelete(ids);

    await Promise.all(ids.map((id) => cacheManager.del(`mobile:report:${id}`)));

    auditService.logEvent({
      eventType: 'report.bulk_deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { count: ids.length, reportIds: ids },
      module: 'mobile',
    });

    logger.info('Work reports bulk deleted', { module: 'mobile', action: 'bulk_delete', count: ids.length });
  }

  async archive(id, userId, meta = {}) {
    const existing = await workReportRepository.findById(id);
    if (!existing) throw new NotFoundError('WorkReport', id);
    if (existing.isArchived) throw new ConflictError('Report is already archived.');

    const updated = await workReportRepository.updateById(id, {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: userId,
      updatedBy: userId,
    });
    await cacheManager.del(`mobile:report:${id}`);

    auditService.logEvent({
      eventType: 'report.archived',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { reportId: id },
      module: 'mobile',
    });

    return updated;
  }

  async unarchive(id, userId, meta = {}) {
    const existing = await workReportRepository.findById(id);
    if (!existing) throw new NotFoundError('WorkReport', id);
    if (!existing.isArchived) throw new ConflictError('Report is not archived.');

    const updated = await workReportRepository.updateById(id, {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      updatedBy: userId,
    });
    await cacheManager.del(`mobile:report:${id}`);

    auditService.logEvent({
      eventType: 'report.unarchived',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { reportId: id },
      module: 'mobile',
    });

    return updated;
  }

  async bulkArchive(ids, userId, meta = {}) {
    await workReportRepository.bulkUpdateById(ids, {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: userId,
      updatedBy: userId,
    });

    await Promise.all(ids.map((id) => cacheManager.del(`mobile:report:${id}`)));

    auditService.logEvent({
      eventType: 'report.bulk_archived',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { count: ids.length, reportIds: ids },
      module: 'mobile',
    });
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

    // Look up order to get creator/manager for notification recipients
    let managerIds = [];
    let orderTitle = '';
    try {
      const Assignment = (await import('../deploy/assignment.model.js')).default;
      const order = await Assignment.findById(existing.orderId).select('createdBy title').lean();
      if (order?.createdBy) managerIds = [order.createdBy];
      if (order?.title) orderTitle = order.title;
    } catch { /* non-critical */ }

    const submitter = await (await import('../auth/user.model.js')).default
      .findById(userId).select('firstName lastName').lean().catch(() => null);
    const technicianName = submitter ? `${submitter.firstName || ''} ${submitter.lastName || ''}`.trim() : '';

    eventBus.publish(EVENT_TYPES.MOBILE_REPORT_SUBMITTED, {
      reportId: id,
      reportNumber: existing.reportNumber,
      orderId: existing.orderId,
      orderTitle,
      technicianId: existing.technicianId,
      technicianName,
      submittedBy: userId,
      managerIds,
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
