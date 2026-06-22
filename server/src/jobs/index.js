import queueManager from '../shared/queue/QueueManager.js';
import { FileCleanupWorker } from './fileCleanup.job.js';
import { HealthCheckWorker } from './healthCheck.job.js';
import { AuthEmailWorker } from './authEmail.job.js';
import { AuditLogWorker } from './auditLog.job.js';
import { AuditCleanupWorker } from './auditCleanup.job.js';
import { MaintenanceCheckWorker } from './maintenanceCheck.job.js';
import { ProjectArchiveWorker } from './projectArchive.job.js';
import { PrepActionOverdueWorker } from './prepActionOverdue.job.js';
import { AppointmentReminderWorker } from './appointmentReminder.job.js';
import { DailyReportReminderWorker } from './dailyReportReminder.job.js';
import { ReportEscalationWorker } from './reportEscalation.job.js';
import { QuotationExpiryWorker } from './quotationExpiry.job.js';
import { QuotationFollowUpWorker } from './quotationFollowUp.job.js';
import { InvoiceOverdueWorker } from './invoiceOverdue.job.js';
import { QopAppointmentReminderDispatchWorker } from './qopAppointmentReminderDispatch.job.js';
import { NumberSequenceResetWorker } from './numberSequenceReset.job.js';
import { DocumentGenerationWorker } from './documentGeneration.job.js';
import { EmailDispatchWorker } from './emailDispatch.job.js';
import { IghImportWorker } from './ighImport.job.js';
import { CatalogSyncWorker } from './catalogSync.job.js';
import { ScheduledPriceUpdateWorker } from './scheduledPriceUpdate.job.js';
import { ArticleImportWorker } from './articleImport.job.js';
import { BankStatementImportWorker } from './bankStatementImport.job.js';
import { AutoReconciliationWorker } from './autoReconciliation.job.js';
import { OcrProcessingWorker } from './ocrProcessing.job.js';
import { ScheduledPaymentBatchWorker } from './scheduledPaymentBatch.job.js';
import { TaskReminderDispatchWorker } from './taskReminderDispatch.job.js';
import { TaskOverdueCheckWorker } from './taskOverdueCheck.job.js';
import { FieldTicketEscalationWorker } from './fieldTicketEscalation.job.js';
import { NotificationDispatchWorker } from './notificationDispatch.job.js';
import { NotificationChannelPushWorker } from './notificationChannelPush.job.js';
import { NotificationChannelEmailWorker } from './notificationChannelEmail.job.js';
import { NotificationChannelInAppWorker } from './notificationChannelInApp.job.js';
import { ScheduledNotificationPollWorker } from './scheduledNotificationPoll.job.js';
import { IntegrationHealthCheckWorker } from './integrationHealthCheck.job.js';
import { WidgetSubmissionProcessWorker } from './widgetSubmissionProcess.job.js';
import { AiTranscriptionWorker } from './aiTranscription.job.js';
import { AiAccuracyAggregationWorker } from './aiAccuracyAggregation.job.js';
import { NewsletterDispatchWorker } from './newsletterDispatch.job.js';
import { ScheduledNewsletterWorker } from './scheduledNewsletter.job.js';
import { registerAiAgentJob } from './aiAgent.job.js';
import { registerAiAgentTimeoutJob } from './aiAgentTimeout.job.js';
import logger from '../shared/logger/index.js';

/**
 * Job registry.
 *
 * Registers all background job queues and their processors.
 * Called during server bootstrap.
 */
