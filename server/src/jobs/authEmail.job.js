import { BaseWorker } from '../shared/queue/BaseWorker.js';
import {
  sendInvoiceSentEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendActivationEmail,
  sendPasswordChangedEmail,
  sendProjectStatusNotification,
  sendPartnerConfirmationEmail,
  sendAppointmentConfirmationEmail,
  sendAppointmentReminderEmail,
  sendAppointmentCancellationEmail,
  sendAppointmentRescheduledEmail,
  sendQuotationEmail,
  sendQopAppointmentReminderEmail,
  sendMeetingNotificationEmail,
} from '../shared/mail/mail.js';
import logger from '../shared/logger/index.js';

async function findInvoiceRecipient(invoice, fallbackEmail = null) {
  if (fallbackEmail) return { email: fallbackEmail, name: invoice.customerName };

  if (invoice.contactId) {
    const Contact = (await import('../modules/crm/contact.model.js')).default;
    const contact = await Contact.findById(invoice.contactId)
      .select('email firstName lastName')
      .lean();
    if (contact?.email) {
      return {
        email: contact.email,
        name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || invoice.customerName,
      };
    }
  }

  const Customer = (await import('../modules/crm/customer.model.js')).default;
  const customer = await Customer.findById(invoice.customerId)
    .select('email name')
    .lean();
  if (customer?.email) {
    return { email: customer.email, name: customer.name || invoice.customerName };
  }

  throw new Error(`No invoice recipient email found for invoice ${invoice.invoiceNumber}`);
}

async function loadInvoicePdfAttachment(invoice) {
  if (!invoice.pdfDocumentId) return null;

  const AccountingDocument = (await import('../modules/accounting/accountingDocument.model.js')).default;
  const document = await AccountingDocument.findById(invoice.pdfDocumentId)
    .select('fileName filePath mimeType')
    .lean();
  if (!document?.filePath) return null;

  const fileService = (await import('../modules/files/file.service.js')).default;
  const content = await fileService.downloadBuffer(document.filePath);
  return {
    filename: document.fileName || `Rechnung_${invoice.invoiceNumber}.pdf`,
    content,
    contentType: document.mimeType || 'application/pdf',
  };
}

async function loadGeneratedDocumentAttachment(sourceRecordId, documentType, fallbackFileName) {
  const generatedDocumentRepository = (await import('../modules/doctpl/generatedDocument.repository.js')).default;
  const docs = await generatedDocumentRepository.findBySource('qop', sourceRecordId);
  const doc = docs.find((d) => d.documentType === documentType) || docs[0];
  if (!doc?.fileId) return null;

  const fileService = (await import('../modules/files/file.service.js')).default;
  const fileMeta = await fileService.getById(doc.fileId);
  if (!fileMeta?.key) return null;

  return {
    filename: doc.fileName || fallbackFileName,
    content: await fileService.downloadBuffer(fileMeta.key),
    contentType: fileMeta.mimeType || 'application/pdf',
  };
}

async function findQuotationRecipient(quotation, fallbackEmail = null) {
  if (fallbackEmail) return { email: fallbackEmail, name: quotation.customerName };

  if (quotation.contactId) {
    const Contact = (await import('../modules/crm/contact.model.js')).default;
    const contact = await Contact.findById(quotation.contactId)
      .select('email firstName lastName')
      .lean();
    if (contact?.email) {
      return {
        email: contact.email,
        name: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || quotation.customerName,
      };
    }
  }

  const Customer = (await import('../modules/crm/customer.model.js')).default;
  const customer = await Customer.findById(quotation.customerId)
    .select('email name')
    .lean();
  if (customer?.email) {
    return { email: customer.email, name: customer.name || quotation.customerName };
  }

  throw new Error(`No quotation recipient email found for quotation ${quotation.quotationNumber}`);
}

