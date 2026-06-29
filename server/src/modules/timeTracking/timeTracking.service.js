import mongoose from 'mongoose';
import { parse } from 'csv-parse/sync';
import TimeEntry from '../mobile/timeEntry.model.js';
import timeEntryService from '../mobile/timeEntry.service.js';
import LeaveRequest from './leaveRequest.model.js';
import VacationBalance from './vacationBalance.model.js';
import EmployeeAvailability from '../deploy/employeeAvailability.model.js';
import Assignment from '../deploy/assignment.model.js';
import User from '../auth/user.model.js';
import auditService from '../auth/audit.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';
import { emitTimeTrackingRealtimeEvent } from '../../shared/socket/socketServer.js';

const DEFAULT_WORKDAY_MINUTES = 8 * 60;
const MAX_EXPORT_ROWS = 10000;
const MAX_LIST_ROWS = 1000;
const MAX_IMPORT_ROWS = 1000;
const TIME_ENTRY_IMPORT_COLUMNS = [
  'orderId',
  'technicianId',
  'date',
  'startTime',
  'endTime',
  'breakDurationMin',
  'activityType',
  'note',
];
const TIME_ENTRY_IMPORT_SAMPLE = {
  orderId: '66f000000000000000000001',
  technicianId: '',
  date: '2026-06-29',
  startTime: '08:00',
  endTime: '17:00',
  breakDurationMin: '30',
  activityType: 'ONSITE_WORK',
  note: 'Imported maintenance visit',
};
const IMPORT_ACTIVITY_TYPES = ['TRAVEL', 'ONSITE_WORK', 'ADMINISTRATIVE', 'OTHER'];

const TIME_ENTRY_POPULATE = [
  { path: 'technicianId', select: 'firstName lastName email department position' },
  {
    path: 'orderId',
    select: 'assignmentNumber title projectId customerId siteId status priority startDatetime endDatetime',
    populate: [
      { path: 'projectId', select: 'name projectNumber customerName' },
      { path: 'customerId', select: 'name email' },
      { path: 'siteId', select: 'name street postalCode city' },
    ],
  },
  { path: 'overriddenBy', select: 'firstName lastName email' },
];

