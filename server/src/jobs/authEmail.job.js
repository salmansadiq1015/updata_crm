import { BaseWorker } from '../shared/queue/BaseWorker.js';
import {
  sendInvoiceSentEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendActivationEmail,
  sendPasswordChangedEmail,
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
