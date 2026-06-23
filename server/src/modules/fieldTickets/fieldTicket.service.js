import fieldTicketRepository from './fieldTicket.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import { FIELD_TICKET_PRIORITIES, FIELD_TICKET_STATUSES } from './fieldTicket.model.js';
import logger from '../../shared/logger/index.js';

const LIST_TTL = { l1Ttl: 15, l2Ttl: 60 };
const ENTITY_TTL = { l1Ttl: 30, l2Ttl: 120 };
const OPEN_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING'];

const STATUS_TRANSITIONS = Object.freeze({
  OPEN: ['IN_PROGRESS', 'PENDING', 'COMPLETED'],
  IN_PROGRESS: ['OPEN', 'PENDING', 'COMPLETED'],
  PENDING: ['OPEN', 'IN_PROGRESS', 'COMPLETED'],
  COMPLETED: ['OPEN', 'IN_PROGRESS'],
});

const TRACKED_FIELDS = [
  'title',
  'description',
  'type',
  'priority',
  'status',
  'dueAt',
  'assignedTo',
  'teamId',
  'teamName',
  'customerId',
  'customerName',
  'projectId',
  'projectName',
  'assetId',
  'assetName',
  'jobId',
  'jobNumber',
  'orderId',
  'siteId',
  'installationId',
  'maintenanceId',
];

