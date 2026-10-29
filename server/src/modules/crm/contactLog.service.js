import contactLogRepository from './contactLog.repository.js';
import auditService from '../auth/audit.service.js';
import {
  NotFoundError, ConflictError, AuthorizationError, ValidationError,
} from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const LINK_FIELDS = ['siteId', 'projectId', 'orderId', 'assignmentId', 'contactId'];

class ContactLogService {
  /**
   * Build the Mongo filter for a listing. Exactly one scope applies: a customer
   * shows everything logged for it (general exchanges and those tied to one of
   * its records), a linked record shows only what names it.
   */
  _buildFilter({ customerId, siteId, projectId, orderId, assignmentId }, filters = {}) {
    const filter = {};
    if (customerId) filter.customerId = customerId;
    if (siteId) filter.siteId = siteId;
    if (projectId) filter.projectId = projectId;
    if (orderId) filter.orderId = orderId;
    if (assignmentId) filter.assignmentId = assignmentId;

    if (filters.channel) filter.channel = filters.channel;
    if (filters.employeeId) filter.employeeId = filters.employeeId;
    if (filters.dateFrom || filters.dateTo) {
      filter.occurredAt = {};
      if (filters.dateFrom) filter.occurredAt.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) filter.occurredAt.$lte = new Date(filters.dateTo);
    }
    // "Nur offene Punkte" / "Nur Wiedervorlagen" — the two views the office
    // actually works from.
    if (filters.onlyOpenPoints) filter.openPoints = { $nin: [null, ''] };
    if (filters.onlyFollowUps) filter.followUpAt = { $ne: null };

