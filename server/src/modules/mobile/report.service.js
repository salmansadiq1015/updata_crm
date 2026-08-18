import workReportRepository from './workReport.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { parse } from 'csv-parse/sync';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';
import mongoose from 'mongoose';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const EXPORT_LIMIT = 5000;
const IMPORT_LIMIT = 500;
const FINAL_REPORT_STATUSES = ['APPROVED', 'INVOICED'];
const IMPORT_TEMPLATE_COLUMNS = [
  'orderId',
  'assignmentNumber',
  'technicianId',
  'reportDate',
  'arrivalTime',
  'departureTime',
  'workPerformed',
  'findings',
  'nextSteps',
  'followUpNeeded',
  'technicianNotes',
  'customerSignerName',
  'billableMinutes',
  'nonBillableMinutes',
  'billableNotes',
  'materialItems',
  'status',
];

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

    // The invoice bills what the report says happened: the worked time priced
    // at the company hourly rate (Stundensatz, Einstellungen › Arbeitszeit),
    // plus the material actually used with its catalogue snapshot prices.
    // Everything stays editable on the draft invoice.
    const { default: WorkTimeSettings } = await import('./workTimeSettings.model.js');
    const settings = await WorkTimeSettings.findOne({ key: 'default' }).lean();
    const hourlyRate = Number(settings?.billingHourlyRate) || 0;

    const fmtDay = (d) => {
      const date = d ? new Date(d) : null;
      if (!date || Number.isNaN(date.getTime())) return '';
      return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
    };

    const lineItems = [];
    if (existing.arrivalTime && existing.departureTime) {
      const workedHours = (new Date(existing.departureTime) - new Date(existing.arrivalTime)) / 3600000;
      // Bill in quarter-hour steps, as trades usually do.
      const billedHours = Math.round(Math.max(0, workedHours) * 4) / 4;
      if (billedHours > 0) {
        const day = fmtDay(existing.reportDate || existing.arrivalTime);
        lineItems.push({
          position: lineItems.length + 1,
          type: 'service',
          description: ['Arbeitszeit', day, assignment.title || existing.reportNumber]
            .filter(Boolean).join(' — '),
          unit: 'h',
          quantity: billedHours,
          unitPrice: hourlyRate,
          discountPercent: 0,
          vatRate: 8.1,
        });
      }
    }
    for (const item of existing.materialItems || []) {
      const snapshot = item.catalogSnapshot || null;
      lineItems.push({
        position: lineItems.length + 1,
        type: 'material',
        description: item.description,
        unit: item.unit || 'Stk',
        quantity: Number(item.quantity) || 0,
        // Custom (non-catalogue) material has no price — the office completes
        // it on the draft invoice.
        unitPrice: Number(snapshot?.snapshotSalesPrice ?? snapshot?.snapshotBasePrice ?? 0),
        discountPercent: 0,
        vatRate: 8.1,
        catalogSnapshot: snapshot || null,
      });
    }
    if (!lineItems.length) {
      throw new ConflictError('The report has neither worked time nor material to invoice.');
    }

    const invoiceService = (await import('../qop/invoice.service.js')).default;
    let invoice;
    try {
      invoice = await invoiceService.createFromOrder({
        sourceOrderId: assignment.orderId,
        sourceWorkReportId: existing._id,
        lineItems,
        title: data.title || `Rechnung zu Rapport ${existing.reportNumber}`,
        // The invoice needs a due date; default to 30 days like the payment terms.
        dueDate: data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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

  importTemplate() {
    const sample = {
      orderId: '',
      assignmentNumber: 'ASN-2026-00001',
      technicianId: '',
      reportDate: '2026-06-15',
      arrivalTime: '2026-06-15T08:00:00.000Z',
      departureTime: '2026-06-15T12:30:00.000Z',
      workPerformed: 'Checked burner, cleaned heat exchanger, tested safety valve.',
      findings: 'System operating within expected limits.',
      nextSteps: 'Schedule annual maintenance follow-up.',
      followUpNeeded: 'false',
      technicianNotes: 'Imported from field worksheet.',
      customerSignerName: 'Max Muster',
      billableMinutes: '270',
      nonBillableMinutes: '0',
      billableNotes: 'Standard service visit.',
      materialItems: 'Burner nozzle|1|pcs;Seal kit|2|pcs',
      status: 'DRAFT',
    };
    return toCsv([sample], IMPORT_TEMPLATE_COLUMNS);
  }

  async importCsv(file, options = {}, userId, meta = {}) {
    if (!file?.buffer) {
      throw new ConflictError('Report import file is required.');
    }

    const rows = parseImportCsv(file.buffer);
    if (rows.length === 0) {
      throw new ValidationError('Report import file is empty.');
    }
    if (rows.length > IMPORT_LIMIT) {
      throw new ConflictError(`Report import is limited to ${IMPORT_LIMIT} rows per file.`);
    }

    const dryRun = options.dryRun === true || options.dryRun === 'true';
    const prepared = [];
    const rowErrors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const result = await prepareImportRow(rows[index], rowNumber, userId);
      if (result.errors.length) {
        rowErrors.push(...result.errors);
      } else {
        prepared.push(result.value);
      }
    }

    const summary = {
      dryRun,
      totalRows: rows.length,
      validRows: prepared.length,
      created: 0,
      skipped: rowErrors.length ? prepared.length : 0,
      failed: rowErrors.length,
      rowErrors,
    };

    if (dryRun || rowErrors.length) {
      return summary;
    }

    for (const item of prepared) {
      try {
        await this.create(
          item.orderId,
          item.payload,
          item.technicianId,
          { ...meta, source: 'report-import' },
        );
        summary.created += 1;
      } catch (err) {
        summary.failed += 1;
        summary.rowErrors.push({
          row: item.row,
          field: 'row',
          message: err.message || 'Report could not be imported.',
        });
      }
    }

    summary.skipped = prepared.length - summary.created;

    auditService.logEvent({
      eventType: 'report.imported',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: summary.failed > 0 ? 'partial' : 'success',
      details: {
        totalRows: summary.totalRows,
        created: summary.created,
        failed: summary.failed,
      },
      module: 'mobile',
    });

    return summary;
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

function toCsv(rows, preferredHeaders = null) {
  if (!rows.length) return '';
  const headers = preferredHeaders || Object.keys(rows[0]);
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

function parseImportCsv(buffer) {
  try {
    return parse(buffer.toString('utf8'), {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw new ValidationError('Report import CSV could not be parsed.', [{
      field: 'file',
      message: err.message,
    }]);
  }
}

async function prepareImportRow(row, rowNumber, userId) {
  const errors = [];
  const orderResolution = await resolveImportAssignment(row);
  if (orderResolution.error) errors.push(rowError(rowNumber, 'orderId', orderResolution.error));

  const technicianResolution = await resolveImportTechnician(row, orderResolution.assignment, userId);
  if (technicianResolution.error) errors.push(rowError(rowNumber, 'technicianId', technicianResolution.error));

  const reportDate = parseDateField(row.reportDate, 'reportDate', rowNumber, errors, true);
  const arrivalTime = parseDateField(row.arrivalTime, 'arrivalTime', rowNumber, errors, false);
  const departureTime = parseDateField(row.departureTime, 'departureTime', rowNumber, errors, false);
  if (arrivalTime && departureTime && departureTime <= arrivalTime) {
    errors.push(rowError(rowNumber, 'departureTime', 'Departure time must be after arrival time.'));
  }

  const workPerformed = readString(row.workPerformed);
  if (!workPerformed) errors.push(rowError(rowNumber, 'workPerformed', 'Work performed is required.'));
  if (workPerformed.length > 5000) errors.push(rowError(rowNumber, 'workPerformed', 'Work performed must be 5000 characters or less.'));

  const billableMinutes = parseIntegerField(row.billableMinutes, 'billableMinutes', rowNumber, errors);
  const nonBillableMinutes = parseIntegerField(row.nonBillableMinutes, 'nonBillableMinutes', rowNumber, errors);
  const materialItems = parseMaterialItems(row.materialItems, rowNumber, errors);
  const requestedStatus = readString(row.status || 'DRAFT').toUpperCase();
  if (requestedStatus && requestedStatus !== 'DRAFT') {
    errors.push(rowError(rowNumber, 'status', 'CSV import creates DRAFT reports only. Submit, approve, and invoice through the report workflow.'));
  }

  if (errors.length) return { errors, value: null };

  const payload = {
    reportDate,
    projectId: optionalObjectId(row.projectId) || orderResolution.assignment.projectId || null,
    arrivalTime,
    departureTime,
    workPerformed,
    findings: nullableString(row.findings),
    nextSteps: nullableString(row.nextSteps),
    followUpNeeded: parseBoolean(row.followUpNeeded),
    technicianNotes: nullableString(row.technicianNotes),
    customerSignerName: nullableString(row.customerSignerName),
    billableNotes: nullableString(row.billableNotes),
    materialItems,
    generationSource: 'SYNC',
  };
  if (billableMinutes !== undefined) payload.billableMinutes = billableMinutes;
  if (nonBillableMinutes !== undefined) payload.nonBillableMinutes = nonBillableMinutes;

  return {
    errors,
    value: {
      row: rowNumber,
      orderId: orderResolution.assignment._id,
      technicianId: technicianResolution.technicianId,
      payload,
    },
  };
}

async function resolveImportAssignment(row) {
  const Assignment = (await import('../deploy/assignment.model.js')).default;
  const orderId = readString(row.orderId);
  const assignmentNumber = readString(row.assignmentNumber);

  if (orderId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return { assignment: null, error: 'orderId must be a valid assignment ObjectId.' };
    }
    const assignment = await Assignment.findById(orderId).select('_id projectId employeeId assignmentNumber').lean();
    return assignment
      ? { assignment, error: null }
      : { assignment: null, error: `Assignment '${orderId}' was not found.` };
  }

  if (!assignmentNumber) {
    return { assignment: null, error: 'Either orderId or assignmentNumber is required.' };
  }

  const assignment = await Assignment.findOne({ assignmentNumber }).select('_id projectId employeeId assignmentNumber').lean();
  return assignment
    ? { assignment, error: null }
    : { assignment: null, error: `Assignment '${assignmentNumber}' was not found.` };
}

async function resolveImportTechnician(row, assignment, userId) {
  const User = (await import('../auth/user.model.js')).default;
  const rawTechnicianId = readString(row.technicianId);
  const technicianId = rawTechnicianId || objectIdString(assignment?.employeeId) || objectIdString(userId);
  if (!mongoose.Types.ObjectId.isValid(technicianId)) {
    return { technicianId: null, error: 'technicianId must be a valid user ObjectId.' };
  }
  const technician = await User.findById(technicianId).select('_id').lean();
  return technician
    ? { technicianId: technician._id, error: null }
    : { technicianId: null, error: `Technician '${technicianId}' was not found.` };
}

function parseDateField(value, field, rowNumber, errors, required) {
  const raw = readString(value);
  if (!raw) {
    if (required) errors.push(rowError(rowNumber, field, `${field} is required.`));
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(rowError(rowNumber, field, `${field} must be an ISO date or datetime.`));
    return null;
  }
  return parsed;
}

function parseIntegerField(value, field, rowNumber, errors) {
  const raw = readString(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    errors.push(rowError(rowNumber, field, `${field} must be a non-negative whole number.`));
    return undefined;
  }
  return parsed;
}

function parseMaterialItems(value, rowNumber, errors) {
  const raw = readString(value);
  if (!raw) return [];
  return raw.split(';')
    .map((entry, index) => {
      const [descriptionRaw, quantityRaw, unitRaw] = entry.split('|').map((part) => readString(part));
      if (!descriptionRaw || !quantityRaw || !unitRaw) {
        errors.push(rowError(rowNumber, 'materialItems', `Material item ${index + 1} must use "description|quantity|unit".`));
        return null;
      }
      if (descriptionRaw.length > 300) {
        errors.push(rowError(rowNumber, 'materialItems', `Material item ${index + 1} description must be 300 characters or less.`));
        return null;
      }
      const quantity = Number(quantityRaw);
      if (!Number.isFinite(quantity) || quantity < 0) {
        errors.push(rowError(rowNumber, 'materialItems', `Material item ${index + 1} quantity must be a non-negative number.`));
        return null;
      }
      if (unitRaw.length > 20) {
        errors.push(rowError(rowNumber, 'materialItems', `Material item ${index + 1} unit must be 20 characters or less.`));
        return null;
      }
      return {
        catalogSource: 'CUSTOM',
        description: descriptionRaw,
        quantity,
        unit: unitRaw,
        sortOrder: index,
      };
    })
    .filter(Boolean);
}

function parseBoolean(value) {
  const raw = readString(value).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'ja';
}

function optionalObjectId(value) {
  const raw = readString(value);
  return mongoose.Types.ObjectId.isValid(raw) ? raw : null;
}

function readString(value) {
  return `${value ?? ''}`.trim();
}

function nullableString(value) {
  const text = readString(value);
  return text || null;
}

function rowError(row, field, message) {
  return { row, field, message };
}

const reportService = new ReportService();
export default reportService;
