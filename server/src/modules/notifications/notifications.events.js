import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import logger from '../../shared/logger/index.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

function uniqueRecipientIds(values = []) {
  return [...new Set(values.map((value) => String(value || '')).filter(Boolean))];
}

function isDuplicateNotificationError(err, idempotencyKey) {
  if (!err) return false;
  if (err.code === ERROR_CODES.NOTIF_DUPLICATE) return true;

  return Boolean(idempotencyKey)
    && err.code === 11000
    && (
      err.keyPattern?.idempotencyKey
      || err.keyValue?.idempotencyKey
      || String(err.message || '').includes('idempotencyKey')
    );
}

/**
 * Register notification module event handlers.
 * Consumes events from ALL modules and dispatches notifications via the centralized pipeline.
 */
export function registerNotificationsEvents() {
  const dispatch = async (data, notifConfig) => {
    try {
      const notificationService = (await import('./notification.service.js')).default;
      await notificationService.create({
        type: notifConfig.type,
        category: notifConfig.category,
        priority: notifConfig.priority || 'NORMAL',
        channels: notifConfig.channels,
        recipientIds: notifConfig.recipientIds,
        payload: notifConfig.payload || data,
        sourceModule: notifConfig.sourceModule,
        sourceEvent: notifConfig.sourceEvent,
        sourceEntityType: notifConfig.sourceEntityType || null,
        sourceEntityId: notifConfig.sourceEntityId || null,
        idempotencyKey: notifConfig.idempotencyKey || null,
      }, null, { ipAddress: 'internal', userAgent: 'event-handler' });
    } catch (err) {
      if (isDuplicateNotificationError(err, notifConfig.idempotencyKey)) {
        logger.info(`Skipped duplicate notification dispatch for ${notifConfig.sourceEvent}`, {
          module: 'notifications',
          action: 'event.dispatch.duplicate',
          sourceEvent: notifConfig.sourceEvent,
          sourceEntityType: notifConfig.sourceEntityType || null,
          sourceEntityId: notifConfig.sourceEntityId || null,
          idempotencyKey: notifConfig.idempotencyKey || null,
        });
        return;
      }

      logger.error(`Failed to dispatch notification for ${notifConfig.sourceEvent}`, {
        module: 'notifications',
        action: 'event.dispatch',
        sourceEvent: notifConfig.sourceEvent,
        idempotencyKey: notifConfig.idempotencyKey || null,
        error: { message: err.message, stack: err.stack },
      });
    }
  };

  // --- Task Events ---
  eventBus.subscribe(EVENT_TYPES.TASK_ASSIGNED, async (data) => {
    const payload = data.payload || data;
    const taskTitle = payload.taskTitle || payload.title || '';
    if (payload.assigneeId && String(payload.assigneeId) !== String(payload.assignedBy)) {
      await dispatch(payload, {
        type: 'task_assigned',
        category: 'TASK',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: [payload.assigneeId],
        payload: {
          title: 'Aufgabe zugewiesen',
          body: payload.assignerName
            ? `«${taskTitle}» wurde Ihnen von ${payload.assignerName} zugewiesen`
            : `«${taskTitle}» wurde Ihnen zugewiesen`,
          taskTitle, taskId: payload.taskId, dueDate: payload.dueDate, priority: payload.priority, assignerName: payload.assignerName || '',
        },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_ASSIGNED',
        sourceEntityType: 'Task',
        sourceEntityId: payload.taskId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.TASK_COMPLETED, async (data) => {
    const payload = data.payload || data;
    const taskTitle = payload.taskTitle || '';
    if (payload.createdBy && payload.completedBy && payload.createdBy !== payload.completedBy) {
      await dispatch(payload, {
        type: 'task_completed',
        category: 'TASK',
        channels: ['IN_APP'],
        recipientIds: [payload.createdBy],
        payload: {
          title: 'Aufgabe abgeschlossen',
          body: payload.completedByName
            ? `«${taskTitle}» wurde von ${payload.completedByName} erledigt`
            : `«${taskTitle}» wurde erledigt`,
          taskTitle, taskId: payload.taskId, completedByName: payload.completedByName || '',
        },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_COMPLETED',
        sourceEntityType: 'Task',
        sourceEntityId: payload.taskId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.TASK_OVERDUE, async (data) => {
    const payload = data.payload || data;
    const taskTitle = payload.taskTitle || '';
    if (payload.assigneeId) {
      await dispatch(payload, {
        type: 'task_overdue',
        category: 'TASK',
        priority: 'HIGH',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: [payload.assigneeId],
        payload: {
          title: 'Aufgabe überfällig',
          body: `«${taskTitle}» hat das Fälligkeitsdatum überschritten`,
          taskTitle, taskId: payload.taskId, dueDate: payload.dueDate,
        },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_OVERDUE',
        sourceEntityType: 'Task',
        sourceEntityId: payload.taskId,
        idempotencyKey: `task-overdue-${payload.taskId}-${new Date().toISOString().split('T')[0]}`,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.TASK_NOTE_ADDED, async (data) => {
    const payload = data.payload || data;
    const taskTitle = payload.taskTitle || '';
    if (payload.mentions?.length > 0) {
      await dispatch(payload, {
        type: 'task_mention',
        category: 'TASK',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: payload.mentions.filter((id) => id !== payload.authorId),
        payload: {
          title: 'Erwähnung in Aufgabe',
          body: payload.authorName
            ? `${payload.authorName} hat Sie in «${taskTitle}» erwähnt`
            : `Sie wurden in «${taskTitle}» erwähnt`,
          taskTitle, taskId: payload.taskId, authorName: payload.authorName || '',
        },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_NOTE_ADDED',
        sourceEntityType: 'Task',
        sourceEntityId: payload.taskId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.TASK_REMINDER_FIRED, async (data) => {
    const payload = data.payload || data;
    const taskTitle = payload.taskTitle || '';
    if (payload.userId) {
      const channels = [];
      if (payload.channels?.includes('PUSH')) channels.push('PUSH');
      if (payload.channels?.includes('IN_APP')) channels.push('IN_APP');
      if (payload.channels?.includes('EMAIL')) channels.push('EMAIL');
      if (channels.length === 0) channels.push('IN_APP');

      await dispatch(payload, {
        type: 'task_reminder',
        category: 'TASK',
        channels,
        recipientIds: [payload.userId],
        payload: {
          title: payload.isOverdue ? 'Aufgabe überfällig' : 'Aufgaben-Erinnerung',
          body: `Erinnerung: «${taskTitle}»`,
          taskTitle, taskId: payload.taskId, dueDate: payload.dueDate, isOverdue: payload.isOverdue || false,
        },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_REMINDER_FIRED',
        sourceEntityType: 'Task',
        sourceEntityId: payload.taskId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.TASK_LIST_MEMBER_ADDED, async (data) => {
    const payload = data.payload || data;
    if (payload.userId && payload.invitedBy && payload.userId !== payload.invitedBy) {
      await dispatch(payload, {
        type: 'task_list_invitation',
        category: 'TASK',
        channels: ['IN_APP'],
        recipientIds: [payload.userId],
        payload: {
          title: 'Zu Liste eingeladen',
          body: payload.inviterName
            ? `${payload.inviterName} hat Sie zur Liste «${payload.listName || ''}» hinzugefügt`
            : `Sie wurden zur Liste «${payload.listName || ''}» hinzugefügt`,
          listName: payload.listName, inviterName: payload.inviterName || '',
        },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_LIST_MEMBER_ADDED',
      });
    }
  });

  // --- Field Ticket Events ---
  const dispatchFieldTicket = async (data, config) => {
    const payload = data.payload || data;
    const recipientIds = uniqueRecipientIds(payload.recipientIds || []);
    if (recipientIds.length === 0) return;

    const priority = payload.priority === 'MEDIUM' ? 'NORMAL' : (payload.priority || 'NORMAL');
    await dispatch(payload, {
      type: config.type,
      category: 'MAINTENANCE',
      priority,
      channels: config.channels || ['IN_APP', 'PUSH'],
      recipientIds,
      payload: {
        title: config.title || payload.label || payload.title,
        body: config.body || payload.description || payload.title,
        ticketId: payload.ticketId,
        ticketNumber: payload.ticketNumber,
        status: payload.status,
        priority: payload.priority,
        dueAt: payload.dueAt,
        deepLink: payload.deepLink,
      },
      sourceModule: 'fieldTickets',
      sourceEvent: config.sourceEvent,
      sourceEntityType: 'FieldTicket',
      sourceEntityId: payload.ticketId,
      idempotencyKey: config.idempotencyKey ? config.idempotencyKey(payload) : null,
    });
  };

  const dispatchExternalMeetingEmail = async (payload, actionLabel) => {
    const recipients = Array.isArray(payload.externalRecipients) ? payload.externalRecipients : [];
    for (const recipient of recipients) {
      try {
        await queueManager.addJob('auth-email', 'send-meeting-notification', {
          email: recipient.email,
          recipientName: recipient.displayName || recipient.email,
          title: payload.title,
          subjectPrefix: actionLabel,
          startAt: payload.startAt,
          endAt: payload.endAt,
          agenda: payload.agenda,
          joinUrl: payload.joinUrl,
          deepLink: payload.deepLink,
        });
      } catch (err) {
        logger.warn('Failed to queue external meeting email', {
          module: 'notifications',
          action: 'meeting.external_email',
          meetingId: payload.meetingId,
          email: recipient.email,
          error: err.message,
        });
      }
    }
  };

  eventBus.subscribe(EVENT_TYPES.FIELD_TICKET_CREATED, async (data) => {
    const payload = data.payload || data;
    await dispatchFieldTicket(data, {
      type: 'field_ticket_created',
      sourceEvent: 'FIELD_TICKET_CREATED',
      channels: payload.priority === 'CRITICAL' ? ['IN_APP', 'PUSH', 'EMAIL'] : ['IN_APP', 'PUSH'],
      title: `Neues Ticket ${payload.ticketNumber || ''}`.trim(),
      body: payload.title || payload.label || '',
    });
  });

  eventBus.subscribe(EVENT_TYPES.FIELD_TICKET_UPDATED, async (data) => {
    const payload = data.payload || data;
    await dispatchFieldTicket(data, {
      type: 'field_ticket_updated',
      sourceEvent: 'FIELD_TICKET_UPDATED',
      title: `Ticket ${payload.ticketNumber || ''} aktualisiert`.trim(),
      body: payload.changedFields?.length
        ? `Geändert: ${payload.changedFields.join(', ')}`
        : payload.title || '',
    });
  });

  eventBus.subscribe(EVENT_TYPES.FIELD_TICKET_ASSIGNED, async (data) => {
    const payload = data.payload || data;
    await dispatchFieldTicket(data, {
      type: 'field_ticket_assigned',
      sourceEvent: 'FIELD_TICKET_ASSIGNED',
      channels: ['IN_APP', 'PUSH', 'EMAIL'],
      title: `Ticket ${payload.ticketNumber || ''} zugewiesen`.trim(),
      body: payload.title || '',
    });
  });

  eventBus.subscribe(EVENT_TYPES.FIELD_TICKET_STATUS_CHANGED, async (data) => {
    const payload = data.payload || data;
    await dispatchFieldTicket(data, {
      type: 'field_ticket_status_changed',
      sourceEvent: 'FIELD_TICKET_STATUS_CHANGED',
      title: `Ticket-Status geändert`,
      body: `Ticket ${payload.ticketNumber || ''}: ${payload.label || payload.status || ''}`.trim(),
    });
  });

  eventBus.subscribe(EVENT_TYPES.FIELD_TICKET_COMMENTED, async (data) => {
    const payload = data.payload || data;
    await dispatchFieldTicket(data, {
      type: 'field_ticket_commented',
      sourceEvent: 'FIELD_TICKET_COMMENTED',
      title: `Neuer Kommentar`,
      body: `Neuer Kommentar zu Ticket ${payload.ticketNumber || ''}`.trim(),
    });
  });

  eventBus.subscribe(EVENT_TYPES.FIELD_TICKET_ESCALATED, async (data) => {
    const payload = data.payload || data;
    await dispatchFieldTicket(data, {
      type: 'field_ticket_escalated',
      sourceEvent: 'FIELD_TICKET_ESCALATED',
      channels: ['IN_APP', 'PUSH', 'EMAIL'],
      title: `Ticket eskaliert`,
      body: `Ticket ${payload.ticketNumber || ''} wurde eskaliert`.trim(),
      idempotencyKey: (ticket) => `field-ticket-escalated-${ticket.ticketId}-${new Date().toISOString().slice(0, 10)}`,
    });
  });

  eventBus.subscribe(EVENT_TYPES.FIELD_TICKET_AI_ANALYZED, async (data) => {
    const payload = data.payload || data;
    await dispatchFieldTicket(data, {
      type: 'field_ticket_ai_analyzed',
      sourceEvent: 'FIELD_TICKET_AI_ANALYZED',
      title: `KI-Empfehlung`,
      body: `Neue KI-Empfehlung für Ticket ${payload.ticketNumber || ''}`.trim(),
    });
  });

  // --- Scheduling / Deploy Events ---
  eventBus.subscribe(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CREATED, async (data) => {
    const payload = data.payload || data;
    if (payload.employeeIds?.length > 0) {
      await dispatch(payload, {
        type: 'new_assignment',
        category: 'SCHEDULING',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: payload.employeeIds,
        payload: {
          title: 'Neuer Einsatz',
          body: payload.title || 'Ein neuer Einsatz wurde Ihnen zugewiesen',
          assignmentId: payload.assignmentId,
        },
        sourceModule: 'deploy',
        sourceEvent: 'SCHEDULE_ASSIGNMENT_CREATED',
        sourceEntityType: 'Assignment',
        sourceEntityId: payload.assignmentId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.SCHEDULE_ASSIGNMENT_UPDATED, async (data) => {
    const payload = data.payload || data;
    if (payload.employeeIds?.length > 0) {
      await dispatch(payload, {
        type: 'assignment_updated',
        category: 'SCHEDULING',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: payload.employeeIds,
        payload: {
          title: 'Einsatz aktualisiert',
          body: payload.title || 'Ein Einsatz wurde geändert',
          assignmentId: payload.assignmentId,
        },
        sourceModule: 'deploy',
        sourceEvent: 'SCHEDULE_ASSIGNMENT_UPDATED',
        sourceEntityType: 'Assignment',
        sourceEntityId: payload.assignmentId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.SCHEDULE_ASSIGNMENT_MOVED, async (data) => {
    const payload = data.payload || data;
    if (payload.employeeIds?.length > 0) {
      await dispatch(payload, {
        type: 'assignment_moved',
        category: 'SCHEDULING',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: payload.employeeIds,
        payload: {
          title: 'Einsatz verschoben',
          body: payload.title || 'Ein Einsatz wurde verschoben',
          assignmentId: payload.assignmentId,
          startDatetime: payload.newStartDatetime || payload.startDatetime,
          endDatetime: payload.newEndDatetime || payload.endDatetime,
        },
        sourceModule: 'deploy',
        sourceEvent: 'SCHEDULE_ASSIGNMENT_MOVED',
        sourceEntityType: 'Assignment',
        sourceEntityId: payload.assignmentId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CANCELLED, async (data) => {
    const payload = data.payload || data;
    if (payload.employeeIds?.length > 0) {
      await dispatch(payload, {
        type: 'assignment_cancelled',
        category: 'SCHEDULING',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: payload.employeeIds,
        payload: {
          title: 'Einsatz storniert',
          body: payload.title || 'Ein Einsatz wurde storniert',
          assignmentId: payload.assignmentId,
        },
        sourceModule: 'deploy',
        sourceEvent: 'SCHEDULE_ASSIGNMENT_CANCELLED',
        sourceEntityType: 'Assignment',
        sourceEntityId: payload.assignmentId,
      });
    }
  });

  // --- Meeting Events ---
  eventBus.subscribe(EVENT_TYPES.MEETING_CREATED, async (data) => {
    const payload = data.payload || data;
    const recipients = uniqueRecipientIds(payload.recipientIds || []);
    if (recipients.length > 0) {
      await dispatch(payload, {
        type: 'meeting_invitation',
        category: 'SCHEDULING',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: recipients,
        payload: {
          title: 'Meeting-Einladung',
          body: payload.title || 'Neues Meeting',
          meetingId: payload.meetingId,
          startAt: payload.startAt,
          endAt: payload.endAt,
          agenda: payload.agenda,
          joinUrl: payload.joinUrl,
          deepLink: payload.deepLink,
        },
        sourceModule: 'meetings',
        sourceEvent: 'MEETING_CREATED',
        sourceEntityType: 'Meeting',
        sourceEntityId: payload.meetingId,
        idempotencyKey: `meeting-invite-${payload.meetingId}`,
      });
    }
    await dispatchExternalMeetingEmail(payload, 'Meeting-Einladung');
  });

  eventBus.subscribe(EVENT_TYPES.MEETING_UPDATED, async (data) => {
    const payload = data.payload || data;
    const recipients = uniqueRecipientIds(payload.recipientIds || []);
    if (recipients.length > 0) {
      await dispatch(payload, {
        type: 'meeting_updated',
        category: 'SCHEDULING',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: recipients,
        payload: {
          title: 'Meeting geändert',
          body: payload.title || 'Ein Meeting wurde aktualisiert',
          meetingId: payload.meetingId,
          startAt: payload.startAt,
          endAt: payload.endAt,
          agenda: payload.agenda,
          joinUrl: payload.joinUrl,
          deepLink: payload.deepLink,
          changedFields: payload.changedFields || [],
        },
        sourceModule: 'meetings',
        sourceEvent: 'MEETING_UPDATED',
        sourceEntityType: 'Meeting',
        sourceEntityId: payload.meetingId,
        idempotencyKey: `meeting-updated-${payload.meetingId}-${Date.now()}`,
      });
    }
    await dispatchExternalMeetingEmail(payload, 'Meeting geändert');
  });

  eventBus.subscribe(EVENT_TYPES.MEETING_CANCELLED, async (data) => {
    const payload = data.payload || data;
    const recipients = uniqueRecipientIds(payload.recipientIds || []);
    if (recipients.length > 0) {
      await dispatch(payload, {
        type: 'meeting_cancelled',
        category: 'SCHEDULING',
        priority: 'HIGH',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: recipients,
        payload: {
          title: 'Meeting abgesagt',
          body: payload.reason
            ? `«${payload.title || ''}» wurde abgesagt: ${payload.reason}`
            : `«${payload.title || ''}» wurde abgesagt`,
          meetingId: payload.meetingId,
          startAt: payload.startAt,
          reason: payload.reason,
          deepLink: payload.deepLink,
        },
        sourceModule: 'meetings',
        sourceEvent: 'MEETING_CANCELLED',
        sourceEntityType: 'Meeting',
        sourceEntityId: payload.meetingId,
        idempotencyKey: `meeting-cancelled-${payload.meetingId}`,
      });
    }
    await dispatchExternalMeetingEmail(payload, 'Meeting abgesagt');
  });

  eventBus.subscribe(EVENT_TYPES.MEETING_TASK_CREATED, async (data) => {
    const payload = data.payload || data;
    if (payload.assigneeId && String(payload.assigneeId) !== String(payload.actorId)) {
      await dispatch(payload, {
        type: 'meeting_followup_task',
        category: 'TASK',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: [payload.assigneeId],
        payload: {
          title: 'Folgeaufgabe erstellt',
          body: `Neue Aufgabe «${payload.taskTitle || ''}» aus Meeting «${payload.title || ''}»`,
          meetingId: payload.meetingId,
          meetingTitle: payload.title,
          taskId: payload.taskId,
          taskTitle: payload.taskTitle,
          deepLink: `/tasks?taskId=${payload.taskId}`,
        },
        sourceModule: 'meetings',
        sourceEvent: 'MEETING_TASK_CREATED',
        sourceEntityType: 'Meeting',
        sourceEntityId: payload.meetingId,
      });
    }
  });

  // --- Mobile Chat Events ---
  eventBus.subscribe(EVENT_TYPES.MOBILE_CHAT_MESSAGE_SENT, async (data) => {
    const payload = data.payload || data;
    const recipients = (payload.projectTeamIds || []).filter((id) => id !== payload.senderId);
    if (recipients.length > 0) {
      await dispatch(payload, {
        type: 'chat_message',
        category: 'CHAT',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: recipients,
        payload: {
          title: 'Neue Nachricht',
          body: payload.senderName
            ? `${payload.senderName}: ${(payload.content || '').substring(0, 100)}`
            : (payload.content || '').substring(0, 100),
          senderName: payload.senderName, content: (payload.content || '').substring(0, 100), projectId: payload.projectId,
        },
        sourceModule: 'mobile',
        sourceEvent: 'MOBILE_CHAT_MESSAGE_SENT',
        sourceEntityType: 'Project',
        sourceEntityId: payload.projectId,
      });
    }
  });

  // --- QOP Events ---
  eventBus.subscribe(EVENT_TYPES.QUOTATION_EXPIRED, async (data) => {
    const payload = data.payload || data;
    if (payload.createdBy) {
      await dispatch(payload, {
        type: 'quotation_expired',
        category: 'FINANCE',
        channels: ['IN_APP', 'EMAIL'],
        recipientIds: [payload.createdBy],
        payload: {
          title: 'Offerte abgelaufen',
          body: `Offerte ${payload.quotationNumber || ''} für ${payload.customerName || ''}`.trim(),
          quotationNumber: payload.quotationNumber, customerName: payload.customerName,
        },
        sourceModule: 'qop',
        sourceEvent: 'QUOTATION_EXPIRED',
        sourceEntityType: 'Quotation',
        sourceEntityId: payload.quotationId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.INVOICE_OVERDUE, async (data) => {
    const payload = data.payload || data;
    if (payload.createdBy) {
      await dispatch(payload, {
        type: 'invoice_overdue',
        category: 'FINANCE',
        priority: 'HIGH',
        channels: ['IN_APP', 'EMAIL'],
        recipientIds: [payload.createdBy],
        payload: {
          title: 'Rechnung überfällig',
          body: payload.daysOverdue
            ? `Rechnung ${payload.invoiceNumber || ''} für ${payload.customerName || ''} (${payload.daysOverdue} Tage überfällig)`
            : `Rechnung ${payload.invoiceNumber || ''} für ${payload.customerName || ''}`.trim(),
          invoiceNumber: payload.invoiceNumber, customerName: payload.customerName, daysOverdue: payload.daysOverdue,
        },
        sourceModule: 'qop',
        sourceEvent: 'INVOICE_OVERDUE',
        sourceEntityType: 'Invoice',
        sourceEntityId: payload.invoiceId,
        idempotencyKey: `invoice-overdue-${payload.invoiceId}-${new Date().toISOString().split('T')[0]}`,
      });
    }
  });

  // --- Document Template Events ---
  eventBus.subscribe(EVENT_TYPES.DOCUMENT_TPL_GENERATED, async (data) => {
    const payload = data.payload || data;
    if (payload.requestedBy) {
      await dispatch(payload, {
        type: 'document_ready',
        category: 'DOCUMENT',
        channels: ['IN_APP'],
        recipientIds: [payload.requestedBy],
        payload: {
          title: 'Dokument erstellt',
          body: payload.documentName || 'Ihr Dokument wurde generiert',
          documentName: payload.documentName, documentId: payload.documentId,
        },
        sourceModule: 'doctpl',
        sourceEvent: 'DOCUMENT_TPL_GENERATED',
        sourceEntityType: 'GeneratedDocument',
        sourceEntityId: payload.documentId,
      });
    }
  });

  // --- Maintenance Events ---
  eventBus.subscribe(EVENT_TYPES.MAINTENANCE_OVERDUE, async (data) => {
    const payload = data.payload || data;
    if (payload.assignedTo) {
      await dispatch(payload, {
        type: 'maintenance_overdue',
        category: 'MAINTENANCE',
        priority: 'HIGH',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: Array.isArray(payload.assignedTo) ? payload.assignedTo : [payload.assignedTo],
        payload: {
          title: 'Wartung überfällig',
          body: [payload.installationName, payload.siteName].filter(Boolean).join(' – ') || 'Eine Wartung ist überfällig',
          installationName: payload.installationName, siteName: payload.siteName, dueDate: payload.dueDate,
        },
        sourceModule: 'crm',
        sourceEvent: 'MAINTENANCE_OVERDUE',
        sourceEntityType: 'MaintenanceInterval',
        sourceEntityId: payload.maintenanceId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.MAINTENANCE_DUE, async (data) => {
    const payload = data.payload || data;
    if (payload.assignedTo) {
      await dispatch(payload, {
        type: 'maintenance_due',
        category: 'MAINTENANCE',
        priority: 'NORMAL',
        channels: ['IN_APP', 'EMAIL'],
        recipientIds: Array.isArray(payload.assignedTo) ? payload.assignedTo : [payload.assignedTo],
        payload: {
          title: 'Wartung fällig',
          body: payload.count
            ? `${payload.count} Wartung${payload.count > 1 ? 'en' : ''} fällig`
            : 'Eine Wartung steht an',
          count: payload.count,
        },
        sourceModule: 'crm',
        sourceEvent: 'MAINTENANCE_DUE',
        sourceEntityType: 'MaintenanceInterval',
        sourceEntityId: payload.maintenanceId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.MAINTENANCE_ESCALATED, async (data) => {
    const payload = data.payload || data;
    if (payload.assignedTo) {
      await dispatch(payload, {
        type: 'maintenance_escalated',
        category: 'MAINTENANCE',
        priority: 'CRITICAL',
        channels: ['IN_APP', 'EMAIL'],
        recipientIds: Array.isArray(payload.assignedTo) ? payload.assignedTo : [payload.assignedTo],
        payload: {
          title: 'Wartung eskaliert',
          body: payload.daysOverdue
            ? `${payload.count || 1} Wartung${(payload.count || 1) > 1 ? 'en' : ''} seit ${payload.daysOverdue} Tagen überfällig`
            : `${payload.count || 1} Wartung${(payload.count || 1) > 1 ? 'en' : ''} überfällig`,
          count: payload.count, daysOverdue: payload.daysOverdue,
        },
        sourceModule: 'crm',
        sourceEvent: 'MAINTENANCE_ESCALATED',
        sourceEntityType: 'MaintenanceInterval',
        sourceEntityId: payload.maintenanceId,
      });
    }
  });

  // --- Website Widget Events ---
  eventBus.subscribe(EVENT_TYPES.WIDGET_SUBMISSION_RECEIVED, async (data) => {
    const payload = data.payload || data;
    if (payload.assignedTo?.length > 0) {
      await dispatch(payload, {
        type: 'website_service_request',
        category: 'CRM',
        priority: payload.isHighPriority || payload.requestType === 'heizungsstoerung' ? 'HIGH' : 'NORMAL',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: payload.assignedTo,
        payload: {
          title: 'Neue Serviceanfrage',
          body: payload.referenceNumber
            ? `Anfrage ${payload.referenceNumber}${payload.requestType ? ` (${payload.requestType})` : ''}`
            : 'Neue Anfrage über die Website',
          referenceNumber: payload.referenceNumber,
          requestType: payload.requestType,
          contactEmail: payload.contactEmail,
          crmCustomerId: payload.crmCustomerId,
          crmContactId: payload.crmContactId,
        },
        sourceModule: 'crm',
        sourceEvent: 'WIDGET_SUBMISSION_RECEIVED',
        sourceEntityType: 'WidgetSubmission',
        sourceEntityId: payload.submissionId,
        idempotencyKey: `widget-submission:${payload.submissionId}`,
      });
    }
  });

  // --- Accounting Events ---
  eventBus.subscribe(EVENT_TYPES.ACCOUNTING_AP_INVOICE_RECORDED, async (data) => {
    const payload = data.payload || data;
    if (payload.approverIds?.length > 0) {
      await dispatch(payload, {
        type: 'ap_invoice_approval_needed',
        category: 'FINANCE',
        channels: ['IN_APP', 'EMAIL'],
        recipientIds: payload.approverIds,
        payload: {
          title: 'Rechnung zur Freigabe',
          body: [payload.supplierName, payload.invoiceNumber].filter(Boolean).join(' – ') || 'Eine Rechnung wartet auf Freigabe',
          invoiceNumber: payload.invoiceNumber, supplierName: payload.supplierName, amount: payload.amount,
        },
        sourceModule: 'accounting',
        sourceEvent: 'ACCOUNTING_AP_INVOICE_RECORDED',
        sourceEntityType: 'ApInvoice',
        sourceEntityId: payload.apInvoiceId,
      });
    }
  });

  // --- Field-Ops / Mobile Order & Report Events ---
  eventBus.subscribe(EVENT_TYPES.MOBILE_REPORT_SUBMITTED, async (data) => {
    const payload = data.payload || data;
    const recipients = (payload.managerIds || []).filter((id) => String(id) !== String(payload.submittedBy));
    if (recipients.length > 0) {
      await dispatch(payload, {
        type: 'report_submitted',
        category: 'ORDER',
        priority: 'NORMAL',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: recipients,
        payload: {
          title: 'Rapport eingereicht',
          body: payload.technicianName
            ? `${payload.orderTitle || 'Rapport'} von ${payload.technicianName}`
            : payload.orderTitle || 'Ein neuer Rapport wurde eingereicht',
          reportId: payload.reportId,
          orderTitle: payload.orderTitle,
          technicianName: payload.technicianName || '',
        },
        sourceModule: 'mobile',
        sourceEvent: 'MOBILE_REPORT_SUBMITTED',
        sourceEntityType: 'WorkReport',
        sourceEntityId: payload.reportId,
        idempotencyKey: `report-submitted-${payload.reportId}`,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.MOBILE_ORDER_STATUS_UPDATED, async (data) => {
    const payload = data.payload || data;
    const recipients = uniqueRecipientIds([
      ...(Array.isArray(payload.recipientIds) ? payload.recipientIds : []),
      ...(Array.isArray(payload.managerIds) ? payload.managerIds : []),
      payload.assignedTo,
    ]).filter(
      (id) => String(id) !== String(payload.updatedBy),
    );
    if (recipients.length > 0) {
      await dispatch(payload, {
        type: 'order_status_changed',
        category: 'ORDER',
        priority: 'NORMAL',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: recipients,
        payload: {
          title: 'Auftragsstatus geändert',
          body: payload.orderTitle
            ? `${payload.orderTitle}: ${payload.newStatus || ''}`
            : `Auftragsstatus geändert auf ${payload.newStatus || ''}`,
          orderId: payload.orderId,
          orderTitle: payload.orderTitle || '',
          newStatus: payload.newStatus,
        },
        sourceModule: 'mobile',
        sourceEvent: 'MOBILE_ORDER_STATUS_UPDATED',
        sourceEntityType: 'Order',
        sourceEntityId: payload.orderId,
        idempotencyKey: `order-status-${payload.orderId}-${payload.newStatus}`,
      });
    }
  });

  logger.info('Notification event handlers registered', {
    module: 'notifications',
    action: 'events.register',
    subscribedEvents: [
      'TASK_ASSIGNED', 'TASK_COMPLETED', 'TASK_OVERDUE', 'TASK_NOTE_ADDED', 'TASK_REMINDER_FIRED',
      'TASK_LIST_MEMBER_ADDED', 'SCHEDULE_ASSIGNMENT_CREATED', 'SCHEDULE_ASSIGNMENT_UPDATED',
      'SCHEDULE_ASSIGNMENT_MOVED', 'SCHEDULE_ASSIGNMENT_CANCELLED', 'MOBILE_CHAT_MESSAGE_SENT', 'QUOTATION_EXPIRED',
      'MEETING_CREATED', 'MEETING_UPDATED', 'MEETING_CANCELLED', 'MEETING_TASK_CREATED',
      'INVOICE_OVERDUE', 'DOCUMENT_TPL_GENERATED', 'MAINTENANCE_OVERDUE', 'MAINTENANCE_DUE', 'MAINTENANCE_ESCALATED', 'ACCOUNTING_AP_INVOICE_RECORDED',
      'MOBILE_REPORT_SUBMITTED', 'MOBILE_ORDER_STATUS_UPDATED',
    ],
  });
}