function toComparable(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

function changed(existing, patch, field) {
  if (!Object.prototype.hasOwnProperty.call(patch, field)) return false;
  return toComparable(existing[field]) !== toComparable(patch[field]);
}

function activity(type, message, actorId, extra = {}) {
  return {
    type,
    message,
    actorId,
    at: new Date(),
    ...extra,
  };
}

function uniqueIds(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const id = value && typeof value === 'object' && value._id ? value._id : value;
    const key = String(id || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(id);
  }
  return result;
}

function ticketDeepLink(ticket) {
  return `/notifications?ticketId=${ticket._id}`;
}

function ticketLabel(ticket) {
  return `${ticket.ticketNumber || 'Ticket'} - ${ticket.title}`;
}

function normalizePatch(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

function isOverdue(ticket, now = new Date()) {
  return Boolean(ticket.dueAt && new Date(ticket.dueAt) < now && OPEN_STATUSES.includes(ticket.status));
}

class FieldTicketService {
  async create(data, userId, meta = {}) {
    const now = new Date();
    const ticketNumber = data.ticketNumber || await fieldTicketRepository.generateTicketNumber();
    const initialRecommendation = this._buildAiRecommendation({
      ...data,
      priority: data.priority || 'MEDIUM',
      status: data.status || 'OPEN',
      attachments: data.attachments || [],
    });
    const effectivePriority = data.priority || initialRecommendation.recommendedPriority || 'MEDIUM';
    const shouldEscalate = effectivePriority === 'CRITICAL';
    const activities = [
      activity('CREATED', 'Ticket created', userId, {
        metadata: { priority: effectivePriority, status: data.status || 'OPEN' },
      }),
      activity('AI_RECOMMENDED', 'Initial AI recommendation generated', userId, {
        metadata: initialRecommendation,
      }),
    ];

    if (data.assignedTo) {
      activities.push(activity('ASSIGNED', 'Ticket assigned', userId, {
        to: data.assignedTo,
      }));
    }

    if (shouldEscalate) {
      activities.push(activity('ESCALATED', 'Critical ticket escalated', userId, {
        metadata: { reason: 'CRITICAL_PRIORITY' },
      }));
    }

    const created = await fieldTicketRepository.create({
      ...data,
      ticketNumber,
      status: data.status || 'OPEN',
      priority: effectivePriority,
      ai: {
        ...initialRecommendation,
        lastRunAt: now,
      },
      createdBy: userId,
      updatedBy: userId,
      escalated: shouldEscalate,
      escalatedAt: shouldEscalate ? now : null,
      escalationReason: shouldEscalate ? 'CRITICAL_PRIORITY' : null,
      activity: activities,
    });
    const ticket = await fieldTicketRepository.findById(created._id);

    await this._invalidateCaches(ticket._id);
    await this._audit('fieldTicket.created', userId, meta, { ticketId: ticket._id, ticketNumber: ticket.ticketNumber });

    const recipients = await this._resolveNotificationRecipients(ticket, userId, {
      includeCoordinators: !ticket.assignedTo || ticket.priority === 'CRITICAL',
    });
    this._publish(EVENT_TYPES.FIELD_TICKET_CREATED, ticket, userId, recipients);
    if (ticket.assignedTo) this._publish(EVENT_TYPES.FIELD_TICKET_ASSIGNED, ticket, userId, recipients);
    if (ticket.escalated) this._publish(EVENT_TYPES.FIELD_TICKET_ESCALATED, ticket, userId, recipients);

    logger.info('Field ticket created', {
      module: 'fieldTickets',
      action: 'create',
      ticketId: ticket._id,
      userId,
    });

    return ticket;
  }

  async list(queryParams = {}, options = {}) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    const scopedFilters = options.scopeUserId
      ? { ...filters, accessUserId: options.scopeUserId }
      : filters;

    const filterKey = Object.entries(scopedFilters)
      .filter(([, value]) => value !== undefined && value !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    const cacheKey = `fieldTickets:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;

    const [page, summary] = await Promise.all([
      cacheManager.getOrSet(
        cacheKey,
        () => fieldTicketRepository.findWithCursor({
          cursor,
          limit,
          sortBy,
          sortOrder,
          filters: scopedFilters,
        }),
        LIST_TTL,
      ),
      fieldTicketRepository.getSummary(scopedFilters),
    ]);

    return {
      items: page.data,
      pagination: page.pagination,
      summary,
    };
  }

  async getById(id, options = {}) {
    const cacheKey = `fieldTickets:ticket:${id}`;
    const ticket = await cacheManager.getOrSet(
      cacheKey,
      () => fieldTicketRepository.findById(id),
      ENTITY_TTL,
    );

    if (!ticket) throw new NotFoundError('FieldTicket', id);
    this._assertScopedAccess(ticket, options.scopeUserId);
    return ticket;
  }

  async update(id, data, userId, meta = {}, options = {}) {
    const existing = await this.getById(id, options);
    const patch = normalizePatch(data);
    const set = { updatedBy: userId };
    const activities = [];
    const changedFields = [];

    for (const field of TRACKED_FIELDS) {
      if (!changed(existing, patch, field)) continue;
      if (field === 'status') this._validateTransition(existing.status, patch.status);
      set[field] = patch[field];
      changedFields.push(field);
    }

    if (changed(existing, patch, 'status')) {
      activities.push(activity('STATUS_CHANGED', `Status changed to ${patch.status}`, userId, {
        from: existing.status,
        to: patch.status,
      }));

      if (patch.status === 'COMPLETED') {
        set.completedAt = new Date();
        set.completedBy = userId;
      } else if (existing.status === 'COMPLETED') {
        set.completedAt = null;
        set.completedBy = null;
      }
    }

    if (changed(existing, patch, 'assignedTo') || changed(existing, patch, 'teamId') || changed(existing, patch, 'teamName')) {
      activities.push(activity('ASSIGNED', 'Ticket assignment changed', userId, {
        from: { assignedTo: existing.assignedTo?._id || existing.assignedTo, teamId: existing.teamId, teamName: existing.teamName },
        to: { assignedTo: patch.assignedTo ?? existing.assignedTo?._id, teamId: patch.teamId ?? existing.teamId, teamName: patch.teamName ?? existing.teamName },
      }));
    }

    if (changedFields.length > 0) {
      activities.push(activity('UPDATED', 'Ticket updated', userId, {
        metadata: { changedFields },
      }));
    }

    if (patch.priority === 'CRITICAL' && !existing.escalated) {
      set.escalated = true;
      set.escalatedAt = new Date();
      set.escalationReason = 'CRITICAL_PRIORITY';
      activities.push(activity('ESCALATED', 'Critical ticket escalated', userId, {
        metadata: { reason: 'CRITICAL_PRIORITY' },
      }));
    }

    const updated = await fieldTicketRepository.updateById(id, {
      set,
      push: { activity: activities },
    });

    await this._invalidateCaches(id);
    await this._audit('fieldTicket.updated', userId, meta, { ticketId: id, changedFields });

    const recipients = await this._resolveNotificationRecipients(updated, userId, {
      includeCoordinators: updated.priority === 'CRITICAL' || updated.escalated,
    });
    if (changedFields.length > 0) this._publish(EVENT_TYPES.FIELD_TICKET_UPDATED, updated, userId, recipients, { changedFields });
    if (changed(existing, patch, 'status')) this._publish(EVENT_TYPES.FIELD_TICKET_STATUS_CHANGED, updated, userId, recipients);
    if (activities.some((entry) => entry.type === 'ASSIGNED')) this._publish(EVENT_TYPES.FIELD_TICKET_ASSIGNED, updated, userId, recipients);
    if (activities.some((entry) => entry.type === 'ESCALATED')) this._publish(EVENT_TYPES.FIELD_TICKET_ESCALATED, updated, userId, recipients);

    return updated;
  }

  async assign(id, data, userId, meta = {}, options = {}) {
    return this.update(id, {
      assignedTo: data.assignedTo ?? null,
      teamId: data.teamId ?? null,
      teamName: data.teamName ?? null,
    }, userId, meta, options);
  }

  async changeStatus(id, status, userId, meta = {}, options = {}) {
    return this.update(id, { status }, userId, meta, options);
  }

  async addComment(id, data, userId, meta = {}, options = {}) {
    const ticket = await this.getById(id, options);
    const comment = {
      body: data.body,
      visibility: data.visibility || 'INTERNAL',
      authorId: userId,
      createdAt: new Date(),
    };
    const updated = await fieldTicketRepository.updateById(id, {
      set: { updatedBy: userId },
      push: {
        comments: comment,
        activity: activity('COMMENTED', 'Comment added', userId, {
          metadata: { visibility: comment.visibility },
        }),
      },
    });

    await this._invalidateCaches(id);
    await this._audit('fieldTicket.commentAdded', userId, meta, { ticketId: id, visibility: comment.visibility });

    const recipients = await this._resolveNotificationRecipients(ticket, userId);
    this._publish(EVENT_TYPES.FIELD_TICKET_COMMENTED, updated, userId, recipients);

    return updated;
  }

  async addAttachment(id, data, userId, meta = {}, options = {}) {
    const ticket = await this.getById(id, options);
    const attachment = {
      fileId: data.fileId || null,
      url: data.url || null,
      originalName: data.originalName || null,
      mimeType: data.mimeType || null,
      sizeBytes: data.sizeBytes || 0,
      kind: data.kind || 'OTHER',
      uploadedBy: userId,
      uploadedAt: new Date(),
    };

    const updated = await fieldTicketRepository.updateById(id, {
      set: { updatedBy: userId },
      push: {
        attachments: attachment,
        activity: activity('ATTACHMENT_ADDED', 'Attachment added', userId, {
          metadata: { kind: attachment.kind, originalName: attachment.originalName },
        }),
      },
    });

    await this._invalidateCaches(id);
    await this._audit('fieldTicket.attachmentAdded', userId, meta, { ticketId: id, kind: attachment.kind });

    const recipients = await this._resolveNotificationRecipients(ticket, userId);
    this._publish(EVENT_TYPES.FIELD_TICKET_UPDATED, updated, userId, recipients, { changedFields: ['attachments'] });

    return updated;
  }

  async getActivity(id, options = {}) {
    const ticket = await this.getById(id, options);
    return ticket.activity || [];
  }

  async analyze(id, userId, meta = {}, options = {}) {
    const ticket = await this.getById(id, options);
    const recommendation = this._buildAiRecommendation(ticket);
    const updated = await fieldTicketRepository.updateById(id, {
      set: {
        ai: {
          ...recommendation,
          lastRunAt: new Date(),
        },
        updatedBy: userId,
      },
      push: {
        activity: activity('AI_RECOMMENDED', 'AI recommendation generated', userId, {
          metadata: recommendation,
        }),
      },
    });

    await this._invalidateCaches(id);
    await this._audit('fieldTicket.aiAnalyzed', userId, meta, { ticketId: id, category: recommendation.category });
    this._publish(EVENT_TYPES.FIELD_TICKET_AI_ANALYZED, updated, userId, uniqueIds([userId]));

    return updated;
  }

  async remove(id, userId, meta = {}, options = {}) {
    await this.getById(id, options);
    const deleted = await fieldTicketRepository.softDelete(id, userId);
    await this._invalidateCaches(id);
    await this._audit('fieldTicket.deleted', userId, meta, { ticketId: id });
    return deleted;
  }

  async escalateOverdue(now = new Date(), options = {}) {
    const limit = options.limit || 200;
    const tickets = await fieldTicketRepository.findOverdueOpen(now, limit);
    let escalatedCount = 0;

    for (const ticket of tickets) {
      const escalatedPriority = ['LOW', 'MEDIUM'].includes(ticket.priority) ? 'HIGH' : ticket.priority;
      const updated = await fieldTicketRepository.updateById(ticket._id, {
        set: {
          escalated: true,
          escalatedAt: now,
          escalationReason: 'OVERDUE_DUE_DATE',
          priority: escalatedPriority,
        },
        push: {
          activity: activity('ESCALATED', 'Overdue ticket escalated', null, {
            metadata: { reason: 'OVERDUE_DUE_DATE', dueAt: ticket.dueAt },
          }),
        },
      });
      escalatedCount += 1;

      await this._invalidateCaches(ticket._id);
      const recipients = await this._resolveNotificationRecipients(updated, null, { includeCoordinators: true });
      this._publish(EVENT_TYPES.FIELD_TICKET_ESCALATED, updated, null, recipients);
    }

    return { escalatedCount };
  }

  _validateTransition(from, to) {
    if (!FIELD_TICKET_STATUSES.includes(to)) {
      throw new AppError('Invalid ticket status', 400, ERROR_CODES.FIELD_TICKET_INVALID_TRANSITION);
    }
    if (from === to) return;
    const allowed = STATUS_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new AppError(`Cannot move ticket from ${from} to ${to}`, 409, ERROR_CODES.FIELD_TICKET_INVALID_TRANSITION);
    }
  }

  _assertScopedAccess(ticket, scopeUserId) {
    if (!scopeUserId) return;
    const userId = String(scopeUserId);
    const assignedTo = ticket.assignedTo?._id || ticket.assignedTo;
    if (String(ticket.createdBy?._id || ticket.createdBy) === userId) return;
    if (String(assignedTo || '') === userId) return;
    throw new AppError('Access denied to this ticket', 403, ERROR_CODES.INSUFFICIENT_PERMISSIONS);
  }

  _buildAiRecommendation(ticket) {
    const text = `${ticket.title || ''} ${ticket.description || ''}`.toLowerCase();
    const criticalTerms = ['gas', 'leak', 'fire', 'smoke', 'safety', 'no heat', 'outage', 'wasserleck', 'heizung aus', 'brenner aus'];
    const highTerms = ['urgent', 'overdue', 'failure', 'störung', 'ausfall', 'dringend', 'blocked', 'blocked'];
    const maintenanceTerms = ['service', 'wartung', 'maintenance', 'inspection', 'interval'];
    const incidentTerms = ['incident', 'accident', 'damage', 'defekt', 'schaden'];

    const criticalHit = criticalTerms.some((term) => text.includes(term));
    const highHit = highTerms.some((term) => text.includes(term));
    const maintenanceHit = maintenanceTerms.some((term) => text.includes(term));
    const incidentHit = incidentTerms.some((term) => text.includes(term));

    let recommendedPriority = ticket.priority || 'MEDIUM';
    if (criticalHit) recommendedPriority = 'CRITICAL';
    else if (highHit || isOverdue(ticket)) recommendedPriority = 'HIGH';
    else if (!FIELD_TICKET_PRIORITIES.includes(recommendedPriority)) recommendedPriority = 'MEDIUM';

    const category = maintenanceHit
      ? 'MAINTENANCE'
      : incidentHit || criticalHit
        ? 'INCIDENT'
        : ticket.type === 'SERVICE_REQUEST'
          ? 'SERVICE_REQUEST'
          : 'TECHNICAL_NOTIFICATION';

    const nextActions = [
      criticalHit ? 'Contact the assigned technician immediately and confirm site safety.' : null,
      ticket.assignedTo ? 'Confirm technician ETA and required material availability.' : 'Assign the ticket to a technician or dispatch team.',
      ticket.dueAt ? 'Review due date against current priority and customer SLA.' : 'Set a due date based on priority and customer impact.',
      ticket.attachments?.length > 0 ? 'Review attached media before dispatch.' : 'Request photos or supporting documentation from the reporter.',
      ticket.projectId || ticket.orderId ? 'Check linked project or job context before updating status.' : 'Link the ticket to the relevant project, customer, asset, or job.',
    ].filter(Boolean);

    return {
      category,
      confidence: criticalHit || highHit || maintenanceHit || incidentHit ? 0.82 : 0.58,
      recommendedPriority,
      recommendedAssigneeId: ticket.assignedTo?._id || ticket.assignedTo || null,
      nextActions,
      rationale: `Detected ${category.toLowerCase().replace(/_/g, ' ')} context with ${recommendedPriority.toLowerCase()} urgency.`,
    };
  }

  async _resolveNotificationRecipients(ticket, actorId, options = {}) {
    const baseRecipients = uniqueIds([
      ticket.assignedTo?._id || ticket.assignedTo,
      ticket.createdBy?._id || ticket.createdBy,
    ]).filter((id) => String(id) !== String(actorId || ''));

    if (!options.includeCoordinators) return baseRecipients;

    const [assigners, admins] = await Promise.all([
      this._getRecipientIdsByPermission('field-ticket', 'assign'),
      this._getRecipientIdsByPermission('users', 'admin'),
    ]);

    return uniqueIds([...baseRecipients, ...assigners, ...admins])
      .filter((id) => String(id) !== String(actorId || ''));
  }

  async _getRecipientIdsByPermission(module, action) {
    const [{ default: Permission }, { default: Role }, { default: User }] = await Promise.all([
      import('../auth/permission.model.js'),
      import('../auth/role.model.js'),
      import('../auth/user.model.js'),
    ]);

    const permission = await Permission.findOne({ module, action }).select('_id').lean();
    if (!permission) return [];

    const roles = await Role.find({ permissions: permission._id }).select('_id').lean();
    if (roles.length === 0) return [];

    const users = await User.find({
      role: { $in: roles.map((role) => role._id) },
      status: 'active',
    }).select('_id').lean();

    return users.map((user) => user._id);
  }

  _publish(eventType, ticket, actorId, recipientIds = [], extra = {}) {
    eventBus.publish(eventType, {
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      description: ticket.description,
      type: ticket.type,
      priority: ticket.priority,
      status: ticket.status,
      dueAt: ticket.dueAt,
      assignedTo: ticket.assignedTo?._id || ticket.assignedTo || null,
      createdBy: ticket.createdBy?._id || ticket.createdBy || null,
      actorId,
      recipientIds: uniqueIds(recipientIds),
      deepLink: ticketDeepLink(ticket),
      label: ticketLabel(ticket),
      ...extra,
    }, { source: 'fieldTickets' });
  }

  async _audit(eventType, userId, meta, details) {
    auditService.logEvent({
      eventType,
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details,
      module: 'fieldTickets',
    });
  }

  async _invalidateCaches(id) {
    await cacheManager.del(`fieldTickets:ticket:${id}`);
    await cacheManager.invalidatePattern('fieldTickets:list:*');
  }
}

const fieldTicketService = new FieldTicketService();
export default fieldTicketService;