async function sendStatusNotificationJob(data) {
  const Project = (await import('../modules/pm/project.model.js')).default;
  const project = await Project.findById(data.projectId)
    .select('name projectNumber projectManagerId')
    .lean();
  if (!project) return { skipped: true, reason: 'project_not_found' };

  const User = (await import('../modules/auth/user.model.js')).default;

  // Fan out to the project manager (when distinct from the actor) plus any
  // configured CC recipients (PROJ-002 AC-6 — "configured recipients"). Deduped
  // by email so a CC that repeats the PM is only mailed once.
  const recipients = []; // { email, name }
  const seen = new Set();
  const addRecipient = (email, name) => {
    if (!email) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    recipients.push({ email, name: name || email });
  };

  let pmExcludedReason = null;
  const pmIsActor = project.projectManagerId && String(project.projectManagerId) === String(data.changedBy);
  if (!project.projectManagerId || pmIsActor) {
    pmExcludedReason = 'no_distinct_recipient';
  } else {
    const pm = await User.findById(project.projectManagerId).select('email firstName lastName').lean();
    if (pm?.email) {
      addRecipient(pm.email, [pm.firstName, pm.lastName].filter(Boolean).join(' '));
    } else {
      pmExcludedReason = 'no_recipient_email';
    }
  }

  for (const cc of (Array.isArray(data.ccRecipients) ? data.ccRecipients : [])) {
    addRecipient(typeof cc === 'string' ? cc.trim() : null);
  }

  if (recipients.length === 0) {
    return { skipped: true, reason: pmExcludedReason || 'no_recipients' };
  }

  const actor = data.changedBy
    ? await User.findById(data.changedBy).select('firstName lastName').lean()
    : null;
  const changedByName = actor ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') : '';

  for (const r of recipients) {
    await sendProjectStatusNotification(r.email, {
      recipientName: r.name,
      projectName: project.name,
      projectNumber: project.projectNumber,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      changedBy: changedByName,
      comment: data.comment || '',
      projectUrl: '',
    });
  }

  return { sent: true, jobType: 'send-status-notification', recipients: recipients.map((r) => r.email) };
}

async function sendPartnerConfirmationJob(data) {
  if (!data.email) return { skipped: true, reason: 'no_recipient_email' };

  // Load the generated appointment-confirmation PDF (PROJ-004 AC-3) and attach it.
  // The buffer is fetched here in the worker (not passed through the queue) so the
  // job payload stays small.
  let pdfAttachment = null;
  if (data.documentFileId) {
    try {
      const fileService = (await import('../modules/files/file.service.js')).default;
      const fileMeta = await fileService.getById(data.documentFileId);
      if (fileMeta?.key) {
        pdfAttachment = await fileService.downloadBuffer(fileMeta.key);
      }
    } catch (err) {
      // Never fail the email because the attachment could not be loaded — the
      // confirmation email still goes out without the PDF.
      logger.warn('Partner confirmation PDF could not be attached', {
        module: 'jobs', action: 'send-partner-confirmation', fileId: data.documentFileId, error: err.message,
      });
    }
  }

  await sendPartnerConfirmationEmail(data.email, {
    partnerName: data.partnerName,
    projectName: data.projectName,
    projectNumber: data.projectNumber,
    entryName: data.entryName,
    startDate: data.startDate,
    endDate: data.endDate,
    siteAddress: data.siteAddress,
    contactPerson: data.contactPerson,
    notes: data.notes,
    confirmationUrl: '',
  }, pdfAttachment);
  return { sent: true, jobType: 'send-partner-confirmation', email: data.email };
}

async function sendInvoiceJob(data) {
  const Invoice = (await import('../modules/qop/invoice.model.js')).default;
  const invoice = await Invoice.findById(data.invoiceId)
    .select('invoiceNumber customerName customerId contactId invoiceDate dueDate currency amountDue paymentTermsText pdfDocumentId')
    .lean();
  if (!invoice) {
    throw new Error(`Invoice not found for email job: ${data.invoiceId}`);
  }

  const recipient = await findInvoiceRecipient(invoice, data.email || null);
  const pdfAttachment = await loadInvoicePdfAttachment(invoice);
  const info = await sendInvoiceSentEmail(recipient.email, {
    invoiceNumber: invoice.invoiceNumber,
    customerName: recipient.name || invoice.customerName,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    amountDue: invoice.amountDue,
    paymentTermsText: invoice.paymentTermsText,
  }, pdfAttachment);

  return { sent: true, jobType: 'send-invoice', email: recipient.email, messageId: info?.messageId || null };
}

