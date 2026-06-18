import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import {
  serializeMobileAssignment,
  serializeMobileAssignments,
} from '../deploy/mobileAssignment.serializer.js';

const VALID_TRANSITIONS = {
  PLANNED: ['IN_PROGRESS'],
  CONFIRMED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PAUSED', 'COMPLETED'],
  PAUSED: ['IN_PROGRESS', 'COMPLETED'],
};

function normalizeId(value) {
  if (!value) return null;
  return String(value._id || value);
}

function uniqueIds(values) {
  return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function normalizeTargetType(value) {
  return ['EMPLOYEE', 'TEAM', 'DEPARTMENT'].includes(value) ? value : 'EMPLOYEE';
}

function buildUserTargetIds(user) {
  return uniqueIds([
    user?.department,
    user?.preferences?.preferredDepartmentId,
  ]);
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

async function resolveAssignmentRecipients(assignment) {
  const employeeId = normalizeId(assignment?.employeeId);
  if (employeeId) return [employeeId];
  if (!['TEAM', 'DEPARTMENT'].includes(assignment?.assignmentTargetType)) return [];
  const users = await findUsersForTarget(assignment.assignmentTargetId);
  return uniqueIds(users.map((user) => user._id));
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

class OrderController {
  async createOrder(req, res, next) {
    try {
      const { default: counterService } = await import('../deploy/counter.service.js');
      const { default: assignmentRepository } = await import('../deploy/assignment.repository.js');
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const { default: appointmentService } = await import('../deploy/appointment.service.js');

      const {
        orderType, assignmentType,
        title, description, scopeOfWork, specialInstructions,
        priority, scheduledStart, scheduledEnd,
        projectId,
        customerId, siteId,
        customerName, customerPhone, customerEmail,
        siteAddress, accessInstructions, parkingInfo,
      } = req.body;

      const resolvedType = assignmentType || orderType;
      if (!resolvedType) {
        throw new ValidationError('orderType is required');
      }

      const now = new Date();
      const startDatetime = scheduledStart ? new Date(scheduledStart) : now;
      const endDatetime = scheduledEnd ? new Date(scheduledEnd) : new Date(now.getTime() + 8 * 3600 * 1000);

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

      let assignment;
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const target = await resolveAssignmentTarget(req.body);

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
          status: 'PLANNED',
          isCustomerAppointment: Boolean(appointment),
          appointment,
          overrideConflicts: req.body.overrideConflicts,
          overrideReason: req.body.overrideReason,
        }, req.user._id, meta);
        assignment = await assignmentService.getById(created.id);
      } else {
        const assignmentNumber = await counterService.getNextAssignmentNumber();
        assignment = await assignmentRepository.create({
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
          status: 'PLANNED',
          isCustomerAppointment: Boolean(appointment),
          createdBy: req.user._id,
        });

        if (appointment) {
          await appointmentService.syncForAssignment(assignment._id, appointment, req.user._id, meta);
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
          createdBy: req.user._id,
        }, { source: 'mobile:orders' });
      }

      const data = await serializeMobileAssignment(assignment);
      return res.success({ data, message: 'Order created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listOrders(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;

      // Field-ops / admin view: return all assignments with optional filters
      if (query.all === 'true' || query.all === true) {
        const { default: assignmentRepository } = await import('../deploy/assignment.repository.js');
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
        const [result, summary] = await Promise.all([
          assignmentRepository.findWithCursor({
            limit: query.limit ? parseInt(query.limit, 10) : 100,
            cursor: query.cursor,
            sortBy: query.sortBy || 'createdAt',
            sortOrder: query.sortOrder || 'desc',
            filters,
            search: query.search,
          }),
          assignmentRepository.getStatusSummary({ filters, search: query.search }),
        ]);
        const syncTimestamp = new Date().toISOString();
        const data = await serializeMobileAssignments(result.data, { syncTimestamp });
        return res.success({ data, pagination: result.pagination, summary, syncTimestamp });
      }

      // Mobile technician view: return direct assignments plus team/department jobs for the user
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const assignments = await assignmentService.listByEmployee(
        req.user._id,
        query.dateFrom,
        query.dateTo,
        {
          department: req.user.department,
          preferences: req.user.preferences,
          targetIds: buildUserTargetIds(req.user),
        },
      );
      const syncTimestamp = new Date().toISOString();
      const data = await serializeMobileAssignments(assignments, { syncTimestamp });
      return res.success({ data, syncTimestamp });
    } catch (err) { next(err); }
  }

  async getOrderDetail(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const assignment = await assignmentService.getById(req.params.id);
      // Field-ops can view any order; mobile technicians only their own
      const data = await serializeMobileAssignment(assignment);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async updateOrder(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const {
        orderType, assignmentType, title, description, scopeOfWork, specialInstructions,
        priority, scheduledStart, scheduledEnd,
        employeeId, employeeIds,
        projectId, customerId, siteId,
        customerName, customerPhone, customerEmail,
        siteAddress, accessInstructions, parkingInfo,
        status, overrideConflicts, overrideReason,
      } = req.body;

      const updates = {};
      if (assignmentType || orderType) updates.assignmentType = assignmentType || orderType;
      if (title !== undefined) updates.title = title || null;
      if (priority) updates.priority = priority;
      if (status) updates.status = status;
      if (projectId !== undefined) updates.projectId = projectId || null;
      if (customerId !== undefined) updates.customerId = customerId || null;
      if (siteId !== undefined) updates.siteId = siteId || null;
      if (scheduledStart) updates.startDatetime = new Date(scheduledStart);
      if (scheduledEnd) updates.endDatetime = new Date(scheduledEnd);

      const assignmentTargetChanged = employeeId !== undefined
        || employeeIds !== undefined
        || req.body.assignmentTargetType !== undefined
        || req.body.assignmentTargetId !== undefined
        || req.body.teamId !== undefined
        || req.body.departmentId !== undefined;

      if (assignmentTargetChanged) {
        const target = await resolveAssignmentTarget(req.body);
        if (target.type === 'EMPLOYEE') {
          updates.employeeId = target.employeeIds[0] || null;
          updates.assignmentTargetType = 'EMPLOYEE';
          updates.assignmentTargetId = null;
          updates.assignmentTargetLabel = null;
        } else {
          updates.employeeId = null;
          updates.assignmentTargetType = target.type;
          updates.assignmentTargetId = target.targetId || null;
          updates.assignmentTargetLabel = target.targetLabel || null;
        }
      }

      const instructionsParts = [description, scopeOfWork, specialInstructions].filter(Boolean);
      if (instructionsParts.length) updates.instructions = instructionsParts.join('\n\n');

      if (customerName || customerPhone || customerEmail || siteAddress || accessInstructions || parkingInfo) {
        updates.isCustomerAppointment = true;
        updates.appointment = {
          customerContactName: customerName || undefined,
          customerContactPhone: customerPhone || undefined,
          customerContactEmail: customerEmail || undefined,
          customerNotes: [siteAddress, accessInstructions, parkingInfo].filter(Boolean).join(' | ') || undefined,
        };
      }

      if (overrideConflicts !== undefined) updates.overrideConflicts = overrideConflicts;
      if (overrideReason !== undefined) updates.overrideReason = overrideReason;

      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const updated = await assignmentService.update(req.params.id, updates, req.user._id, meta);
      const data = await serializeMobileAssignment(updated);
      return res.success({ data, message: 'Order updated successfully' });
    } catch (err) { next(err); }
  }

  async deleteOrder(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await assignmentService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Order deleted successfully' });
    } catch (err) { next(err); }
  }

  async bulkDeleteOrders(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const { ids } = req.body;
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await Promise.all(ids.map((id) => assignmentService.delete(id, req.user._id, meta)));
      return res.success({ message: `${ids.length} orders deleted successfully` });
    } catch (err) { next(err); }
  }

  async updateStatus(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const assignment = await assignmentService.getById(req.params.id);
      const currentStatus = assignment.status;
      const newStatus = req.body.status;

      if (!VALID_TRANSITIONS[currentStatus]?.includes(newStatus)) {
        throw new ConflictError(
          `Invalid status transition from ${currentStatus} to ${newStatus}. Allowed: ${(VALID_TRANSITIONS[currentStatus] || []).join(', ') || 'none'}.`,
        );
      }

      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const updated = await assignmentService.update(req.params.id, { status: newStatus }, req.user._id, meta);
      const recipients = await resolveAssignmentRecipients(assignment);
      eventBus.publish(EVENT_TYPES.MOBILE_ORDER_STATUS_UPDATED, {
        orderId: req.params.id,
        previousStatus: currentStatus,
        newStatus,
        orderTitle: assignment.title || '',
        assignedTo: normalizeId(assignment.employeeId),
        recipientIds: recipients,
        updatedBy: req.user._id,
        managerIds: assignment.createdBy ? [assignment.createdBy] : [],
      }, { source: 'mobile:orders' });
      const data = await serializeMobileAssignment(updated);
      return res.success({ data, message: 'Order status updated successfully' });
    } catch (err) { next(err); }
  }

  async getOrderHistory(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const { default: auditService } = await import('../auth/audit.service.js');
      const { default: workReportRepository } = await import('./workReport.repository.js');
      const { default: timeEntryRepository } = await import('./timeEntry.repository.js');
      const { default: mobilePhotoRepository } = await import('./mobilePhoto.repository.js');

      const assignment = await assignmentService.getById(req.params.id);
      const [auditEntries, reports, timeEntries, photos, serializedAssignment] = await Promise.all([
        auditService.queryByEntity({
          module: 'deploy',
          detailsKey: 'assignmentId',
          entityId: [req.params.id, normalizeId(assignment)],
          eventTypePrefix: 'assignment.',
          limit: 100,
        }),
        workReportRepository.findByOrderId(req.params.id),
        timeEntryRepository.findByOrderId(req.params.id),
        mobilePhotoRepository.findByOrderId(req.params.id),
        serializeMobileAssignment(assignment),
      ]);

      const events = [
        {
          id: `assignment-created-${normalizeId(assignment)}`,
          type: 'assignment.created',
          title: assignment.title || assignment.assignmentNumber,
          description: 'Assignment created',
          date: toIso(assignment.createdAt),
          status: assignment.status,
          actor_id: normalizeId(assignment.createdBy),
        },
        ...auditEntries.map((entry) => ({
          id: normalizeId(entry),
          type: entry.eventType,
          title: entry.eventType,
          description: entry.details?.changedFields?.length
            ? `Changed: ${entry.details.changedFields.join(', ')}`
            : entry.eventType,
          date: toIso(entry.timestamp),
          actor_id: normalizeId(entry.userId),
          notes: entry.details?.assignmentNumber || entry.details?.assignmentId || null,
        })),
        ...reports.map((report) => ({
          id: normalizeId(report),
          type: 'report',
          title: `Report ${report.reportNumber || ''}`.trim(),
          description: report.status,
          date: toIso(report.reportDate || report.createdAt),
          technician_name: report.technicianId
            ? `${report.technicianId.firstName || ''} ${report.technicianId.lastName || ''}`.trim()
            : null,
          notes: report.workPerformed || report.findings || null,
        })),
        ...timeEntries.map((entry) => ({
          id: normalizeId(entry),
          type: 'time_entry',
          title: entry.activityType || 'Time entry',
          description: `${entry.netDurationMin || 0} min`,
          date: toIso(entry.date || entry.createdAt),
          technician_name: entry.technicianId
            ? `${entry.technicianId.firstName || ''} ${entry.technicianId.lastName || ''}`.trim()
            : null,
        })),
        ...photos.map((photo) => ({
          id: normalizeId(photo),
          type: 'photo',
          title: photo.caption || photo.category || 'Photo',
          description: photo.category || null,
          date: toIso(photo.capturedAt || photo.createdAt),
          notes: photo.notes || null,
        })),
        ...((serializedAssignment?.documents || []).map((document) => ({
          id: document.id,
          type: 'document',
          title: document.name,
          description: document.category || document.source || null,
          date: document.updated_at,
        }))),
      ]
        .filter((event) => event.date)
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

      return res.success({ data: events });
    } catch (err) { next(err); }
  }
}

const orderController = new OrderController();
export default orderController;