function normalizeId(value) {
  if (!value) return null;
  return String(value._id || value);
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function startOfDay(value) {
  const date = value ? new Date(value) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = value ? new Date(value) : new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function parseRange(filters = {}) {
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultTo = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    from: startOfDay(filters.dateFrom || defaultFrom),
    to: endOfDay(filters.dateTo || defaultTo),
  };
}

function eachDate(start, end) {
  const days = [];
  const current = startOfDay(start);
  const last = startOfDay(end);
  while (current <= last) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function isWeekend(value) {
  const day = new Date(value).getDay();
  return day === 0 || day === 6;
}

function parseTimeMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesFromAvailability(record, date) {
  if (!record) return isWeekend(date) ? 0 : DEFAULT_WORKDAY_MINUTES;
  if (record.availabilityType !== 'WORKING') return 0;
  const start = parseTimeMinutes(record.workStart);
  const end = parseTimeMinutes(record.workEnd);
  if (start == null || end == null || end <= start) return DEFAULT_WORKDAY_MINUTES;
  return end - start;
}

function businessDayCount(start, end) {
  return eachDate(start, end).filter((day) => !isWeekend(day)).length;
}

function requestedDaysFor(data) {
  if (data.unit === 'HOURS') return round2((Number(data.hours) || 0) / 8);
  return businessDayCount(data.startDate, data.endDate);
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function minutesToHours(minutes) {
  return round2((Number(minutes) || 0) / 60);
}

function buildName(user) {
  if (!user) return '';
  return `${user.firstName || ''} ${user.lastName || ''}`.trim();
}

function addToGroup(map, key, label, minutes) {
  const current = map.get(key) || { key, label, actualMinutes: 0, entries: 0 };
  current.actualMinutes += minutes;
  current.entries += 1;
  map.set(key, current);
}

function getWeekKey(value) {
  const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
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

function rowError(row, field, message) {
  return { row, field, message };
}

function readCell(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== '') return row[key];
  }
  return '';
}

function parseCsvRows(file) {
  if (!file?.buffer) {
    throw new ConflictError('Time entry import file is required.');
  }

  try {
    return parse(file.buffer.toString('utf8'), {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw new ValidationError('Time entry import CSV could not be parsed.', [
      { field: 'file', message: err.message || 'Invalid CSV file.' },
    ]);
  }
}

function parseDateOnly(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00.000Z`)
    : new Date(text);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function parseDateTime(date, value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const candidate = text.includes('T')
    ? new Date(text)
    : new Date(`${dateKey(date)}T${text.length === 5 ? `${text}:00` : text}.000Z`);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function normalizeImportRow(row, rowNumber, fallbackTechnicianId) {
  const errors = [];
  const orderId = String(readCell(row, ['orderId', 'assignmentId', 'jobId']) || '').trim();
  const technicianId = String(readCell(row, ['technicianId', 'employeeId', 'userId']) || fallbackTechnicianId || '').trim();
  const date = parseDateOnly(readCell(row, ['date', 'workDate']));
  const startTime = date ? parseDateTime(date, readCell(row, ['startTime', 'start'])) : null;
  const endTime = date ? parseDateTime(date, readCell(row, ['endTime', 'end'])) : null;
  const breakDurationMin = Number(readCell(row, ['breakDurationMin', 'breakMinutes', 'break']) || 0);
  const activityType = String(readCell(row, ['activityType', 'activity']) || '').trim().toUpperCase();
  const note = String(readCell(row, ['note', 'notes']) || '').trim();

  if (!isObjectId(orderId)) errors.push(rowError(rowNumber, 'orderId', 'Valid orderId is required.'));
  if (!isObjectId(technicianId)) errors.push(rowError(rowNumber, 'technicianId', 'Valid technicianId is required, or leave it blank for the importing user.'));
  if (!date) errors.push(rowError(rowNumber, 'date', 'Valid date is required.'));
  if (!startTime) errors.push(rowError(rowNumber, 'startTime', 'Valid startTime is required. Use HH:mm or ISO date-time.'));
  if (!endTime) errors.push(rowError(rowNumber, 'endTime', 'Valid endTime is required. Use HH:mm or ISO date-time.'));
  if (startTime && endTime && endTime <= startTime) errors.push(rowError(rowNumber, 'endTime', 'endTime must be after startTime.'));
  if (!Number.isFinite(breakDurationMin) || breakDurationMin < 0) errors.push(rowError(rowNumber, 'breakDurationMin', 'breakDurationMin must be zero or greater.'));
  if (startTime && endTime && Number.isFinite(breakDurationMin)) {
    const grossMinutes = (endTime - startTime) / 60000;
    if (breakDurationMin >= grossMinutes) errors.push(rowError(rowNumber, 'breakDurationMin', 'breakDurationMin must be less than the gross duration.'));
  }
  if (!IMPORT_ACTIVITY_TYPES.includes(activityType)) {
    errors.push(rowError(rowNumber, 'activityType', `activityType must be one of: ${IMPORT_ACTIVITY_TYPES.join(', ')}.`));
  }
  if (note.length > 500) errors.push(rowError(rowNumber, 'note', 'note cannot exceed 500 characters.'));

  if (errors.length) return { errors };

  return {
    errors,
    value: {
      row: rowNumber,
      orderId,
      technicianId,
      payload: {
        date,
        startTime,
        endTime,
        breakDurationMin,
        activityType,
        note: note || null,
      },
    },
  };
}

class TimeTrackingService {
  async listTimeEntries(filters = {}) {
    const limit = Math.min(Number(filters.limit) || 500, MAX_LIST_ROWS);
    return this._findTimeEntries(filters, limit);
  }

  async createTimeEntry(orderId, data, userId, meta = {}) {
    return timeEntryService.create(orderId, data, userId, meta);
  }

  async updateTimeEntry(entryId, data, userId, meta = {}) {
    return timeEntryService.update(entryId, data, userId, meta);
  }

  async deleteTimeEntry(entryId, userId, meta = {}) {
    return timeEntryService.delete(entryId, userId, meta);
  }

  async releaseTimeEntry(entryId, userId, meta = {}) {
    return timeEntryService.release(entryId, userId, meta);
  }

  async overrideTimeEntry(entryId, justification, userId, meta = {}) {
    return timeEntryService.override(entryId, justification, userId, meta);
  }

  async getOverview(filters = {}) {
    const range = parseRange(filters);
    const [entries, employees, availability, leaveRequests] = await Promise.all([
      this._findTimeEntries({ ...filters, dateFrom: range.from, dateTo: range.to }, MAX_EXPORT_ROWS),
      this._findEmployees(filters),
      this._findAvailability(filters, range),
      this._findLeaveRequests({ ...filters, dateFrom: range.from, dateTo: range.to }),
    ]);

    const employeeMap = new Map();
    for (const employee of employees) {
      employeeMap.set(normalizeId(employee._id), employee);
    }
    for (const entry of entries) {
      const employeeId = normalizeId(entry.technicianId);
      if (employeeId && !employeeMap.has(employeeId) && typeof entry.technicianId === 'object') {
        employeeMap.set(employeeId, entry.technicianId);
      }
    }

    const availabilityByEmployeeDay = new Map();
    for (const record of availability) {
      availabilityByEmployeeDay.set(`${normalizeId(record.employeeId)}:${dateKey(record.date)}`, record);
    }

    const actualByEmployee = new Map();
    const statusCounts = { PENDING: 0, RELEASED: 0, LOCKED: 0 };
    const groupings = this._buildGroupings(entries);
    for (const entry of entries) {
      const employeeId = normalizeId(entry.technicianId);
      const minutes = Number(entry.netDurationMin || 0);
      actualByEmployee.set(employeeId, (actualByEmployee.get(employeeId) || 0) + minutes);
      if (entry.releaseStatus && statusCounts[entry.releaseStatus] != null) statusCounts[entry.releaseStatus] += 1;
    }

    const days = eachDate(range.from, range.to);
    const byEmployee = [...employeeMap.entries()].map(([employeeId, employee]) => {
      const targetMinutes = days.reduce((sum, day) => {
        const record = availabilityByEmployeeDay.get(`${employeeId}:${dateKey(day)}`);
        return sum + minutesFromAvailability(record, day);
      }, 0);
      const actualMinutes = actualByEmployee.get(employeeId) || 0;
      return {
        employeeId,
        employeeName: buildName(employee) || employee.email || employeeId,
        department: employee.department || null,
        targetMinutes,
        actualMinutes,
        overtimeMinutes: Math.max(actualMinutes - targetMinutes, 0),
        deficitMinutes: Math.max(targetMinutes - actualMinutes, 0),
        actualHours: minutesToHours(actualMinutes),
        targetHours: minutesToHours(targetMinutes),
        overtimeHours: minutesToHours(Math.max(actualMinutes - targetMinutes, 0)),
        deficitHours: minutesToHours(Math.max(targetMinutes - actualMinutes, 0)),
      };
    }).sort((a, b) => b.actualMinutes - a.actualMinutes);

    const totals = byEmployee.reduce((acc, row) => {
      acc.targetMinutes += row.targetMinutes;
      acc.actualMinutes += row.actualMinutes;
      acc.overtimeMinutes += row.overtimeMinutes;
      acc.deficitMinutes += row.deficitMinutes;
      return acc;
    }, {
      targetMinutes: 0,
      actualMinutes: 0,
      overtimeMinutes: 0,
      deficitMinutes: 0,
      totalEntries: entries.length,
      pendingEntries: statusCounts.PENDING,
      releasedEntries: statusCounts.RELEASED,
      lockedEntries: statusCounts.LOCKED,
      pendingLeaveRequests: leaveRequests.filter((item) => item.status === 'PENDING').length,
      approvedLeaveRequests: leaveRequests.filter((item) => item.status === 'APPROVED').length,
    });

    totals.targetHours = minutesToHours(totals.targetMinutes);
    totals.actualHours = minutesToHours(totals.actualMinutes);
    totals.overtimeHours = minutesToHours(totals.overtimeMinutes);
    totals.deficitHours = minutesToHours(totals.deficitMinutes);

    return {
      range: { dateFrom: range.from, dateTo: range.to },
      totals,
      byEmployee,
      groupings,
      insights: this._buildInsights(totals, byEmployee, leaveRequests),
    };
  }

  async exportTimeEntries(filters = {}) {
    const entries = await this._findTimeEntries(filters, MAX_EXPORT_ROWS);
    const rows = entries.map((entry) => {
      const order = entry.orderId && typeof entry.orderId === 'object' ? entry.orderId : null;
      const project = order?.projectId && typeof order.projectId === 'object' ? order.projectId : null;
      const customer = order?.customerId && typeof order.customerId === 'object' ? order.customerId : null;
      return {
        date: dateKey(entry.date),
        technician: buildName(entry.technicianId),
        activityType: entry.activityType,
        order: order?.assignmentNumber || order?.title || '',
        project: project?.projectNumber || project?.name || '',
        customer: customer?.name || project?.customerName || '',
        startTime: entry.startTime ? new Date(entry.startTime).toISOString() : '',
        endTime: entry.endTime ? new Date(entry.endTime).toISOString() : '',
        breakMinutes: entry.breakDurationMin || 0,
        netHours: minutesToHours(entry.netDurationMin || 0),
        releaseStatus: entry.releaseStatus,
        note: entry.note || '',
      };
    });
    return {
      filename: `time-records-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv(rows),
    };
  }

  async getImportTemplate() {
    return toCsv([TIME_ENTRY_IMPORT_SAMPLE], TIME_ENTRY_IMPORT_COLUMNS);
  }

  async importTimeEntriesCsv(file, options = {}, userId, meta = {}) {
    const rows = parseCsvRows(file);
    if (rows.length === 0) {
      throw new ValidationError('Time entry import file is empty.');
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ConflictError(`Time entry import is limited to ${MAX_IMPORT_ROWS} rows per file.`);
    }

    const dryRun = options.dryRun === true || options.dryRun === 'true';
    const prepared = [];
    const rowErrors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const result = normalizeImportRow(rows[index], rowNumber, normalizeId(userId));
      if (result.errors.length) rowErrors.push(...result.errors);
      else prepared.push(result.value);
    }

    if (prepared.length) {
      const orderIds = [...new Set(prepared.map((item) => item.orderId))];
      const technicianIds = [...new Set(prepared.map((item) => item.technicianId))];
      const [orders, technicians] = await Promise.all([
        Assignment.find({ _id: { $in: orderIds } }).select('_id').lean(),
        User.find({ _id: { $in: technicianIds }, status: 'active' }).select('_id').lean(),
      ]);
      const existingOrderIds = new Set(orders.map((item) => normalizeId(item._id)));
      const activeTechnicianIds = new Set(technicians.map((item) => normalizeId(item._id)));

      for (const item of prepared) {
        if (!existingOrderIds.has(item.orderId)) {
          rowErrors.push(rowError(item.row, 'orderId', 'Referenced order was not found.'));
        }
        if (!activeTechnicianIds.has(item.technicianId)) {
          rowErrors.push(rowError(item.row, 'technicianId', 'Referenced technician was not found or is inactive.'));
        }
      }
    }

    const invalidRows = new Set(rowErrors.map((error) => error.row));
    const summary = {
      dryRun,
      totalRows: rows.length,
      validRows: prepared.filter((item) => !invalidRows.has(item.row)).length,
      created: 0,
      skipped: rowErrors.length ? invalidRows.size : 0,
      failed: invalidRows.size,
      rowErrors,
    };

    if (dryRun || rowErrors.length) return summary;

    for (const item of prepared) {
      try {
        await timeEntryService.create(
          item.orderId,
          item.payload,
          item.technicianId,
          { ...meta, source: 'time-tracking-import' },
        );
        summary.created += 1;
      } catch (err) {
        summary.failed += 1;
        summary.rowErrors.push(rowError(item.row, 'row', err.message || 'Time entry could not be imported.'));
      }
    }

    summary.skipped = prepared.length - summary.created;

    auditService.logEvent({
      eventType: 'time-entry.imported',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: summary.failed > 0 ? 'partial' : 'success',
      module: 'time-tracking',
      details: {
        totalRows: summary.totalRows,
        created: summary.created,
        failed: summary.failed,
      },
    });

    return summary;
  }

  async listLeaveRequests(filters = {}) {
    return this._findLeaveRequests(filters);
  }

  async createLeaveRequest(data, userId, meta = {}) {
    const employeeId = data.employeeId || userId;
    const startDate = startOfDay(data.startDate);
    const endDate = endOfDay(data.endDate);
    if (endDate < startDate) throw new ConflictError('Leave request end date must be after start date.');

    await this._assertNoLeaveOverlap(employeeId, startDate, endDate);

    const request = await LeaveRequest.create({
      employeeId,
      leaveType: data.leaveType,
      startDate,
      endDate,
      unit: data.unit || 'DAYS',
      hours: data.unit === 'HOURS' ? Number(data.hours || 0) : null,
      requestedDays: requestedDaysFor({ ...data, startDate, endDate }),
      reason: data.reason || null,
      createdBy: userId,
    });

    await this._notifyTimeAdmins(request);
    auditService.logEvent({
      eventType: 'time.leave_request.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      module: 'time-tracking',
      details: { leaveRequestId: request._id, employeeId, leaveType: request.leaveType },
    });
    eventBus.publish(EVENT_TYPES.TIME_LEAVE_REQUEST_CREATED, {
      leaveRequestId: request._id,
      employeeId,
      leaveType: request.leaveType,
    }, { source: 'time-tracking' });
    emitTimeTrackingRealtimeEvent({ type: 'leave.created', leaveRequestId: request._id, employeeId, leaveType: request.leaveType });

    return this.getLeaveRequestById(request._id);
  }

  async getLeaveRequestById(id) {
    const request = await LeaveRequest.findById(id)
      .populate('employeeId', 'firstName lastName email department')
      .populate('reviewedBy', 'firstName lastName email')
      .lean();
    if (!request) throw new NotFoundError('LeaveRequest', id);
    return request;
  }

  async approveLeaveRequest(id, data, userId, meta = {}) {
    const request = await LeaveRequest.findById(id);
    if (!request) throw new NotFoundError('LeaveRequest', id);
    if (request.status !== 'PENDING') throw new ConflictError('Only pending leave requests can be approved.');

    request.status = 'APPROVED';
    request.reviewedBy = userId;
    request.reviewedAt = new Date();
    request.decisionNote = data.decisionNote || null;
    request.updatedBy = userId;
    await request.save();

    await this._syncApprovedLeaveToAvailability(request);
    await this._notifyEmployee(request.employeeId, {
      notificationType: 'LEAVE_APPROVED',
      title: 'Leave request approved',
      body: `${request.leaveType} request was approved.`,
      deepLink: '/field-ops/time?tab=leave',
      relatedEntityType: 'LeaveRequest',
      relatedEntityId: request._id,
    });

    auditService.logEvent({
      eventType: 'time.leave_request.approved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      module: 'time-tracking',
      details: { leaveRequestId: id, employeeId: request.employeeId },
    });
    eventBus.publish(EVENT_TYPES.TIME_LEAVE_REQUEST_APPROVED, {
      leaveRequestId: id,
      employeeId: request.employeeId,
    }, { source: 'time-tracking' });
    emitTimeTrackingRealtimeEvent({ type: 'leave.approved', leaveRequestId: id, employeeId: request.employeeId });

    return this.getLeaveRequestById(id);
  }

  async rejectLeaveRequest(id, data, userId, meta = {}) {
    const request = await LeaveRequest.findById(id);
    if (!request) throw new NotFoundError('LeaveRequest', id);
    if (request.status !== 'PENDING') throw new ConflictError('Only pending leave requests can be rejected.');

    request.status = 'REJECTED';
    request.reviewedBy = userId;
    request.reviewedAt = new Date();
    request.decisionNote = data.decisionNote;
    request.updatedBy = userId;
    await request.save();

    await this._notifyEmployee(request.employeeId, {
      notificationType: 'LEAVE_REJECTED',
      title: 'Leave request rejected',
      body: `${request.leaveType} request was rejected.`,
      deepLink: '/field-ops/time?tab=leave',
      relatedEntityType: 'LeaveRequest',
      relatedEntityId: request._id,
    });

    auditService.logEvent({
      eventType: 'time.leave_request.rejected',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      module: 'time-tracking',
      details: { leaveRequestId: id, employeeId: request.employeeId, decisionNote: data.decisionNote },
    });
    eventBus.publish(EVENT_TYPES.TIME_LEAVE_REQUEST_REJECTED, {
      leaveRequestId: id,
      employeeId: request.employeeId,
    }, { source: 'time-tracking' });
    emitTimeTrackingRealtimeEvent({ type: 'leave.rejected', leaveRequestId: id, employeeId: request.employeeId });

    return this.getLeaveRequestById(id);
  }

  async cancelLeaveRequest(id, userId, meta = {}) {
    const request = await LeaveRequest.findById(id);
    if (!request) throw new NotFoundError('LeaveRequest', id);
    if (request.status === 'CANCELLED') return this.getLeaveRequestById(id);

    request.status = 'CANCELLED';
    request.updatedBy = userId;
    await request.save();
    if (request.reviewedAt) {
      await EmployeeAvailability.deleteMany({
        employeeId: request.employeeId,
        date: { $gte: startOfDay(request.startDate), $lte: endOfDay(request.endDate) },
        availabilityType: request.leaveType,
      });
    }

    auditService.logEvent({
      eventType: 'time.leave_request.cancelled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      module: 'time-tracking',
      details: { leaveRequestId: id, employeeId: request.employeeId },
    });
    emitTimeTrackingRealtimeEvent({ type: 'leave.cancelled', leaveRequestId: id, employeeId: request.employeeId });

    return this.getLeaveRequestById(id);
  }

  async getVacationBalances(filters = {}) {
    const year = Number(filters.year) || new Date().getFullYear();
    const employees = await this._findEmployees(filters);
    const employeeIds = employees.map((employee) => normalizeId(employee._id));
    const [balances, requests] = await Promise.all([
      VacationBalance.find({ employeeId: { $in: employeeIds }, year }).lean(),
      LeaveRequest.find({
        employeeId: { $in: employeeIds },
        leaveType: 'VACATION',
        startDate: { $lte: endOfDay(new Date(year, 11, 31)) },
        endDate: { $gte: startOfDay(new Date(year, 0, 1)) },
        status: { $in: ['PENDING', 'APPROVED'] },
      }).lean(),
    ]);

    const balanceByEmployee = new Map(balances.map((balance) => [normalizeId(balance.employeeId), balance]));
    const today = startOfDay(new Date());
    const requestStats = new Map();
    for (const request of requests) {
      const employeeId = normalizeId(request.employeeId);
      const current = requestStats.get(employeeId) || { used: 0, planned: 0 };
      const days = Number(request.requestedDays || requestedDaysFor(request));
      if (request.status === 'APPROVED' && endOfDay(request.endDate) < today) current.used += days;
      else current.planned += days;
      requestStats.set(employeeId, current);
    }

    return employees.map((employee) => {
      const employeeId = normalizeId(employee._id);
      const config = balanceByEmployee.get(employeeId) || {};
      const stats = requestStats.get(employeeId) || { used: 0, planned: 0 };
      const entitlement = Number(config.annualEntitlementDays ?? 25);
      const carryover = Number(config.carryoverDays || 0);
      const adjustment = Number(config.manualAdjustmentDays || 0);
      const total = entitlement + carryover + adjustment;
      return {
        employeeId,
        employeeName: buildName(employee) || employee.email,
        year,
        annualEntitlementDays: entitlement,
        carryoverDays: carryover,
        manualAdjustmentDays: adjustment,
        usedVacationDays: round2(stats.used),
        plannedVacationDays: round2(stats.planned),
        availableVacationDays: round2(total - stats.used - stats.planned),
        notes: config.notes || null,
      };
    });
  }

  async upsertVacationBalance(employeeId, year, data, userId) {
    return VacationBalance.findOneAndUpdate(
      { employeeId, year },
      {
        $set: {
          annualEntitlementDays: data.annualEntitlementDays,
          carryoverDays: data.carryoverDays || 0,
          manualAdjustmentDays: data.manualAdjustmentDays || 0,
          notes: data.notes || null,
          updatedBy: userId,
        },
        $setOnInsert: { createdBy: userId },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
  }

  async getCalendar(filters = {}) {
    const range = parseRange(filters);
    const [overview, leaveRequests, availability] = await Promise.all([
      this.getOverview(filters),
      this._findLeaveRequests({ ...filters, dateFrom: range.from, dateTo: range.to }),
      this._findAvailability(filters, range),
    ]);

    const byEmployee = new Map(overview.byEmployee.map((employee) => [employee.employeeId, {
      ...employee,
      days: eachDate(range.from, range.to).map((day) => ({
        date: dateKey(day),
        targetMinutes: 0,
        actualMinutes: 0,
        availabilityType: null,
        leaveStatus: null,
      })),
    }]));

    for (const record of availability) {
      const employeeId = normalizeId(record.employeeId);
      const employee = byEmployee.get(employeeId);
      if (!employee) continue;
      const day = employee.days.find((item) => item.date === dateKey(record.date));
      if (day) {
        day.availabilityType = record.availabilityType;
        day.targetMinutes = minutesFromAvailability(record, record.date);
      }
    }

    for (const request of leaveRequests) {
      const employeeId = normalizeId(request.employeeId);
      const employee = byEmployee.get(employeeId);
      if (!employee) continue;
      for (const dayValue of eachDate(request.startDate, request.endDate)) {
        const day = employee.days.find((item) => item.date === dateKey(dayValue));
        if (day) {
          day.availabilityType = request.leaveType;
          day.leaveStatus = request.status;
        }
      }
    }

    return {
      range: { dateFrom: range.from, dateTo: range.to },
      employees: [...byEmployee.values()],
    };
  }

  async getAnalytics(filters = {}) {
    const overview = await this.getOverview(filters);
    const groupBy = filters.groupBy || 'employee';
    const groups = overview.groupings[groupBy] || overview.groupings.employee;
    return {
      range: overview.range,
      groupBy,
      groups,
      totals: overview.totals,
      insights: overview.insights,
    };
  }

  async getAiContext(filters = {}) {
    const [overview, balances] = await Promise.all([
      this.getOverview(filters),
      this.getVacationBalances({ employeeId: filters.employeeId, year: filters.year }),
    ]);
    return {
      summary: overview.totals,
      topOvertime: overview.byEmployee.filter((row) => row.overtimeMinutes > 0).slice(0, 5),
      topDeficit: overview.byEmployee.filter((row) => row.deficitMinutes > 0).slice(0, 5),
      leavePressure: balances.filter((row) => row.availableVacationDays < 5).slice(0, 5),
      recommendations: overview.insights,
    };
  }

  async _findTimeEntries(filters = {}, limit = MAX_LIST_ROWS) {
    const filter = await this._buildTimeEntryFilter(filters);
    return TimeEntry.find(filter)
      .sort({ date: -1, startTime: -1 })
      .limit(limit)
      .populate(TIME_ENTRY_POPULATE)
      .lean();
  }

  async _buildTimeEntryFilter(filters = {}) {
    const query = {};
    if (filters.employeeId || filters.technicianId) query.technicianId = filters.employeeId || filters.technicianId;
    if (filters.orderId) query.orderId = filters.orderId;
    if (filters.releaseStatus) query.releaseStatus = filters.releaseStatus;
    if (filters.activityType) query.activityType = filters.activityType;
    if (filters.dateFrom || filters.dateTo) {
      query.date = {};
      if (filters.dateFrom) query.date.$gte = startOfDay(filters.dateFrom);
      if (filters.dateTo) query.date.$lte = endOfDay(filters.dateTo);
    }

    if ((filters.projectId || filters.customerId) && !filters.orderId) {
      const assignmentFilter = {};
      if (filters.projectId) assignmentFilter.projectId = filters.projectId;
      if (filters.customerId) assignmentFilter.customerId = filters.customerId;
      const assignmentIds = await Assignment.find(assignmentFilter).select('_id').lean();
      query.orderId = { $in: assignmentIds.map((assignment) => assignment._id) };
    }

    return query;
  }

  async _findEmployees(filters = {}) {
    if (filters.employeeId && isObjectId(filters.employeeId)) {
      return User.find({ _id: filters.employeeId, status: 'active' })
        .select('firstName lastName email department position')
        .lean();
    }
    return User.find({ status: 'active' })
      .select('firstName lastName email department position')
      .sort({ firstName: 1, lastName: 1 })
      .limit(500)
      .lean();
  }

  async _findAvailability(filters = {}, range = parseRange(filters)) {
    const query = {
      date: { $gte: startOfDay(range.from), $lte: endOfDay(range.to) },
    };
    if (filters.employeeId) query.employeeId = filters.employeeId;
    return EmployeeAvailability.find(query).lean();
  }

  async _findLeaveRequests(filters = {}) {
    const query = {};
    if (filters.employeeId) query.employeeId = filters.employeeId;
    if (filters.status) query.status = filters.status;
    if (filters.leaveType) query.leaveType = filters.leaveType;
    if (filters.dateTo) query.startDate = { $lte: endOfDay(filters.dateTo) };
    if (filters.dateFrom) query.endDate = { $gte: startOfDay(filters.dateFrom) };
    return LeaveRequest.find(query)
      .sort({ startDate: -1, createdAt: -1 })
      .populate('employeeId', 'firstName lastName email department')
      .populate('reviewedBy', 'firstName lastName email')
      .limit(Math.min(Number(filters.limit) || 500, MAX_LIST_ROWS))
      .lean();
  }

  _buildGroupings(entries) {
    const maps = {
      employee: new Map(),
      day: new Map(),
      week: new Map(),
      month: new Map(),
      project: new Map(),
      job: new Map(),
      customer: new Map(),
    };

    for (const entry of entries) {
      const minutes = Number(entry.netDurationMin || 0);
      const date = new Date(entry.date);
      const order = entry.orderId && typeof entry.orderId === 'object' ? entry.orderId : null;
      const project = order?.projectId && typeof order.projectId === 'object' ? order.projectId : null;
      const customer = order?.customerId && typeof order.customerId === 'object' ? order.customerId : null;
      addToGroup(maps.employee, normalizeId(entry.technicianId) || 'unknown', buildName(entry.technicianId) || 'Unknown', minutes);
      addToGroup(maps.day, dateKey(date), dateKey(date), minutes);
      addToGroup(maps.week, getWeekKey(date), getWeekKey(date), minutes);
      addToGroup(maps.month, `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, minutes);
      addToGroup(maps.project, normalizeId(project) || 'none', project?.projectNumber || project?.name || 'No project', minutes);
      addToGroup(maps.job, normalizeId(order) || 'none', order?.assignmentNumber || order?.title || 'No job', minutes);
      addToGroup(maps.customer, normalizeId(customer) || project?.customerName || 'none', customer?.name || project?.customerName || 'No customer', minutes);
    }

    return Object.fromEntries(Object.entries(maps).map(([key, map]) => [
      key,
      [...map.values()]
        .map((row) => ({ ...row, actualHours: minutesToHours(row.actualMinutes) }))
        .sort((a, b) => b.actualMinutes - a.actualMinutes),
    ]));
  }

  _buildInsights(totals, byEmployee, leaveRequests) {
    const insights = [];
    if (totals.pendingEntries > 0) insights.push(`${totals.pendingEntries} time entries are still pending release.`);
    if (totals.deficitMinutes > 0) insights.push(`Current period has ${minutesToHours(totals.deficitMinutes)} deficit hours against target.`);
    if (totals.overtimeMinutes > 0) insights.push(`Current period has ${minutesToHours(totals.overtimeMinutes)} overtime hours.`);
    const pendingLeave = leaveRequests.filter((request) => request.status === 'PENDING').length;
    if (pendingLeave > 0) insights.push(`${pendingLeave} leave requests need approval.`);
    const heavyOvertime = byEmployee.find((row) => row.overtimeMinutes >= 8 * 60);
    if (heavyOvertime) insights.push(`${heavyOvertime.employeeName} has more than one workday of overtime.`);
    if (!insights.length) insights.push('No immediate workforce planning risks detected for the selected period.');
    return insights;
  }

  async _assertNoLeaveOverlap(employeeId, startDate, endDate) {
    const overlap = await LeaveRequest.findOne({
      employeeId,
      status: { $in: ['PENDING', 'APPROVED'] },
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    }).lean();
    if (overlap) throw new ConflictError('Employee already has a pending or approved leave request in this date range.');
  }

  async _syncApprovedLeaveToAvailability(request) {
    const records = eachDate(request.startDate, request.endDate).map((date) => ({
      updateOne: {
        filter: { employeeId: request.employeeId, date: startOfDay(date) },
        update: {
          $set: {
            employeeId: request.employeeId,
            date: startOfDay(date),
            availabilityType: request.leaveType,
            workStart: null,
            workEnd: null,
            notes: request.reason || request.decisionNote || 'Approved leave request',
          },
        },
        upsert: true,
      },
    }));
    if (records.length > 0) await EmployeeAvailability.bulkWrite(records);
  }

  async _notifyEmployee(employeeId, payload) {
    try {
      const { default: notificationService } = await import('../mobile/notification.service.js');
      await notificationService.sendNotification(employeeId, payload);
    } catch (err) {
      logger.warn('Failed to send time-tracking notification', {
        module: 'time-tracking',
        action: 'notifyEmployee',
        employeeId,
        error: err.message,
      });
    }
  }

  async _notifyTimeAdmins(request) {
    try {
      const admins = await User.find({ status: 'active' })
        .populate('role', 'name')
        .select('firstName lastName email role')
        .limit(100)
        .lean();
      const recipients = admins.filter((user) => user.role?.name === 'Admin').map((user) => user._id);
      await Promise.all(recipients.map((userId) => this._notifyEmployee(userId, {
        notificationType: 'LEAVE_REQUEST_NEW',
        title: 'New leave request',
        body: `A ${request.leaveType} request needs approval.`,
        deepLink: '/field-ops/time?tab=leave',
        relatedEntityType: 'LeaveRequest',
        relatedEntityId: request._id,
      })));
    } catch (err) {
      logger.warn('Failed to notify time admins', {
        module: 'time-tracking',
        action: 'notifyTimeAdmins',
        error: err.message,
      });
    }
  }
}

const timeTrackingService = new TimeTrackingService();
export default timeTrackingService;