export function registerJobs() {
  // File cleanup — removes soft-deleted files from S3 after retention period
  const fileCleanup = new FileCleanupWorker();
  queueManager.registerQueue('file-cleanup', fileCleanup.getHandler(), {
    concurrency: 2,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 60000 },
    },
  });

  // Health check — periodic dependency monitoring
  const healthCheck = new HealthCheckWorker();
  queueManager.registerQueue('health-check', healthCheck.getHandler(), {
    concurrency: 1,
  });

  // Auth email — sends activation, reset, welcome, password-changed emails
  const authEmail = new AuthEmailWorker();
  queueManager.registerQueue('auth-email', authEmail.getHandler(), {
    concurrency: 2,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // Audit log — writes audit entries to MongoDB asynchronously
  const auditLog = new AuditLogWorker();
  queueManager.registerQueue('audit-log', auditLog.getHandler(), {
    concurrency: 5,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    },
  });

  // Audit cleanup — daily purge of expired audit records (safety net for TTL index)
  const auditCleanup = new AuditCleanupWorker();
  queueManager.registerQueue('audit-cleanup', auditCleanup.getHandler(), {
    concurrency: 1,
  });

  // Maintenance check — daily scan for due/overdue maintenance intervals
  const maintenanceCheck = new MaintenanceCheckWorker();
  queueManager.registerQueue('maintenance-check', maintenanceCheck.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // Schedule periodic jobs
  queueManager.addScheduledJob('health-check', 'periodic-health', {}, '*/5 * * * *').catch((err) => {
    logger.warn('Failed to schedule periodic health check', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  queueManager.addScheduledJob('audit-cleanup', 'daily-cleanup', {}, '0 2 * * *').catch((err) => {
    logger.warn('Failed to schedule audit cleanup', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Prep action overdue check — daily scan for overdue preparatory actions
  const prepActionOverdue = new PrepActionOverdueWorker();
  queueManager.registerQueue('prep-action-overdue', prepActionOverdue.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // Daily maintenance check at 06:00 Zurich time
  queueManager.addScheduledJob('maintenance-check', 'daily-maintenance-scan', {}, '0 6 * * *').catch((err) => {
    logger.warn('Failed to schedule maintenance check', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Project archive — daily transition of COMPLETED projects past retention to ARCHIVED
  const projectArchive = new ProjectArchiveWorker();
  queueManager.registerQueue('project-archive', projectArchive.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // Daily project archive at 03:00 Zurich time
  queueManager.addScheduledJob('project-archive', 'daily-project-archive', {}, '0 3 * * *').catch((err) => {
    logger.warn('Failed to schedule project archive', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Appointment reminder — daily scan for tomorrow's appointments needing reminders
  const appointmentReminder = new AppointmentReminderWorker();
  queueManager.registerQueue('appointment-reminder', appointmentReminder.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // Daily prep action overdue check at 07:00 Zurich time
  queueManager.addScheduledJob('prep-action-overdue', 'daily-prep-check', {}, '0 7 * * *').catch((err) => {
    logger.warn('Failed to schedule prep action overdue check', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Daily appointment reminder at 06:00 Zurich time
  queueManager.addScheduledJob('appointment-reminder', 'daily-appointment-reminders', {}, '0 6 * * *').catch((err) => {
    logger.warn('Failed to schedule appointment reminder', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Daily report reminder — 17:00 Zurich time (incomplete work reports)
  const dailyReportReminder = new DailyReportReminderWorker();
  queueManager.registerQueue('daily-report-reminder', dailyReportReminder.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
  });

  queueManager.addScheduledJob('daily-report-reminder', 'daily-report-scan', {}, '0 17 * * *').catch((err) => {
    logger.warn('Failed to schedule daily report reminder', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Report escalation — 09:00 Zurich time (overdue reports)
  const reportEscalation = new ReportEscalationWorker();
  queueManager.registerQueue('report-escalation', reportEscalation.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
  });

  queueManager.addScheduledJob('report-escalation', 'daily-escalation-scan', {}, '0 9 * * *').catch((err) => {
    logger.warn('Failed to schedule report escalation', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Quotation expiry — daily scan for expired quotations
  const quotationExpiry = new QuotationExpiryWorker();
  queueManager.registerQueue('quotation-expiry', quotationExpiry.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
  });

  queueManager.addScheduledJob('quotation-expiry', 'daily-quotation-expiry', {}, '0 6 * * *').catch((err) => {
    logger.warn('Failed to schedule quotation expiry check', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Quotation follow-up — daily scan for follow-ups and expiration warnings
  const quotationFollowUp = new QuotationFollowUpWorker();
  queueManager.registerQueue('quotation-follow-up', quotationFollowUp.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
  });

  queueManager.addScheduledJob('quotation-follow-up', 'daily-quotation-follow-up', {}, '0 8 * * *').catch((err) => {
    logger.warn('Failed to schedule quotation follow-up check', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Invoice overdue — daily scan for overdue invoices
  const invoiceOverdue = new InvoiceOverdueWorker();
  queueManager.registerQueue('invoice-overdue', invoiceOverdue.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
  });

  queueManager.addScheduledJob('invoice-overdue', 'daily-invoice-overdue', {}, '0 7 * * *').catch((err) => {
    logger.warn('Failed to schedule invoice overdue check', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // QOP appointment reminder dispatch — every 15 minutes
  const qopAppointmentDispatch = new QopAppointmentReminderDispatchWorker();
  queueManager.registerQueue('qop-appointment-dispatch', qopAppointmentDispatch.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30000 } },
  });

  queueManager.addScheduledJob('qop-appointment-dispatch', 'periodic-qop-appointment-dispatch', {}, '*/15 * * * *').catch((err) => {
    logger.warn('Failed to schedule QOP appointment reminder dispatch', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Number sequence reset — January 1st at 00:01
  const numberSequenceReset = new NumberSequenceResetWorker();
  queueManager.registerQueue('number-sequence-reset', numberSequenceReset.getHandler(), {
    concurrency: 1,
    jobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 } },
  });

  queueManager.addScheduledJob('number-sequence-reset', 'annual-sequence-reset', {}, '1 0 1 1 *').catch((err) => {
    logger.warn('Failed to schedule number sequence reset', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Document generation — batch PDF generation
  const documentGeneration = new DocumentGenerationWorker();
  queueManager.registerQueue('document-generation', documentGeneration.getHandler(), {
    concurrency: 2,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    },
  });

  // Email dispatch — sends emails via SMTP
  const emailDispatch = new EmailDispatchWorker();
  queueManager.registerQueue('email-dispatch', emailDispatch.getHandler(), {
    concurrency: 3,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // IGH import — processes full/delta imports from IGH catalog API
  const ighImport = new IghImportWorker();
  queueManager.registerQueue('igh-import', ighImport.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
    },
  });

  // Scheduled price update — applies pending price batches daily at 05:00
  const catalogSync = new CatalogSyncWorker();
  queueManager.registerQueue('catalog-sync', catalogSync.getHandler(), {
    concurrency: 2,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
    },
  });

  queueManager.addScheduledJob('catalog-sync', 'periodic-catalog-sync-scan', { scanDue: true }, '*/15 * * * *').catch((err) => {
    logger.warn('Failed to schedule connected catalog sync scan', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  const scheduledPriceUpdate = new ScheduledPriceUpdateWorker();
  queueManager.registerQueue('scheduled-price-update', scheduledPriceUpdate.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  queueManager.addScheduledJob('scheduled-price-update', 'daily-price-update', {}, '0 5 * * *').catch((err) => {
    logger.warn('Failed to schedule daily price update', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Article import — bulk CSV/JSON article import
  const articleImport = new ArticleImportWorker();
  queueManager.registerQueue('article-import', articleImport.getHandler(), {
    concurrency: 2,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // Bank statement import — retrieves statements from connected bank accounts
  const bankStatementImport = new BankStatementImportWorker();
  queueManager.registerQueue('bank-statement-import', bankStatementImport.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
    },
  });

  // Auto-reconciliation — matches bank transactions to invoices every 30 minutes
  const autoReconciliation = new AutoReconciliationWorker();
  queueManager.registerQueue('auto-reconciliation', autoReconciliation.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  queueManager.addScheduledJob('auto-reconciliation', 'periodic-auto-reconciliation', {}, '*/30 * * * *').catch((err) => {
    logger.warn('Failed to schedule auto-reconciliation', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // OCR processing — on-demand document OCR extraction
  const ocrProcessing = new OcrProcessingWorker();
  queueManager.registerQueue('ocr-processing', ocrProcessing.getHandler(), {
    concurrency: 2,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // Scheduled payment batch — daily at 05:00, creates AP payment batches
  const scheduledPaymentBatch = new ScheduledPaymentBatchWorker();
  queueManager.registerQueue('scheduled-payment-batch', scheduledPaymentBatch.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  queueManager.addScheduledJob('scheduled-payment-batch', 'daily-payment-batch', {}, '0 5 * * *').catch((err) => {
    logger.warn('Failed to schedule payment batch', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Task reminder dispatch — every minute: fire due reminders
  const taskReminderDispatch = new TaskReminderDispatchWorker();
  queueManager.registerQueue('task-reminder-dispatch', taskReminderDispatch.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    },
  });

  queueManager.addScheduledJob('task-reminder-dispatch', 'periodic-task-reminders', {}, '* * * * *').catch((err) => {
    logger.warn('Failed to schedule task reminder dispatch', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Task overdue check — every minute: scan for overdue tasks
  const taskOverdueCheck = new TaskOverdueCheckWorker();
  queueManager.registerQueue('task-overdue-check', taskOverdueCheck.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  queueManager.addScheduledJob('task-overdue-check', 'periodic-task-overdue-scan', {}, '* * * * *').catch((err) => {
    logger.warn('Failed to schedule task overdue check', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Notification dispatch — main pipeline (concurrency 10)
  const fieldTicketEscalation = new FieldTicketEscalationWorker();
  queueManager.registerQueue('field-ticket-escalation', fieldTicketEscalation.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  queueManager.addScheduledJob('field-ticket-escalation', 'periodic-field-ticket-escalation', {}, '*/15 * * * *').catch((err) => {
    logger.warn('Failed to schedule field ticket escalation', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  const notificationDispatch = new NotificationDispatchWorker();
  queueManager.registerQueue('notification-dispatch', notificationDispatch.getHandler(), {
    concurrency: 10,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    },
  });

  // Notification push channel (concurrency 20)
  const notificationPush = new NotificationChannelPushWorker();
  queueManager.registerQueue('notification-push', notificationPush.getHandler(), {
    concurrency: 20,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    },
  });

  // Notification email channel (concurrency 10)
  const notificationEmail = new NotificationChannelEmailWorker();
  queueManager.registerQueue('notification-email', notificationEmail.getHandler(), {
    concurrency: 10,
    jobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // Notification in-app channel — delivers via Socket.IO to connected clients
  const notificationInApp = new NotificationChannelInAppWorker();
  queueManager.registerQueue('notification-in-app', notificationInApp.getHandler(), {
    concurrency: 20,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    },
  });

  // Scheduled notification poll — every 5 minutes
  const scheduledNotificationPoll = new ScheduledNotificationPollWorker();
  queueManager.registerQueue('scheduled-notification-poll', scheduledNotificationPoll.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10000 },
    },
  });

  queueManager.addScheduledJob('scheduled-notification-poll', 'periodic-scheduled-poll', {}, '*/5 * * * *').catch((err) => {
    logger.warn('Failed to schedule notification poll', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Integration health check — every 5 minutes
  const integrationHealthCheck = new IntegrationHealthCheckWorker();
  queueManager.registerQueue('integration-health-check', integrationHealthCheck.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  queueManager.addScheduledJob('integration-health-check', 'periodic-integration-health', {}, '*/5 * * * *').catch((err) => {
    logger.warn('Failed to schedule integration health check', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Widget submission process — on-demand CRM processing
  const widgetSubmissionProcess = new WidgetSubmissionProcessWorker();
  queueManager.registerQueue('widget-submission-process', widgetSubmissionProcess.getHandler(), {
    concurrency: 3,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // AI transcription — async batch STT processing
  const aiTranscription = new AiTranscriptionWorker();
  queueManager.registerQueue('ai-transcription', aiTranscription.getHandler(), {
    concurrency: 5,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
    },
  });

  // AI accuracy aggregation — monthly on the 1st at 03:00
  const aiAccuracyAggregation = new AiAccuracyAggregationWorker();
  queueManager.registerQueue('ai-accuracy-aggregation', aiAccuracyAggregation.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 60000 },
    },
  });

  queueManager.addScheduledJob('ai-accuracy-aggregation', 'monthly-ai-accuracy', {}, '0 3 1 * *').catch((err) => {
    logger.warn('Failed to schedule AI accuracy aggregation', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // Newsletter dispatch — batch email sending for CRM newsletters
  const newsletterDispatch = new NewsletterDispatchWorker();
  queueManager.registerQueue('newsletter-dispatch', newsletterDispatch.getHandler(), {
    concurrency: 2,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  // Scheduled newsletter — every 5 minutes: dispatch newsletters whose scheduledAt is due
  const scheduledNewsletter = new ScheduledNewsletterWorker();
  queueManager.registerQueue('scheduled-newsletter', scheduledNewsletter.getHandler(), {
    concurrency: 1,
    jobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30000 },
    },
  });

  queueManager.addScheduledJob('scheduled-newsletter', 'periodic-scheduled-newsletter', {}, '*/5 * * * *').catch((err) => {
    logger.warn('Failed to schedule scheduled newsletter poll', {
      module: 'jobs',
      error: { message: err.message },
    });
  });

  // AI agent — agentic orchestration (execute + resume with confirmation)
  registerAiAgentJob(queueManager);

  // AI agent timeout sweep — cancel AWAITING_CONFIRMATION runs older than 5 min, every 2 min
  registerAiAgentTimeoutJob(queueManager);

  logger.info('Background jobs registered', {
    module: 'jobs',
    action: 'register',
    queues: ['file-cleanup', 'health-check', 'auth-email', 'audit-log', 'audit-cleanup', 'maintenance-check', 'project-archive', 'prep-action-overdue', 'appointment-reminder', 'daily-report-reminder', 'report-escalation', 'quotation-expiry', 'quotation-follow-up', 'invoice-overdue', 'qop-appointment-dispatch', 'number-sequence-reset', 'document-generation', 'email-dispatch', 'igh-import', 'catalog-sync', 'scheduled-price-update', 'article-import', 'bank-statement-import', 'auto-reconciliation', 'ocr-processing', 'scheduled-payment-batch', 'task-reminder-dispatch', 'task-overdue-check', 'field-ticket-escalation', 'notification-dispatch', 'notification-push', 'notification-email', 'notification-in-app', 'scheduled-notification-poll', 'integration-health-check', 'widget-submission-process', 'ai-transcription', 'ai-accuracy-aggregation', 'newsletter-dispatch', 'scheduled-newsletter', 'ai-agent', 'ai-agent-timeout'],
  });
}

export default { registerJobs };
