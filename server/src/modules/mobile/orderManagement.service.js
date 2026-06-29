import { parse } from 'csv-parse/sync';
import mongoose from 'mongoose';
import assignmentRepository from '../deploy/assignment.repository.js';
import assignmentService from '../deploy/assignment.service.js';
import counterService from '../deploy/counter.service.js';
import appointmentService from '../deploy/appointment.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { ConflictError, ValidationError } from '../../shared/errors/AppError.js';

const EXPORT_LIMIT = 5000;
const IMPORT_LIMIT = 500;
const ASSIGNMENT_TYPES = ['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER'];
const ORDER_STATUSES = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'];
const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];
const ASSIGNMENT_TARGET_TYPES = ['EMPLOYEE', 'TEAM', 'DEPARTMENT'];

const ORDER_EXPORT_COLUMNS = [
  'assignmentNumber',
  'title',
  'assignmentType',
  'status',
  'priority',
  'scheduledStart',
  'scheduledEnd',
  'employeeId',
  'employeeName',
  'assignmentTargetType',
  'assignmentTargetId',
  'assignmentTargetLabel',
  'projectId',
  'projectNumber',
  'projectName',
  'customerId',
  'customerName',
  'siteId',
  'siteName',
  'siteAddress',
  'customerPhone',
  'customerEmail',
  'instructions',
  'createdAt',
  'updatedAt',
];

const ORDER_IMPORT_TEMPLATE_COLUMNS = [
  'orderType',
  'title',
  'scheduledStart',
  'scheduledEnd',
  'priority',
  'status',
  'employeeId',
  'assignmentTargetType',
  'assignmentTargetId',
  'assignmentTargetLabel',
  'projectId',
  'customerId',
  'siteId',
  'customerName',
  'customerPhone',
  'customerEmail',
  'siteAddress',
  'accessInstructions',
  'parkingInfo',
  'description',
  'scopeOfWork',
  'specialInstructions',
  'overrideConflicts',
  'overrideReason',
];

function normalizeId(value) {
  if (!value) return null;
  return String(value._id || value);
}

