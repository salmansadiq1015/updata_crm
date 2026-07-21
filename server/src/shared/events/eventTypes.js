/**
 * Domain event type constants.
 * All modules publish/subscribe using these types.
 *
 * Convention: <module>.<entity>.<action>
 * This enables pattern subscriptions (e.g., 'file.*' for all file events).
 */
const EVENT_TYPES = Object.freeze({
  // System
  SYSTEM_STARTED: 'system.started',
  SYSTEM_HEALTH_DEGRADED: 'system.health.degraded',
  SYSTEM_HEALTH_RECOVERED: 'system.health.recovered',

  // Files
  FILE_UPLOADED: 'file.uploaded',
  FILE_DELETED: 'file.deleted',
  FILE_CLEANUP_REQUIRED: 'file.cleanup.required',

  // Auth (Module 02)
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILED: 'auth.login.failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_CHANGED: 'auth.password_changed',
  AUTH_PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  AUTH_SESSION_REVOKED: 'auth.session.revoked',
  AUTH_ACCOUNT_LOCKED: 'auth.account.locked',
  AUTH_ACCOUNT_UNLOCKED: 'auth.account.unlocked',

  // Users (Module 02)
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_DEACTIVATED: 'user.deactivated',
  USER_ROLE_CHANGED: 'user.role_changed',

  // Roles (Module 02)
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',

  // CRM (Module 03) — Customers
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_ARCHIVED: 'customer.archived',
  CUSTOMER_MERGED: 'customer.merged',
  CUSTOMER_DELETED: 'customer.deleted',

  // CRM — Contacts
  CONTACT_CREATED: 'contact.created',
  CONTACT_UPDATED: 'contact.updated',
  CONTACT_DELETED: 'contact.deleted',

  // CRM — Sites
  SITE_CREATED: 'site.created',
  SITE_UPDATED: 'site.updated',
  SITE_DEACTIVATED: 'site.deactivated',

  // CRM — Installations
  INSTALLATION_CREATED: 'installation.created',
  INSTALLATION_UPDATED: 'installation.updated',
  INSTALLATION_DECOMMISSIONED: 'installation.decommissioned',

  // CRM — Maintenance
  MAINTENANCE_INTERVAL_CREATED: 'maintenance.interval.created',
  MAINTENANCE_INTERVAL_UPDATED: 'maintenance.interval.updated',
  MAINTENANCE_DUE: 'maintenance.due',
  MAINTENANCE_OVERDUE: 'maintenance.overdue',
  MAINTENANCE_ESCALATED: 'maintenance.escalated',

  // CRM — Spare Parts
  SPARE_PART_CREATED: 'spare_part.created',
  SPARE_PART_UPDATED: 'spare_part.updated',
  SPARE_PART_DELETED: 'spare_part.deleted',
  SPARE_PART_LINKED: 'spare_part.linked',
  SPARE_PART_UNLINKED: 'spare_part.unlinked',
  SPARE_PART_ORDER_REQUESTED: 'spare_part.order_requested',
  SPARE_PART_ORDER_STATUS_UPDATED: 'spare_part.order_status_updated',
  INVENTORY_MOVEMENT_CREATED: 'inventory.movement.created',
  PURCHASE_ORDER_CREATED: 'purchase_order.created',
  PURCHASE_ORDER_RECEIVED: 'purchase_order.received',
  PURCHASE_ORDER_CANCELLED: 'purchase_order.cancelled',
  DELIVERY_NOTE_OCR_EXTRACTED: 'delivery_note.ocr.extracted',
  DELIVERY_NOTE_CONFIRMED: 'delivery_note.confirmed',

  // CRM — Newsletters
  NEWSLETTER_CREATED: 'newsletter.created',
  NEWSLETTER_SCHEDULED: 'newsletter.scheduled',
  NEWSLETTER_SENT: 'newsletter.sent',
  NEWSLETTER_CANCELLED: 'newsletter.cancelled',

  // CRM — Notes & Images
  NOTE_CREATED: 'note.created',
  IMAGE_LINKED: 'image.linked',
  IMAGE_UNLINKED: 'image.unlinked',

  // Projects (Module 04) — Project Lifecycle
  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_DELETED: 'project.deleted',
  PROJECT_DUPLICATED: 'project.duplicated',
  PROJECT_ARCHIVED: 'project.archived',
  PROJECT_RESTORED: 'project.restored',
  PROJECT_STATUS_CHANGED: 'project.status_changed',
  PROJECT_STATUS_OVERRIDDEN: 'project.status_overridden',

  // Projects — Preparatory Actions
  PREP_ACTION_CREATED: 'prep_action.created',
  PREP_ACTION_UPDATED: 'prep_action.updated',
  PREP_ACTION_DELETED: 'prep_action.deleted',
  PREP_ACTION_OVERDUE: 'prep_action.overdue',

  // Projects — Schedule & Confirmations
  SCHEDULE_ENTRY_CREATED: 'schedule_entry.created',
  SCHEDULE_ENTRY_UPDATED: 'schedule_entry.updated',
  SCHEDULE_ENTRY_DELETED: 'schedule_entry.deleted',
  SCHEDULE_ENTRIES_CASCADED: 'schedule_entries.cascaded',
  PARTNER_CONFIRMATION_SENT: 'partner_confirmation.sent',
  PARTNER_CONFIRMATION_RESPONSE: 'partner_confirmation.response',

  // Projects — Documents
  PROJECT_DOCUMENT_UPLOADED: 'project_document.uploaded',
  PROJECT_DOCUMENT_GENERATED: 'project_document.generated',
  PROJECT_DOCUMENT_DELETED: 'project_document.deleted',

  // Scheduling / Deploy (Module 05)
  SCHEDULE_ASSIGNMENT_CREATED: 'schedule.assignment.created',
  SCHEDULE_ASSIGNMENT_UPDATED: 'schedule.assignment.updated',
  SCHEDULE_ASSIGNMENT_MOVED: 'schedule.assignment.moved',
  SCHEDULE_ASSIGNMENT_CANCELLED: 'schedule.assignment.cancelled',
  SCHEDULE_APPOINTMENT_CONFIRMED: 'schedule.appointment.confirmed',
  SCHEDULE_APPOINTMENT_CANCELLED: 'schedule.appointment.cancelled',
  SCHEDULE_APPOINTMENT_RESCHEDULED: 'schedule.appointment.rescheduled',
  SCHEDULE_APPOINTMENT_REMINDER: 'schedule.appointment.reminder',
  SCHEDULE_CONFLICT_DETECTED: 'schedule.conflict.detected',
  SCHEDULE_COARSE_ALLOCATION_CHANGED: 'schedule.coarse.allocation.changed',

  // Mobile BFF (Module 06)
  MOBILE_REPORT_CREATED: 'mobile.report.created',
  MOBILE_REPORT_SUBMITTED: 'mobile.report.submitted',
  MOBILE_TIME_ENTRY_CREATED: 'mobile.time_entry.created',
  MOBILE_TIME_ENTRY_RELEASED: 'mobile.time_entry.released',
  MOBILE_PHOTO_UPLOADED: 'mobile.photo.uploaded',
  MOBILE_DOCUMENT_UPLOADED: 'mobile.document.uploaded',
  MOBILE_CHAT_MESSAGE_SENT: 'mobile.chat.message_sent',
  MOBILE_SMALL_ORDER_CREATED: 'mobile.small_order.created',
  MOBILE_ORDER_STATUS_UPDATED: 'mobile.order.status_updated',

  // Time & Absence Management
  TIME_LEAVE_REQUEST_CREATED: 'time.leave_request.created',
  TIME_LEAVE_REQUEST_APPROVED: 'time.leave_request.approved',
  TIME_LEAVE_REQUEST_REJECTED: 'time.leave_request.rejected',

  // Quotations & Order Processing (Module 08)
  QUOTATION_CREATED: 'quotation.created',
  QUOTATION_STATUS_CHANGED: 'quotation.status_changed',
  QUOTATION_SENT: 'quotation.sent',
  QUOTATION_ACCEPTED: 'quotation.accepted',
  QUOTATION_EXPIRED: 'quotation.expired',
  QUOTATION_CONVERTED: 'quotation.converted',
  ORDER_CREATED: 'order.created',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_FINALIZED: 'invoice.finalized',
  INVOICE_SENT: 'invoice.sent',
  INVOICE_PAYMENT_RECORDED: 'invoice.payment_recorded',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_OVERDUE: 'invoice.overdue',
  QOP_REMINDER_SENT: 'qop.reminder.sent',
  QOP_CUSTOMER_RESPONDED: 'qop.customer.responded',

  // Document Templates (Module 09)
  DOCUMENT_TPL_GENERATED: 'document.generated',
  DOCUMENT_TPL_GENERATION_FAILED: 'document.generation_failed',
  DOCUMENT_TPL_DELETED: 'document.deleted',
  DOCTPL_EMAIL_QUEUED: 'doctpl.email.queued',
  DOCTPL_EMAIL_SENT: 'doctpl.email.sent',
  DOCTPL_EMAIL_DELIVERED: 'doctpl.email.delivered',
  DOCTPL_EMAIL_BOUNCED: 'doctpl.email.bounced',
  DOCTPL_EMAIL_FAILED: 'doctpl.email.failed',
  DOCTPL_TEMPLATE_UPDATED: 'doctpl.template.updated',
  DOCTPL_TEMPLATE_REVERTED: 'doctpl.template.reverted',
  DOCTPL_TEMPLATE_APPROVAL_REQUESTED: 'doctpl.template.approval_requested',
  DOCTPL_TEMPLATE_APPROVED: 'doctpl.template.approved',
  DOCTPL_TEMPLATE_REJECTED: 'doctpl.template.rejected',
  DOCTPL_CI_UPDATED: 'doctpl.ci.updated',

  // Material Catalogs (Module 10)
  CATALOG_CATEGORY_CREATED: 'catalog.category.created',
  CATALOG_CATEGORY_UPDATED: 'catalog.category.updated',
  CATALOG_ARTICLE_CREATED: 'catalog.article.created',
  CATALOG_ARTICLE_UPDATED: 'catalog.article.updated',
  CATALOG_ARTICLE_DELETED: 'catalog.article.deleted',
  CATALOG_ARTICLE_PRICE_CHANGED: 'catalog.article.price_changed',
  CATALOG_ARTICLE_USED: 'catalog.article.used',
  CATALOG_PRICE_BATCH_APPLIED: 'catalog.price_batch.applied',
  CATALOG_IGH_IMPORT_STARTED: 'catalog.igh.import.started',
  CATALOG_IGH_IMPORT_COMPLETED: 'catalog.igh.import.completed',
  CATALOG_IGH_IMPORT_FAILED: 'catalog.igh.import.failed',
  CATALOG_CONNECTION_CHANGED: 'catalog.connection.changed',
  CATALOG_MARKUP_RULE_CHANGED: 'catalog.markup_rule.changed',
  CATALOG_SYNC_COMPLETED: 'catalog.sync.completed',
  CATALOG_SYNC_FAILED: 'catalog.sync.failed',
  CATALOG_TEXT_BLOCK_CREATED: 'catalog.text_block.created',
  CATALOG_TEXT_BLOCK_UPDATED: 'catalog.text_block.updated',

  // Accounting (Module 11)
  ACCOUNTING_AR_INVOICE_CREATED: 'accounting.ar.invoice.created',
  ACCOUNTING_AR_INVOICE_FINALIZED: 'accounting.ar.invoice.finalized',
  ACCOUNTING_AR_INVOICE_PAID: 'accounting.ar.invoice.paid',
  ACCOUNTING_AR_INVOICE_CANCELLED: 'accounting.ar.invoice.cancelled',
  ACCOUNTING_AR_PAYMENT_RECORDED: 'accounting.ar.payment.recorded',
  ACCOUNTING_AR_PAYMENT_ALLOCATED: 'accounting.ar.payment.allocated',
  ACCOUNTING_AR_DUNNING_GENERATED: 'accounting.ar.dunning.generated',
  ACCOUNTING_AP_INVOICE_RECORDED: 'accounting.ap.invoice.recorded',
  ACCOUNTING_AP_INVOICE_APPROVED: 'accounting.ap.invoice.approved',
  ACCOUNTING_AP_PAYMENT_BATCH_CREATED: 'accounting.ap.payment_batch.created',
  ACCOUNTING_DOCUMENT_UPLOADED: 'accounting.document.uploaded',
  ACCOUNTING_DOCUMENT_ASSIGNED: 'accounting.document.assigned',
  ACCOUNTING_OCR_COMPLETED: 'accounting.ocr.completed',
  ACCOUNTING_BANK_STATEMENT_IMPORTED: 'accounting.bank.statement.imported',
  ACCOUNTING_RECONCILIATION_COMPLETED: 'accounting.reconciliation.completed',
  ACCOUNTING_JOURNAL_ENTRY_CREATED: 'accounting.journal.entry.created',

  // Tasks (Module 12)
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_COMPLETED: 'task.completed',
  TASK_REOPENED: 'task.reopened',
  TASK_DELETED: 'task.deleted',
  TASK_ASSIGNED: 'task.assigned',
  TASK_MOVED: 'task.moved',
  TASK_DUE_DATE_CHANGED: 'task.due_date_changed',
  TASK_DUE: 'task.due',
  TASK_OVERDUE: 'task.overdue',
  TASK_POOLED: 'task.pooled',
  TASK_POOL_HELPED: 'task.pool.helped',
  TASK_NOTE_ADDED: 'task.note.added',
  TASK_ATTACHMENT_ADDED: 'task.attachment.added',
  TASK_REMINDER_FIRED: 'task.reminder.fired',
  TASK_LIST_CREATED: 'task_list.created',
  TASK_LIST_MEMBER_ADDED: 'task_list.member.added',
  TASK_LIST_MEMBER_REMOVED: 'task_list.member.removed',

  // Meetings
  MEETING_CREATED: 'meeting.created',
  MEETING_UPDATED: 'meeting.updated',
  MEETING_CANCELLED: 'meeting.cancelled',
  MEETING_RSVP_UPDATED: 'meeting.rsvp_updated',
  MEETING_TASK_CREATED: 'meeting.task_created',

  // Field tickets / technician incidents
  FIELD_TICKET_CREATED: 'field_ticket.created',
  FIELD_TICKET_UPDATED: 'field_ticket.updated',
  FIELD_TICKET_ASSIGNED: 'field_ticket.assigned',
  FIELD_TICKET_STATUS_CHANGED: 'field_ticket.status_changed',
  FIELD_TICKET_COMMENTED: 'field_ticket.commented',
  FIELD_TICKET_ESCALATED: 'field_ticket.escalated',
  FIELD_TICKET_AI_ANALYZED: 'field_ticket.ai_analyzed',

  // AI Assistant (Module 07)
  AI_SESSION_STARTED: 'ai.session.started',
  AI_SESSION_TRANSCRIBED: 'ai.session.transcribed',
  AI_SESSION_ENTITIES_EXTRACTED: 'ai.session.entities_extracted',
  AI_SESSION_CONFIRMED: 'ai.session.confirmed',
  AI_SESSION_COMPLETED: 'ai.session.completed',
  AI_SESSION_FAILED: 'ai.session.failed',
  AI_SESSION_CORRECTED: 'ai.session.corrected',
  AI_VOCABULARY_UPDATED: 'ai.vocabulary.updated',
  AI_ORDER_CREATE_REQUESTED: 'ai.order.create_requested',
  AI_REPORT_CONTENT_CAPTURED: 'ai.report.content_captured',
  AI_ADDRESS_CAPTURED: 'ai.address.captured',

  // AI Agent (agentic execution engine)
  AI_AGENT_RUN_STARTED: 'ai.agent.run.started',
  AI_AGENT_STEP_COMPLETED: 'ai.agent.step.completed',
  AI_AGENT_AWAITING_CONFIRMATION: 'ai.agent.awaiting_confirmation',
  AI_AGENT_RUN_COMPLETED: 'ai.agent.run.completed',
  AI_AGENT_RUN_FAILED: 'ai.agent.run.failed',
  AI_AGENT_RUN_CANCELLED: 'ai.agent.run.cancelled',
  AI_TOOL_EXECUTED: 'ai.tool.executed',
  AI_TOOL_FAILED: 'ai.tool.failed',

  // Integrations (Module 14)
  INTEGRATION_STATUS_CHANGED: 'integration.status.changed',
  INTEGRATION_SYNC_COMPLETED: 'integration.sync.completed',
  INTEGRATION_SYNC_FAILED: 'integration.sync.failed',
  WIDGET_SUBMISSION_RECEIVED: 'widget.submission.received',
  WIDGET_SUBMISSION_PROCESSED: 'widget.submission.processed',
  BANKING_TRANSACTIONS_IMPORTED: 'banking.transactions.imported',
  BANKING_PAYMENT_MATCHED: 'banking.payment.matched',
  OCR_EXTRACTION_COMPLETED: 'ocr.extraction.completed',
  CALENDAR_EVENT_SYNCED: 'calendar.event.synced',

  // Notifications (Module 13)
  NOTIFICATION_QUEUED: 'notification.queued',
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_DELIVERED: 'notification.delivered',
  NOTIFICATION_FAILED: 'notification.failed',
  NOTIFICATION_BOUNCED: 'notification.bounced',
  NOTIFICATION_READ: 'notification.read',
  NOTIFICATION_UNSUBSCRIBED: 'notification.unsubscribed',
  NOTIFICATION_SCHEDULED_FIRED: 'notification.scheduled.fired',
  NOTIFICATION_DLQ: 'notification.dlq',

  // Jobs
  JOB_FAILED: 'job.failed',
  JOB_COMPLETED: 'job.completed',

  // Cache invalidation
  CACHE_INVALIDATE: 'cache.invalidate',
});

export default EVENT_TYPES;
