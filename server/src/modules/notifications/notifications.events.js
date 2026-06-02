import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';

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
      logger.error(`Failed to dispatch notification for ${notifConfig.sourceEvent}`, {
        module: 'notifications',
        action: 'event.dispatch',
        sourceEvent: notifConfig.sourceEvent,
        error: { message: err.message, stack: err.stack },
      });
    }
  };

  // --- Task Events ---
  eventBus.subscribe(EVENT_TYPES.TASK_ASSIGNED, async (data) => {
    const payload = data.payload || data;
    if (payload.assigneeId && String(payload.assigneeId) !== String(payload.assignedBy)) {
      await dispatch(payload, {
        type: 'task_assigned',
        category: 'TASK',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: [payload.assigneeId],
        payload: { taskTitle: payload.taskTitle || payload.title, taskId: payload.taskId, dueDate: payload.dueDate, priority: payload.priority, assignerName: payload.assignerName || '' },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_ASSIGNED',
        sourceEntityType: 'Task',
        sourceEntityId: payload.taskId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.TASK_COMPLETED, async (data) => {
    const payload = data.payload || data;
    if (payload.createdBy && payload.completedBy && payload.createdBy !== payload.completedBy) {
      await dispatch(payload, {
        type: 'task_completed',
        category: 'TASK',
        channels: ['IN_APP'],
        recipientIds: [payload.createdBy],
        payload: { taskTitle: payload.taskTitle, taskId: payload.taskId, completedByName: payload.completedByName || '' },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_COMPLETED',
        sourceEntityType: 'Task',
        sourceEntityId: payload.taskId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.TASK_OVERDUE, async (data) => {
    const payload = data.payload || data;
    if (payload.assigneeId) {
      await dispatch(payload, {
        type: 'task_overdue',
        category: 'TASK',
        priority: 'HIGH',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: [payload.assigneeId],
        payload: { taskTitle: payload.taskTitle, taskId: payload.taskId, dueDate: payload.dueDate },
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
    if (payload.mentions?.length > 0) {
      await dispatch(payload, {
        type: 'task_mention',
        category: 'TASK',
        channels: ['IN_APP', 'PUSH'],
        recipientIds: payload.mentions.filter((id) => id !== payload.authorId),
        payload: { taskTitle: payload.taskTitle, taskId: payload.taskId, authorName: payload.authorName || '' },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_NOTE_ADDED',
        sourceEntityType: 'Task',
        sourceEntityId: payload.taskId,
      });
    }
  });

  eventBus.subscribe(EVENT_TYPES.TASK_REMINDER_FIRED, async (data) => {
    const payload = data.payload || data;
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
        payload: { taskTitle: payload.taskTitle, taskId: payload.taskId, dueDate: payload.dueDate, isOverdue: payload.isOverdue || false },
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
        payload: { listName: payload.listName, inviterName: payload.inviterName || '' },
        sourceModule: 'tasks',
        sourceEvent: 'TASK_LIST_MEMBER_ADDED',
      });
    }
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
        payload: { title: payload.title, assignmentId: payload.assignmentId },
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
        payload: { title: payload.title, assignmentId: payload.assignmentId },
        sourceModule: 'deploy',
        sourceEvent: 'SCHEDULE_ASSIGNMENT_UPDATED',
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
        payload: { title: payload.title, assignmentId: payload.assignmentId },
        sourceModule: 'deploy',
        sourceEvent: 'SCHEDULE_ASSIGNMENT_CANCELLED',
        sourceEntityType: 'Assignment',
        sourceEntityId: payload.assignmentId,
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
        payload: { senderName: payload.senderName, content: (payload.content || '').substring(0, 100), projectId: payload.projectId },
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
        payload: { quotationNumber: payload.quotationNumber, customerName: payload.customerName },
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
        payload: { invoiceNumber: payload.invoiceNumber, customerName: payload.customerName, daysOverdue: payload.daysOverdue },
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
        payload: { documentName: payload.documentName, documentId: payload.documentId },
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
        payload: { installationName: payload.installationName, siteName: payload.siteName, dueDate: payload.dueDate },
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
        payload: { count: payload.count },
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
        payload: { count: payload.count, daysOverdue: payload.daysOverdue },
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
        category: 'CUSTOMER',
        priority: payload.requestType === 'heizungsstoerung' ? 'HIGH' : 'NORMAL',
        channels: ['IN_APP', 'PUSH', 'EMAIL'],
        recipientIds: payload.assignedTo,
        payload: {
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
        payload: { invoiceNumber: payload.invoiceNumber, supplierName: payload.supplierName, amount: payload.amount },
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
    const recipients = (payload.assignedTo ? [payload.assignedTo] : []).filter(
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
      'SCHEDULE_ASSIGNMENT_CANCELLED', 'MOBILE_CHAT_MESSAGE_SENT', 'QUOTATION_EXPIRED',
      'INVOICE_OVERDUE', 'DOCUMENT_TPL_GENERATED', 'MAINTENANCE_OVERDUE', 'MAINTENANCE_DUE', 'MAINTENANCE_ESCALATED', 'ACCOUNTING_AP_INVOICE_RECORDED',
      'MOBILE_REPORT_SUBMITTED', 'MOBILE_ORDER_STATUS_UPDATED',
    ],
  });
}