function uniqueIds(values) {
  return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function normalizeTargetType(value) {
  return ASSIGNMENT_TARGET_TYPES.includes(value) ? value : 'EMPLOYEE';
}

async function findUsersForTarget(targetId) {
  const normalizedTarget = String(targetId || '').trim();
  if (!normalizedTarget) return [];

  const { default: User } = await import('../auth/user.model.js');
  return User.find({
    status: 'active',
    $or: [
      { department: normalizedTarget },
      { 'preferences.preferredDepartmentId': normalizedTarget },
    ],
  })
    .select('_id firstName lastName email')
    .lean();
}

async function resolveAssignmentTarget(body = {}) {
  const requestedType = normalizeTargetType(
    body.assignmentTargetType || (body.teamId ? 'TEAM' : body.departmentId ? 'DEPARTMENT' : 'EMPLOYEE'),
  );

  if (requestedType === 'EMPLOYEE') {
    const employeeIds = uniqueIds([
      ...(Array.isArray(body.employeeIds) ? body.employeeIds : []),
      body.employeeId,
    ]);
    return {
      type: 'EMPLOYEE',
      targetId: null,
      targetLabel: null,
      employeeIds,
      recipientIds: employeeIds,
    };
  }

  const targetId = String(body.assignmentTargetId || body.teamId || body.departmentId || '').trim();
  if (!targetId) {
    return {
      type: 'EMPLOYEE',
      targetId: null,
      targetLabel: null,
      employeeIds: [],
      recipientIds: [],
    };
  }

  const targetUsers = await findUsersForTarget(targetId);
  const recipientIds = uniqueIds(targetUsers.map((user) => user._id));

  return {
    type: requestedType,
    targetId,
    targetLabel: body.assignmentTargetLabel || targetId || requestedType,
    employeeIds: [],
    recipientIds,
  };
}

class OrderManagementService {
  async createOrder(input = {}, userId, meta = {}, options = {}) {
    const {
      orderType, assignmentType,
      title, description, scopeOfWork, specialInstructions,
      priority, scheduledStart, scheduledEnd,
      projectId,
      customerId, siteId,
      customerName, customerPhone, customerEmail,
      siteAddress, accessInstructions, parkingInfo,
    } = input;

    const resolvedType = assignmentType || orderType;
    if (!resolvedType) {
      throw new ValidationError('orderType is required');
    }

    const now = new Date();
    const startDatetime = scheduledStart ? new Date(scheduledStart) : now;
    const endDatetime = scheduledEnd ? new Date(scheduledEnd) : new Date(now.getTime() + 8 * 3600 * 1000);
    if (Number.isNaN(startDatetime.getTime()) || Number.isNaN(endDatetime.getTime())) {
      throw new ValidationError('scheduledStart and scheduledEnd must be valid dates.');
    }
    if (endDatetime <= startDatetime) {
      throw new ValidationError('scheduledEnd must be after scheduledStart.');
    }

    const instructionsParts = [description, scopeOfWork, specialInstructions].filter(Boolean);
    const instructions = instructionsParts.join('\n\n') || null;
    const appointment = customerName || customerPhone || customerEmail || siteAddress || accessInstructions || parkingInfo
      ? {
        customerContactName: customerName || undefined,
        customerContactPhone: customerPhone || undefined,
        customerContactEmail: customerEmail || undefined,
        customerNotes: [siteAddress, accessInstructions, parkingInfo].filter(Boolean).join(' | ') || undefined,
      }
      : null;

    const target = await resolveAssignmentTarget(input);
    const status = options.allowInitialStatus ? (input.status || 'PLANNED') : 'PLANNED';

    if (target.employeeIds.length > 0) {
      const [created] = await assignmentService.create({
        employeeIds: target.employeeIds,
        projectId: projectId || null,
        customerId: customerId || null,
        siteId: siteId || null,
        assignmentTargetType: 'EMPLOYEE',
        assignmentTargetId: null,
        assignmentTargetLabel: null,
        assignmentType: resolvedType,
        title: title || null,
        instructions,
        priority: priority || 'NORMAL',
        startDatetime,
        endDatetime,
        status,
        isCustomerAppointment: Boolean(appointment),
        appointment,
        overrideConflicts: input.overrideConflicts,
        overrideReason: input.overrideReason,
      }, userId, meta);
      return assignmentService.getById(created.id);
    }

    const assignmentNumber = await counterService.getNextAssignmentNumber();
    const assignment = await assignmentRepository.create({
      assignmentNumber,
      assignmentType: resolvedType,
      title: title || null,
      instructions,
      priority: priority || 'NORMAL',
      startDatetime,
      endDatetime,
      employeeId: null,
      projectId: projectId || null,
      customerId: customerId || null,
      siteId: siteId || null,
      assignmentTargetType: target.type,
      assignmentTargetId: target.targetId || null,
      assignmentTargetLabel: target.targetLabel || null,
      status,
      isCustomerAppointment: Boolean(appointment),
      createdBy: userId,
    });

    if (appointment) {
      await appointmentService.syncForAssignment(assignment._id, appointment, userId, meta);
    }

    eventBus.publish(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CREATED, {
      assignmentId: assignment._id,
      assignmentNumber,
      assignmentType: resolvedType,
      title: assignment.title,
      employeeIds: target.recipientIds,
      assignmentTargetType: target.type,
      assignmentTargetId: target.targetId,
      assignmentTargetLabel: target.targetLabel,
      createdBy: userId,
    }, { source: meta.source || 'mobile:orders' });

    return assignmentRepository.findById(assignment._id);
  }

  async exportCsv(filters = {}) {
    const limit = clampLimit(filters.limit || filters.pageSize, EXPORT_LIMIT);
    const listFilters = buildOrderListFilters(filters);
    const result = await assignmentRepository.findWithCursor({
      limit,
      sortBy: filters.sortBy || 'startDatetime',
      sortOrder: filters.sortOrder || 'asc',
      filters: listFilters,
      search: filters.search,
    });
    const appointmentByAssignmentId = await loadAppointmentMap(result.data);
    const rows = buildOrderExportRows(result.data, appointmentByAssignmentId);
    return {
      filename: `orders-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: toCsv(rows, ORDER_EXPORT_COLUMNS),
    };
  }

  importTemplate() {
    return buildOrderImportTemplateCsv();
  }

  async importCsv(file, options = {}, userId, meta = {}) {
    if (!file?.buffer) {
      throw new ConflictError('Order import file is required.');
    }

    const rows = parseOrderImportCsv(file.buffer);
    if (rows.length === 0) {
      throw new ValidationError('Order import file is empty.');
    }
    if (rows.length > IMPORT_LIMIT) {
      throw new ConflictError(`Order import is limited to ${IMPORT_LIMIT} rows per file.`);
    }

    const dryRun = options.dryRun === true || options.dryRun === 'true';
    const prepared = [];
    const rowErrors = [];
    const referenceCache = new Map();

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const result = await prepareOrderImportRow(rows[index], rowNumber, { referenceCache });
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
        await this.createOrder(
          item.payload,
          userId,
          { ...meta, source: 'order-import', row: item.row },
          { allowInitialStatus: true },
        );
        summary.created += 1;
      } catch (err) {
        summary.failed += 1;
        summary.rowErrors.push({
          row: item.row,
          field: 'row',
          message: err.message || 'Order could not be imported.',
        });
      }
    }

    summary.skipped = prepared.length - summary.created;

    auditService.logEvent({
      eventType: 'order.imported',
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
}

export function buildOrderListFilters(query = {}) {
  const filters = {};
  if (query.status) filters.status = query.status;
  if (query.orderType || query.type) filters.assignmentType = query.orderType || query.type;
  if (query.employeeId) filters.employeeId = query.employeeId;
  if (query.projectId) filters.projectId = query.projectId;
  if (query.customerId) filters.customerId = query.customerId;
  if (query.siteId) filters.siteId = query.siteId;
  if (query.priority) filters.priority = query.priority;
  if (query.assignmentTargetType) filters.assignmentTargetType = query.assignmentTargetType;
  if (query.assignmentTargetId || query.teamId) filters.assignmentTargetId = query.assignmentTargetId || query.teamId;
  if (query.dateFrom) filters.dateFrom = query.dateFrom;
  if (query.dateTo) filters.dateTo = query.dateTo;
  return filters;
}

export function buildOrderImportTemplateCsv() {
  const sample = {
    orderType: 'SERVICE_CALL',
    title: 'Annual boiler maintenance',
    scheduledStart: '2026-07-15T08:00:00.000Z',
    scheduledEnd: '2026-07-15T12:00:00.000Z',
    priority: 'NORMAL',
    status: 'PLANNED',
    employeeId: '',
    assignmentTargetType: 'EMPLOYEE',
    assignmentTargetId: '',
    assignmentTargetLabel: '',
    projectId: '',
    customerId: '',
    siteId: '',
    customerName: 'Max Muster',
    customerPhone: '+41 44 555 12 12',
    customerEmail: 'max.muster@example.com',
    siteAddress: 'Bahnhofstrasse 1, 8001 Zurich',
    accessInstructions: 'Ring bell at reception.',
    parkingInfo: 'Customer parking behind building.',
    description: 'Service visit imported from dispatcher worksheet.',
    scopeOfWork: 'Inspect burner, clean heat exchanger, test safety valve.',
    specialInstructions: 'Call customer 30 minutes before arrival.',
    overrideConflicts: 'false',
    overrideReason: '',
  };
  return toCsv([sample], ORDER_IMPORT_TEMPLATE_COLUMNS);
}

export function parseOrderImportCsv(buffer) {
  try {
    return parse(buffer.toString('utf8'), {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw new ValidationError('Order import CSV could not be parsed.', [{
      field: 'file',
      message: err.message,
    }]);
  }
}

export async function prepareOrderImportRow(row, rowNumber, { referenceCache = new Map() } = {}) {
  const errors = [];
  const orderType = readString(row.orderType || row.assignmentType).toUpperCase();
  if (!orderType) errors.push(rowError(rowNumber, 'orderType', 'orderType is required.'));
  if (orderType && !ASSIGNMENT_TYPES.includes(orderType)) {
    errors.push(rowError(rowNumber, 'orderType', `orderType must be one of: ${ASSIGNMENT_TYPES.join(', ')}.`));
  }

  const title = readString(row.title);
  if (!title) errors.push(rowError(rowNumber, 'title', 'title is required.'));
  if (title.length > 255) errors.push(rowError(rowNumber, 'title', 'title must be 255 characters or less.'));

  const scheduledStart = parseDateField(row.scheduledStart, 'scheduledStart', rowNumber, errors, true);
  const scheduledEnd = parseDateField(row.scheduledEnd, 'scheduledEnd', rowNumber, errors, true);
  if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) {
    errors.push(rowError(rowNumber, 'scheduledEnd', 'scheduledEnd must be after scheduledStart.'));
  }

  const priority = readString(row.priority || 'NORMAL').toUpperCase();
  if (!PRIORITIES.includes(priority)) {
    errors.push(rowError(rowNumber, 'priority', `priority must be one of: ${PRIORITIES.join(', ')}.`));
  }

  const status = readString(row.status || 'PLANNED').toUpperCase();
  if (!ORDER_STATUSES.includes(status)) {
    errors.push(rowError(rowNumber, 'status', `status must be one of: ${ORDER_STATUSES.join(', ')}.`));
  }

  const rawTargetType = readString(row.assignmentTargetType || 'EMPLOYEE').toUpperCase();
  if (rawTargetType && !ASSIGNMENT_TARGET_TYPES.includes(rawTargetType)) {
    errors.push(rowError(rowNumber, 'assignmentTargetType', `assignmentTargetType must be one of: ${ASSIGNMENT_TARGET_TYPES.join(', ')}.`));
  }
  const targetType = normalizeTargetType(rawTargetType);
  const employeeId = readString(row.employeeId);
  const assignmentTargetId = readString(row.assignmentTargetId);
  const assignmentTargetLabel = readString(row.assignmentTargetLabel);

  if (employeeId && targetType !== 'EMPLOYEE') {
    errors.push(rowError(rowNumber, 'employeeId', 'employeeId cannot be combined with TEAM or DEPARTMENT assignment targets.'));
  }
  if (targetType === 'EMPLOYEE' && assignmentTargetId) {
    errors.push(rowError(rowNumber, 'assignmentTargetId', 'assignmentTargetId is only used for TEAM or DEPARTMENT targets.'));
  }
  if (targetType !== 'EMPLOYEE' && !assignmentTargetId) {
    errors.push(rowError(rowNumber, 'assignmentTargetId', 'assignmentTargetId is required for TEAM or DEPARTMENT targets.'));
  }

  await validateObjectIdReference({
    value: employeeId,
    field: 'employeeId',
    label: 'Technician',
    rowNumber,
    errors,
    referenceCache,
    loadExists: async (id) => {
      const { default: User } = await import('../auth/user.model.js');
      return User.exists({ _id: id, status: 'active' });
    },
  });
  await validateObjectIdReference({
    value: readString(row.projectId),
    field: 'projectId',
    label: 'Project',
    rowNumber,
    errors,
    referenceCache,
    loadExists: async (id) => {
      const { default: Project } = await import('../pm/project.model.js');
      return Project.exists({ _id: id });
    },
  });
  await validateObjectIdReference({
    value: readString(row.customerId),
    field: 'customerId',
    label: 'Customer',
    rowNumber,
    errors,
    referenceCache,
    loadExists: async (id) => {
      const { default: Customer } = await import('../crm/customer.model.js');
      return Customer.exists({ _id: id });
    },
  });
  await validateObjectIdReference({
    value: readString(row.siteId),
    field: 'siteId',
    label: 'Site',
    rowNumber,
    errors,
    referenceCache,
    loadExists: async (id) => {
      const { default: Site } = await import('../crm/site.model.js');
      return Site.exists({ _id: id });
    },
  });

  const instructionsLength = [
    readString(row.description),
    readString(row.scopeOfWork),
    readString(row.specialInstructions),
  ].filter(Boolean).join('\n\n').length;
  if (instructionsLength > 5000) {
    errors.push(rowError(rowNumber, 'description', 'Combined instructions must be 5000 characters or less.'));
  }

  const overrideConflicts = parseBooleanField(row.overrideConflicts, 'overrideConflicts', rowNumber, errors);
  const overrideReason = readString(row.overrideReason);
  if (overrideConflicts && overrideReason.length > 0 && overrideReason.length < 10) {
    errors.push(rowError(rowNumber, 'overrideReason', 'overrideReason must be at least 10 characters when provided.'));
  }

  if (errors.length) return { errors, value: null };

  return {
    errors,
    value: {
      row: rowNumber,
      payload: {
        orderType,
        title,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        priority,
        status,
        employeeId: employeeId || null,
        assignmentTargetType: targetType,
        assignmentTargetId: targetType === 'EMPLOYEE' ? null : assignmentTargetId,
        assignmentTargetLabel: targetType === 'EMPLOYEE' ? null : (assignmentTargetLabel || assignmentTargetId),
        projectId: readString(row.projectId) || null,
        customerId: readString(row.customerId) || null,
        siteId: readString(row.siteId) || null,
        customerName: nullableString(row.customerName),
        customerPhone: nullableString(row.customerPhone),
        customerEmail: nullableString(row.customerEmail),
        siteAddress: nullableString(row.siteAddress),
        accessInstructions: nullableString(row.accessInstructions),
        parkingInfo: nullableString(row.parkingInfo),
        description: nullableString(row.description),
        scopeOfWork: nullableString(row.scopeOfWork),
        specialInstructions: nullableString(row.specialInstructions),
        overrideConflicts,
        overrideReason: overrideReason || null,
      },
    },
  };
}

export function buildOrderExportRows(assignments, appointmentByAssignmentId = new Map()) {
  return assignments.map((assignment) => {
    const appointment = appointmentByAssignmentId.get(objectIdString(assignment._id)) || {};
    const employeeName = formatUserName(assignment.employeeId);
    const project = isObject(assignment.projectId) ? assignment.projectId : null;
    const customer = isObject(assignment.customerId) ? assignment.customerId : null;
    const site = isObject(assignment.siteId) ? assignment.siteId : project?.siteId || null;

    return {
      assignmentNumber: assignment.assignmentNumber || '',
      title: assignment.title || '',
      assignmentType: assignment.assignmentType || '',
      status: assignment.status || '',
      priority: assignment.priority || '',
      scheduledStart: formatDateTime(assignment.startDatetime),
      scheduledEnd: formatDateTime(assignment.endDatetime),
      employeeId: objectIdString(assignment.employeeId),
      employeeName,
      assignmentTargetType: assignment.assignmentTargetType || 'EMPLOYEE',
      assignmentTargetId: assignment.assignmentTargetId || '',
      assignmentTargetLabel: assignment.assignmentTargetLabel || '',
      projectId: objectIdString(assignment.projectId),
      projectNumber: project?.projectNumber || '',
      projectName: project?.name || project?.title || '',
      customerId: objectIdString(assignment.customerId),
      customerName: appointment.customerContactName || customer?.name || project?.customerName || '',
      siteId: objectIdString(assignment.siteId),
      siteName: site?.name || '',
      siteAddress: formatSiteAddress(site) || appointment.customerNotes || '',
      customerPhone: appointment.customerContactPhone || customer?.phone || '',
      customerEmail: appointment.customerContactEmail || customer?.email || '',
      instructions: assignment.instructions || '',
      createdAt: formatDateTime(assignment.createdAt),
      updatedAt: formatDateTime(assignment.updatedAt),
    };
  });
}

async function loadAppointmentMap(assignments = []) {
  const assignmentIds = assignments.map((assignment) => assignment._id).filter(Boolean);
  if (!assignmentIds.length) return new Map();

  const { default: AppointmentDetails } = await import('../deploy/appointmentDetails.model.js');
  const rows = await AppointmentDetails.find({ assignmentId: { $in: assignmentIds } }).lean();
  return new Map(rows.map((row) => [objectIdString(row.assignmentId), row]));
}

function clampLimit(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, EXPORT_LIMIT));
}

function toCsv(rows, preferredHeaders = null) {
  const headers = preferredHeaders || Object.keys(rows[0] || {});
  if (!headers.length) return '';
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

function rowError(row, field, message) {
  return { row, field, message };
}

function readString(value) {
  return value == null ? '' : String(value).trim();
}

function nullableString(value) {
  const text = readString(value);
  return text || null;
}

function parseDateField(value, field, rowNumber, errors, required) {
  const text = readString(value);
  if (!text) {
    if (required) errors.push(rowError(rowNumber, field, `${field} is required.`));
    return null;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    errors.push(rowError(rowNumber, field, `${field} must be a valid ISO date/time.`));
    return null;
  }
  return date;
}

function parseBooleanField(value, field, rowNumber, errors) {
  const text = readString(value).toLowerCase();
  if (!text) return false;
  if (['true', '1', 'yes', 'y', 'ja'].includes(text)) return true;
  if (['false', '0', 'no', 'n', 'nein'].includes(text)) return false;
  errors.push(rowError(rowNumber, field, `${field} must be true or false.`));
  return false;
}

async function validateObjectIdReference({
  value,
  field,
  label,
  rowNumber,
  errors,
  referenceCache,
  loadExists,
}) {
  if (!value) return;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    errors.push(rowError(rowNumber, field, `${field} must be a valid ObjectId.`));
    return;
  }
  const cacheKey = `${field}:${value}`;
  let exists = referenceCache.get(cacheKey);
  if (exists === undefined) {
    exists = Boolean(await loadExists(value));
    referenceCache.set(cacheKey, exists);
  }
  if (!exists) {
    errors.push(rowError(rowNumber, field, `${label} '${value}' was not found.`));
  }
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function formatUserName(user) {
  if (!isObject(user)) return '';
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || '';
}

function formatSiteAddress(site) {
  if (!isObject(site)) return '';
  return [site.street, site.postalCode, site.city].filter(Boolean).join(', ');
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

const orderManagementService = new OrderManagementService();
export default orderManagementService;
