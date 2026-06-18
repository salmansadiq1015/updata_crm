import workReportRepository from './workReport.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';
import mongoose from 'mongoose';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const EXPORT_LIMIT = 5000;
const FINAL_REPORT_STATUSES = ['APPROVED', 'INVOICED'];

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
    const assignmentDefaults = await this._getAssignmentDefaults(orderId);
    const payload = this._withDerivedBilling({
      ...data,
      projectId: data.projectId ?? assignmentDefaults.projectId ?? null,
      generationSource: data.generationSource || (meta.source === 'ai-voice' || meta.source === 'ai-agent' ? 'VOICE' : 'MANUAL'),
    });

    const report = await workReportRepository.create({
      ...payload,
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

  async generateFromSources(orderId, data, technicianId, meta = {}) {
    const TimeEntry = (await import('./timeEntry.model.js')).default;
    const timeFilter = {
      orderId,
      technicianId,
      isDeleted: false,
    };
    if (data.timeEntryIds?.length) {
      timeFilter._id = { $in: data.timeEntryIds };
    }

    const timeEntries = data.generationSource === 'TIME_TRACKING'
      ? await TimeEntry.find(timeFilter).sort({ startTime: 1 }).lean()
      : [];
    const taskSummaries = (data.taskSummaries || []).map((item) => `${item}`.trim()).filter(Boolean);

    if (!timeEntries.length && !taskSummaries.length && !data.workPerformed) {
      throw new ConflictError('No completed task or time tracking data is available to generate a report.');
    }

    const firstEntry = timeEntries[0] || null;
    const lastEntry = timeEntries[timeEntries.length - 1] || null;
    const totalMinutes = timeEntries.reduce((sum, entry) => sum + getTimeEntryMinutes(entry), 0);
    const timeNotes = timeEntries
      .map((entry) => entry.note)
      .filter(Boolean);
    const workPerformed = data.workPerformed
      || buildGeneratedWorkPerformed({ timeEntries, taskSummaries });

    return this.create(orderId, {
      reportDate: data.reportDate || firstEntry?.date || new Date(),
      arrivalTime: firstEntry?.startTime || null,
      departureTime: lastEntry?.endTime || null,
      workPerformed,
      technicianNotes: data.technicianNotes || timeNotes.join('\n') || null,
      billableMinutes: totalMinutes,
      nonBillableMinutes: 0,
      generationSource: data.generationSource,
      sourceTimeEntryIds: timeEntries.map((entry) => entry._id),
      sourceTaskIds: data.sourceTaskIds || [],
    }, technicianId, { ...meta, source: data.generationSource === 'TIME_TRACKING' ? 'time-tracking' : 'tasks' });
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

    if (data.status === 'APPROVED') {
      return this.approve(id, userId, meta);
    }
    if (data.status === 'REJECTED') {
      return this.reject(id, { rejectionNote: data.rejectionNote }, userId, meta);
    }
    if (data.status === 'INVOICED') {
      return this.markInvoiced(id, data, userId, meta);
    }

    this._assertEditable(existing);

    const patch = this._withDerivedBilling({ ...existing, ...data }, data);
    const updated = await workReportRepository.updateById(id, { ...patch, updatedBy: userId });

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

  async approve(id, userId, meta = {}) {
    const existing = await workReportRepository.findById(id);
    if (!existing) throw new NotFoundError('WorkReport', id);
    if (existing.status !== 'SUBMITTED') {
      throw new ConflictError('Only submitted reports can be approved.');
    }

    const now = new Date();
    const updated = await workReportRepository.updateById(id, {
      status: 'APPROVED',
      approvedAt: now,
      approvedBy: userId,
      rejectedAt: null,
      rejectedBy: null,
      rejectionNote: null,
      accountingTransferStatus: 'PENDING',
      updatedBy: userId,
    });

    await cacheManager.del(`mobile:report:${id}`);
    auditService.logEvent({
      eventType: 'report.approved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { reportId: id, reportNumber: existing.reportNumber },
      module: 'mobile',
    });

    return updated;
  }

  async reject(id, data = {}, userId, meta = {}) {
    const existing = await workReportRepository.findById(id);
    if (!existing) throw new NotFoundError('WorkReport', id);
    if (existing.status !== 'SUBMITTED') {
      throw new ConflictError('Only submitted reports can be rejected.');
    }

    const updated = await workReportRepository.updateById(id, {
      status: 'REJECTED',
      rejectedAt: new Date(),
      rejectedBy: userId,
      approvedAt: null,
      approvedBy: null,
      rejectionNote: data.rejectionNote || null,
      accountingTransferStatus: 'NOT_REQUIRED',
      updatedBy: userId,
    });

    await cacheManager.del(`mobile:report:${id}`);
    auditService.logEvent({
      eventType: 'report.rejected',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { reportId: id, reportNumber: existing.reportNumber, rejectionNote: data.rejectionNote || null },
      module: 'mobile',
    });

    return updated;
  }

  async markInvoiced(id, data = {}, userId, meta = {}) {
    const existing = await workReportRepository.findById(id);
    if (!existing) throw new NotFoundError('WorkReport', id);
    if (!FINAL_REPORT_STATUSES.includes(existing.status)) {
      throw new ConflictError('Only approved reports can be marked as invoiced.');
    }
    if (existing.status === 'INVOICED') return existing;

    const updated = await workReportRepository.updateById(id, {
      status: 'INVOICED',
      invoiceId: data.invoiceId || null,
      invoiceReference: data.invoiceReference || null,
      invoicedAt: new Date(),
      invoicedBy: userId,
      accountingTransferStatus: 'TRANSFERRED',
      accountingTransferError: null,
      updatedBy: userId,
    });

    await cacheManager.del(`mobile:report:${id}`);
    auditService.logEvent({
      eventType: 'report.invoiced',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        reportId: id,
        reportNumber: existing.reportNumber,
        invoiceId: data.invoiceId || null,
        invoiceReference: data.invoiceReference || null,
      },
      module: 'mobile',
    });

    return updated;
  }

  async createInvoiceFromReport(id, data = {}, userId, meta = {}) {
    const existing = await workReportRepository.findById(id);
    if (!existing) throw new NotFoundError('WorkReport', id);
    if (existing.status !== 'APPROVED') {
      throw new ConflictError('Only approved reports can be transferred to invoicing.');
    }

    const assignmentId = existing.orderId?._id || existing.orderId;
    const Assignment = (await import('../deploy/assignment.model.js')).default;
    const assignment = await Assignment.findById(assignmentId).select('orderId title assignmentNumber').lean();
    if (!assignment?.orderId) {
      await workReportRepository.updateById(id, {
        accountingTransferStatus: 'FAILED',
        accountingTransferError: 'No QOP order is linked to this work assignment.',
        updatedBy: userId,
      });
      await cacheManager.del(`mobile:report:${id}`);
      throw new ConflictError('No QOP order is linked to this work assignment.');
    }

    const invoiceService = (await import('../qop/invoice.service.js')).default;
    let invoice;
    try {
      invoice = await invoiceService.createFromOrder({
        sourceOrderId: assignment.orderId,
        title: data.title || `Invoice for report ${existing.reportNumber}`,
        dueDate: data.dueDate,
        paymentTermsDays: data.paymentTermsDays,
        paymentTermsText: data.paymentTermsText,
        globalDiscountPercent: data.globalDiscountPercent,
      }, userId, meta);
    } catch (err) {
      await workReportRepository.updateById(id, {
        accountingTransferStatus: 'FAILED',
        accountingTransferError: err.message,
        updatedBy: userId,
      });
      await cacheManager.del(`mobile:report:${id}`);
      throw err;
    }

    return this.markInvoiced(id, {
      invoiceId: invoice._id,
      invoiceReference: invoice.invoiceNumber,
    }, userId, meta);
  }

  async getSummary(filters = {}) {
    const reports = await workReportRepository.listForExport({ ...filters, pageSize: EXPORT_LIMIT });
    return buildReportAnalytics(reports);
  }

  async exportCsv(filters = {}) {
    const type = filters.type || 'reports';
    const reports = await workReportRepository.listForExport({ ...filters, pageSize: EXPORT_LIMIT });
    const rows = buildExportRows(reports, type);
    return {
      filename: `work-reports-${type}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv(rows),
    };
  }

  async getHistory(id, limit = 100) {
    await this.getById(id);
    const candidates = [id];
    if (mongoose.Types.ObjectId.isValid(id)) {
      candidates.push(new mongoose.Types.ObjectId(id));
    }
    return auditService.queryByEntity({
      module: 'mobile',
      detailsKey: 'reportId',
      entityId: candidates,
      eventTypePrefix: 'report.',
      limit,
    });
  }

  async _getAssignmentDefaults(orderId) {
    try {
      const Assignment = (await import('../deploy/assignment.model.js')).default;
      const assignment = await Assignment.findById(orderId).select('projectId').lean();
      return { projectId: assignment?.projectId || null };
    } catch {
      return { projectId: null };
    }
  }

  _withDerivedBilling(source, explicitPatch = null) {
    const patch = explicitPatch ? { ...explicitPatch } : { ...source };
    const hasExplicitBilling = Object.prototype.hasOwnProperty.call(patch, 'billableMinutes')
      || Object.prototype.hasOwnProperty.call(patch, 'nonBillableMinutes');
    if (hasExplicitBilling) return patch;

    const totalMinutes = deriveWorkingMinutes(source.arrivalTime, source.departureTime);
    if (totalMinutes > 0) {
      patch.billableMinutes = totalMinutes;
      patch.nonBillableMinutes = 0;
    }
    return patch;
  }
}

function deriveWorkingMinutes(arrivalTime, departureTime) {
  if (!arrivalTime || !departureTime) return 0;
  const start = new Date(arrivalTime).getTime();
  const end = new Date(departureTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60000);
}

function getTimeEntryMinutes(entry) {
  if (Number.isFinite(Number(entry.netDurationMin))) {
    return Math.max(Number(entry.netDurationMin), 0);
  }
  const gross = deriveWorkingMinutes(entry.startTime, entry.endTime);
  return Math.max(gross - Number(entry.breakDurationMin || 0), 0);
}

function buildGeneratedWorkPerformed({ timeEntries = [], taskSummaries = [] }) {
  const lines = [];
  if (taskSummaries.length) {
    lines.push(...taskSummaries.map((summary) => `<p>${escapeHtml(summary)}</p>`));
  }
  if (timeEntries.length) {
    lines.push(...timeEntries.map((entry) => {
      const type = entry.activityType ? `${entry.activityType}: ` : '';
      const note = entry.note || 'Tracked work time';
      return `<p>${escapeHtml(type + note)}</p>`;
    }));
  }
  return lines.join('') || '<p>Generated from completed work data.</p>';
}

function getReportMetrics(report) {
  const derivedMinutes = deriveWorkingMinutes(report.arrivalTime, report.departureTime);
  const billableMinutes = Number(report.billableMinutes || 0) || (Number(report.nonBillableMinutes || 0) > 0 ? 0 : derivedMinutes);
  const nonBillableMinutes = Number(report.nonBillableMinutes || 0);
  const totalMinutes = billableMinutes + nonBillableMinutes || derivedMinutes;
  return {
    totalMinutes,
    billableMinutes,
    nonBillableMinutes,
    materialCount: Array.isArray(report.materialItems) ? report.materialItems.length : 0,
  };
}

function getReportContext(report) {
  const assignment = isObject(report.orderId) ? report.orderId : null;
  const qopOrder = isObject(assignment?.orderId) ? assignment.orderId : null;
  const project = isObject(report.projectId)
    ? report.projectId
    : isObject(assignment?.projectId)
      ? assignment.projectId
      : null;
  const customer = isObject(assignment?.customerId) ? assignment.customerId : null;

  return {
    reportId: objectIdString(report._id),
    assignmentId: objectIdString(assignment?._id || report.orderId),
    assignmentLabel: assignment?.assignmentNumber ? `#${assignment.assignmentNumber}` : assignment?.title || '',
    technicianId: objectIdString(report.technicianId?._id || report.technicianId),
    technicianName: formatUserName(report.technicianId),
    projectId: objectIdString(project?._id || report.projectId || qopOrder?.projectId),
    projectName: project?.name || qopOrder?.title || '',
    customerId: objectIdString(customer?._id || qopOrder?.customerId),
    customerName: customer?.name || qopOrder?.customerName || '',
    qopOrderId: objectIdString(qopOrder?._id || assignment?.orderId),
    qopOrderNumber: qopOrder?.orderNumber || '',
  };
}

function buildReportAnalytics(reports = []) {
  const totals = {
    reports: reports.length,
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    invoiced: 0,
    totalMinutes: 0,
    billableMinutes: 0,
    nonBillableMinutes: 0,
    materialItems: 0,
  };

  const byStatus = new Map();
  const byEmployee = new Map();
  const byProject = new Map();
  const byCustomer = new Map();
  const byPeriod = new Map();

  for (const report of reports) {
    const metrics = getReportMetrics(report);
    const context = getReportContext(report);
    const statusKey = `${report.status || 'UNKNOWN'}`.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(totals, statusKey)) totals[statusKey] += 1;
    totals.totalMinutes += metrics.totalMinutes;
    totals.billableMinutes += metrics.billableMinutes;
    totals.nonBillableMinutes += metrics.nonBillableMinutes;
    totals.materialItems += metrics.materialCount;

    addGroup(byStatus, report.status || 'UNKNOWN', report.status || 'Unknown', metrics);
    addGroup(byEmployee, context.technicianId || 'unassigned', context.technicianName || 'Unassigned', metrics);
    addGroup(byProject, context.projectId || 'none', context.projectName || 'No project', metrics);
    addGroup(byCustomer, context.customerId || 'none', context.customerName || 'No customer', metrics);
    addGroup(byPeriod, monthKey(report.reportDate), monthKey(report.reportDate), metrics);
  }

  return {
    totals,
    byStatus: mapValues(byStatus),
    byEmployee: mapValues(byEmployee),
    byProject: mapValues(byProject),
    byCustomer: mapValues(byCustomer),
    byPeriod: mapValues(byPeriod),
  };
}

function addGroup(map, id, label, metrics) {
  const key = `${id || 'none'}`;
  const current = map.get(key) || {
    id: key,
    label,
    reports: 0,
    totalMinutes: 0,
    billableMinutes: 0,
    nonBillableMinutes: 0,
    materialItems: 0,
  };
  current.reports += 1;
  current.totalMinutes += metrics.totalMinutes;
  current.billableMinutes += metrics.billableMinutes;
  current.nonBillableMinutes += metrics.nonBillableMinutes;
  current.materialItems += metrics.materialCount;
  map.set(key, current);
}

function mapValues(map) {
  return [...map.values()].sort((a, b) => b.reports - a.reports);
}

function buildExportRows(reports, type) {
  return reports.map((report) => {
    const metrics = getReportMetrics(report);
    const context = getReportContext(report);
    const base = {
      reportNumber: report.reportNumber,
      status: report.status,
      reportDate: formatDateOnly(report.reportDate),
      technician: context.technicianName,
      customer: context.customerName,
      project: context.projectName,
      assignment: context.assignmentLabel,
      totalHours: minutesToHours(metrics.totalMinutes),
      billableHours: minutesToHours(metrics.billableMinutes),
      nonBillableHours: minutesToHours(metrics.nonBillableMinutes),
      materialItems: metrics.materialCount,
      invoice: report.invoiceId?.invoiceNumber || report.invoiceReference || '',
    };

    if (type === 'payroll') {
      return pick(base, ['technician', 'reportDate', 'reportNumber', 'assignment', 'totalHours', 'billableHours', 'nonBillableHours', 'status']);
    }
    if (type === 'controlling') {
      return pick(base, ['project', 'customer', 'reportDate', 'reportNumber', 'status', 'totalHours', 'billableHours', 'nonBillableHours', 'materialItems']);
    }
    if (type === 'invoicing') {
      return {
        ...pick(base, ['customer', 'project', 'assignment', 'reportNumber', 'status', 'billableHours', 'materialItems', 'invoice']),
        approvedAt: formatDateOnly(report.approvedAt),
        invoicedAt: formatDateOnly(report.invoicedAt),
      };
    }
    return {
      ...base,
      workPerformed: stripHtml(report.workPerformed || ''),
    };
  });
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function csvEscape(value) {
  const text = value == null ? '' : `${value}`;
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function pick(source, keys) {
  return keys.reduce((acc, key) => {
    acc[key] = source[key];
    return acc;
  }, {});
}

function minutesToHours(minutes) {
  return Math.round((Number(minutes || 0) / 60) * 100) / 100;
}

function monthKey(date) {
  if (!date) return 'unknown';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'unknown';
  return parsed.toISOString().slice(0, 7);
}

function formatDateOnly(date) {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function formatUserName(user) {
  if (!isObject(user)) return '';
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || '';
}

function objectIdString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (value._id && value._id !== value) return objectIdString(value._id);
  return value.toString?.() || '';
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stripHtml(value) {
  return `${value}`.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const reportService = new ReportService();
export default reportService;