    return filter;
  }

  async list(scope, filters = {}, { limit = 100, skip = 0 } = {}) {
    const filter = this._buildFilter(scope, filters);
    const [items, total] = await Promise.all([
      contactLogRepository.find(filter, { limit, skip }),
      contactLogRepository.count(filter),
    ]);
    return { items, total };
  }

  async getById(id) {
    const entry = await contactLogRepository.findById(id);
    if (!entry) throw new NotFoundError('ContactLogEntry', id);
    return entry;
  }

  async create(customerId, data, userId, meta = {}) {
    // An entry belongs to a customer (the usual case) or, when no customer is
    // given, a lead (prospect communications). Validate whichever owner applies.
    const leadId = data.leadId || null;
    let owner = null;
    if (customerId) {
      const Customer = (await import('./customer.model.js')).default;
      owner = await Customer.findById(customerId).select('_id name').lean();
      if (!owner) throw new NotFoundError('Customer', customerId);
    } else if (leadId) {
      const Lead = (await import('./lead.model.js')).default;
      owner = await Lead.findById(leadId).select('_id name').lean();
      if (!owner) throw new NotFoundError('Lead', leadId);
    } else {
      throw new ValidationError('A contact log entry requires a customerId or a leadId');
    }

    const payload = {
      customerId: customerId || null,
      leadId,
      occurredAt: data.occurredAt || new Date(),
      employeeId: data.employeeId || userId,
      channel: data.channel,
      channelLabel: data.channelLabel || null,
      subject: data.subject || null,
      note: data.note,
      agreements: data.agreements || null,
      openPoints: data.openPoints || null,
      followUpAt: data.followUpAt || null,
      createdBy: userId,
      editableUntil: new Date(Date.now() + EDIT_WINDOW_MS),
    };
    for (const field of LINK_FIELDS) payload[field] = data[field] || null;

    let entry = await contactLogRepository.create(payload);

    // "Wiedervorlage oder Aufgabe": the follow-up becomes a real task so it
    // surfaces where people already work instead of only inside this history.
    if (data.createFollowUpTask && payload.followUpAt) {
      const task = await this._createFollowUpTask(entry, owner, data, userId, meta);
      if (task) entry = await contactLogRepository.updateById(entry._id, { followUpTaskId: task._id });
    }

    // Lead follow-up dates become first-class inbox follow-ups (idempotent per entry).
    if (leadId && payload.followUpAt && !data.skipFollowUpSync) await this._syncLeadFollowUp((svc) => svc.upsertFromContactLog(entry));

    auditService.logEvent({
      eventType: 'customer.contact.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        contactLogId: entry._id, customerId: customerId || null, leadId, siteId: payload.siteId, channel: payload.channel,
      },
      module: 'crm',
    });

    logger.info('Contact logged', {
      module: 'crm', action: 'contactLog.create', contactLogId: entry._id, customerId: customerId || null, leadId,
    });

    return entry;
  }

  /** A lead's contact-log entries, newest first (used by the lead service). */
  async listByLead(leadId, { createdBy } = {}) {
    const filter = { leadId };
    if (createdBy) filter.createdBy = createdBy;
    return contactLogRepository.find(filter, { limit: 200 });
  }

  async update(id, data, userId, meta = {}) {
    const existing = await contactLogRepository.findRawById(id);
    if (!existing) throw new NotFoundError('ContactLogEntry', id);

    if (String(existing.createdBy) !== String(userId)) {
      throw new AuthorizationError('Only the author can edit this contact entry');
    }
    if (new Date() > new Date(existing.editableUntil)) {
      throw new ConflictError('Kontakteintraege koennen nur innerhalb von 24 Stunden bearbeitet werden.');
    }

    const allowed = {};
    for (const field of [
      'occurredAt', 'employeeId', 'channel', 'channelLabel', 'subject',
      'note', 'agreements', 'openPoints', 'followUpAt', ...LINK_FIELDS,
    ]) {
      if (data[field] !== undefined) allowed[field] = data[field] || null;
    }
    // `note` is required — never let an edit blank it out.
    if (data.note !== undefined) allowed.note = data.note;
    allowed.updatedBy = userId;

    const updated = await contactLogRepository.updateById(id, allowed);
    if (existing.leadId && data.followUpAt !== undefined) {
      const next = allowed.followUpAt;
      await this._syncLeadFollowUp(async (svc) => {
        const synced = await svc.syncContactLog(id, { followUpAt: next }, userId);
        if (!synced && next) await svc.upsertFromContactLog(updated);
      });
    }

    auditService.logEvent({
      eventType: 'customer.contact.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { contactLogId: id, customerId: existing.customerId, changedFields: Object.keys(allowed) },
      module: 'crm',
    });

    return updated;
  }

  async delete(id, userId, meta = {}) {
    const existing = await contactLogRepository.findRawById(id);
    if (!existing) throw new NotFoundError('ContactLogEntry', id);

    await contactLogRepository.softDelete(id);
    if (existing.leadId) await this._syncLeadFollowUp((svc) => svc.syncContactLog(id, { deleted: true }, userId));

    auditService.logEvent({
      eventType: 'customer.contact.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { contactLogId: id, customerId: existing.customerId },
      module: 'crm',
    });

    logger.info('Customer contact deleted', { module: 'crm', action: 'contactLog.delete', contactLogId: id });
  }

  /** Best-effort bridge to the lead follow-up inbox (lazy import: no module cycle). */
  async _syncLeadFollowUp(fn) {
    try {
      const { default: leadFollowUpService } = await import('./leadFollowUp.service.js');
      await fn(leadFollowUpService);
    } catch (err) {
      logger.warn('Lead follow-up sync failed (contact log kept)', { module: 'crm', error: { message: err.message } });
    }
  }

  /**
   * A follow-up task carries the same links as the exchange, so it shows up in
   * the object's task overview and in the department board.
   */
  async _createFollowUpTask(entry, customer, data, userId, meta) {
    try {
      const taskService = (await import('../tasks/task.service.js')).default;
      const title = data.followUpTaskTitle?.trim()
        || `Wiedervorlage: ${entry.subject || customer.name}`;
      return await taskService.create({
        title,
        description: entry.openPoints || entry.note || null,
        dueDate: entry.followUpAt,
        departmentId: data.followUpDepartmentId || null,
        siteId: entry.siteId?._id ?? entry.siteId ?? null,
        projectId: entry.projectId?._id ?? entry.projectId ?? null,
        assigneeId: data.followUpAssigneeId || entry.employeeId?._id || entry.employeeId || userId,
        source: { type: 'CUSTOMER_INQUIRY', refId: entry._id, label: customer.name },
      }, userId, meta);
    } catch (err) {
      // A failed task must not lose the logged conversation.
      logger.warn('Could not create follow-up task for contact entry', {
        module: 'crm', contactLogId: String(entry._id), error: err.message,
      });
      return null;
    }
  }
}

const contactLogService = new ContactLogService();
export default contactLogService;