async function sendQuotationJob(data) {
  const Quotation = (await import('../modules/qop/quotation.model.js')).default;
  const quotation = await Quotation.findById(data.quotationId)
    .select('quotationNumber customerName customerId contactId title createdAt validUntil currency grandTotalRounded')
    .lean();
  if (!quotation) {
    throw new Error(`Quotation not found for email job: ${data.quotationId}`);
  }

  const recipient = await findQuotationRecipient(quotation, data.email || null);
  const pdfAttachment = await loadGeneratedDocumentAttachment(
    quotation._id,
    'quotation',
    `Offerte_${quotation.quotationNumber}.pdf`,
  );
  const info = await sendQuotationEmail(recipient.email, {
    quotationNumber: quotation.quotationNumber,
    customerName: recipient.name || quotation.customerName,
    title: quotation.title,
    quotationDate: formatDate(quotation.createdAt),
    validUntil: formatDate(quotation.validUntil),
    currency: quotation.currency,
    grandTotal: quotation.grandTotalRounded,
  }, pdfAttachment);

  return { sent: true, jobType: 'send-quotation', email: recipient.email, messageId: info?.messageId || null };
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatName(user) {
  if (!user) return '';
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}

function formatSiteAddress(site) {
  if (!site) return '';
  const cityLine = [site.postalCode, site.city].filter(Boolean).join(' ');
  return [site.street, cityLine].filter(Boolean).join(', ');
}

async function loadAppointmentEmailContext(data = {}) {
  let appointment = null;
  let assignment = null;
  let site = null;

  if (data.assignmentId) {
    const AppointmentDetails = (await import('../modules/deploy/appointmentDetails.model.js')).default;
    const Assignment = (await import('../modules/deploy/assignment.model.js')).default;

    [appointment, assignment] = await Promise.all([
      AppointmentDetails.findOne({ assignmentId: data.assignmentId }).lean(),
      Assignment.findById(data.assignmentId)
        .populate({ path: 'employeeId', select: 'firstName lastName email' })
        .lean(),
    ]);

    if (assignment?.siteId) {
      const Site = (await import('../modules/crm/site.model.js')).default;
      site = await Site.findById(assignment.siteId)
        .select('street postalCode city')
        .lean();
    }
  }

  const scheduleStart = data.newStartDatetime || data.startDatetime || assignment?.startDatetime || data.appointmentDate;

  return {
    email: data.email || appointment?.customerContactEmail || null,
    customerName: data.customerName || appointment?.customerContactName || 'Kunde',
    appointmentDate: data.appointmentDate || formatDate(scheduleStart),
    appointmentWindow: data.appointmentWindow || appointment?.appointmentWindow || '',
    technicianName: data.technicianName || formatName(assignment?.employeeId),
    serviceAddress: data.serviceAddress || formatSiteAddress(site),
    assignmentType: data.assignmentType || assignment?.assignmentType || '',
    instructions: data.instructions || assignment?.instructions || appointment?.customerNotes || '',
    contactPhone: data.contactPhone || appointment?.customerContactPhone || '',
    reason: data.reason || '',
  };
}

async function sendAppointmentConfirmationJob(data) {
  const context = await loadAppointmentEmailContext(data);
  if (!context.email) return { skipped: true, reason: 'no_recipient_email' };
  await sendAppointmentConfirmationEmail(context.email, context);
  return { sent: true, jobType: 'send-appointment-confirmation', email: context.email };
}

async function sendAppointmentReminderJob(data) {
  const context = await loadAppointmentEmailContext(data);
  if (!context.email) return { skipped: true, reason: 'no_recipient_email' };
  await sendAppointmentReminderEmail(context.email, context);
  return { sent: true, jobType: 'send-appointment-reminder', email: context.email };
}

async function sendAppointmentCancellationJob(data) {
  const context = await loadAppointmentEmailContext(data);
  if (!context.email) return { skipped: true, reason: 'no_recipient_email' };
  await sendAppointmentCancellationEmail(context.email, context);
  return { sent: true, jobType: 'send-appointment-cancellation', email: context.email };
}

async function sendAppointmentRescheduledJob(data) {
  const context = await loadAppointmentEmailContext(data);
  if (!context.email) return { skipped: true, reason: 'no_recipient_email' };
  await sendAppointmentRescheduledEmail(context.email, context);
  return { sent: true, jobType: 'send-appointment-rescheduled', email: context.email };
}

async function loadQopAppointmentReminderContext(data = {}) {
  const payload = data.data ? { ...data.data, email: data.email } : data;
  const Customer = (await import('../modules/crm/customer.model.js')).default;
  const customer = payload.customerId
    ? await Customer.findById(payload.customerId)
      .select('name email phone mobile street postalCode city')
      .lean()
    : null;

  let appointment = null;
  let assignment = null;
  if (payload.appointmentId) {
    const AppointmentDetails = (await import('../modules/deploy/appointmentDetails.model.js')).default;
    const Assignment = (await import('../modules/deploy/assignment.model.js')).default;
    appointment = await AppointmentDetails.findOne({
      $or: [
        { _id: payload.appointmentId },
        { assignmentId: payload.appointmentId },
      ],
    }).lean();
    const assignmentId = appointment?.assignmentId || payload.assignmentId || payload.appointmentId;
    assignment = await Assignment.findById(assignmentId).lean();
  }

  const scheduleStart = assignment?.startDatetime || payload.scheduledAt || payload.appointmentDate;
  const cityLine = [customer?.postalCode, customer?.city].filter(Boolean).join(' ');
  const siteAddress = payload.siteAddress || [customer?.street, cityLine].filter(Boolean).join(', ');

  return {
    email: payload.email || appointment?.customerContactEmail || customer?.email || null,
    customerName: payload.customerName || appointment?.customerContactName || customer?.name || 'Kunde',
    appointmentDate: payload.appointmentDate || formatDate(scheduleStart),
    appointmentTime: payload.appointmentTime || appointment?.appointmentWindow || '',
    technicianName: payload.technicianName || '',
    serviceDescription: payload.serviceDescription || assignment?.assignmentType || '',
    siteAddress,
    contactPhone: payload.contactPhone || appointment?.customerContactPhone || customer?.mobile || customer?.phone || '',
  };
}

async function sendQopAppointmentReminderJob(data) {
  const context = await loadQopAppointmentReminderContext(data);
  if (!context.email) return { skipped: true, reason: 'no_recipient_email' };
  await sendQopAppointmentReminderEmail(context.email, context);
  return { sent: true, jobType: 'send-qop-appointment-reminder', email: context.email };
}

async function sendMeetingNotificationJob(data) {
  if (!data.email) return { skipped: true, reason: 'no_recipient_email' };
  const info = await sendMeetingNotificationEmail(data.email, data);
  return { sent: true, jobType: 'send-meeting-notification', email: data.email, messageId: info?.messageId || null };
}

/**
 * Auth email worker.
 *
 * Processes all authentication-related email jobs:
 * - send-activation-email: New user account activation
 * - send-reset-email: Password reset link
 * - send-welcome-email: Welcome with temp credentials
 * - send-password-changed-email: Password change notification
 * - send-invoice: QOP invoice delivery with archived PDF attachment
 */
export class AuthEmailWorker extends BaseWorker {
  constructor() {
    super('auth-email');
  }

  async process(job) {
    const { name: jobType, data } = job;

    switch (jobType) {
      case 'send-activation-email':
        await sendActivationEmail(data.email, data.name, data.activationUrl);
        break;

      case 'send-reset-email':
        await sendPasswordResetEmail(data.email, data.name, data.resetUrl);
        break;

      case 'send-welcome-email':
        await sendWelcomeEmail(data.email, data.name, data.tempPassword);
        break;

      case 'send-password-changed-email':
        await sendPasswordChangedEmail(data.email, data.name);
        break;

      case 'send-invoice':
        return sendInvoiceJob(data);

      case 'send-quotation':
        return sendQuotationJob(data);

      case 'send-status-notification':
        return sendStatusNotificationJob(data);

      case 'send-partner-confirmation':
        return sendPartnerConfirmationJob(data);

      case 'send-appointment-confirmation':
        return sendAppointmentConfirmationJob(data);

      case 'send-appointment-reminder':
        return sendAppointmentReminderJob(data);

      case 'send-appointment-cancellation':
        return sendAppointmentCancellationJob(data);

      case 'send-appointment-rescheduled':
        return sendAppointmentRescheduledJob(data);

      case 'send-qop-appointment-reminder':
        return sendQopAppointmentReminderJob(data);

      case 'send-meeting-notification':
        return sendMeetingNotificationJob(data);

      default:
        logger.warn('Unknown auth email job type', {
          module: 'jobs',
          action: 'auth-email',
          jobType,
        });
        return { skipped: true, reason: 'unknown_job_type' };
    }

    logger.info('Auth email sent', {
      module: 'jobs',
      action: 'auth-email',
      jobType,
      email: data.email,
    });

    return { sent: true, jobType, email: data.email };
  }
}

export default AuthEmailWorker;
