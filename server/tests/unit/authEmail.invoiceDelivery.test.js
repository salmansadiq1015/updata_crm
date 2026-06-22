import { jest, describe, expect, test } from '@jest/globals';

function queryResult(value) {
  return {
    select: jest.fn(() => ({
      lean: jest.fn(async () => value),
    })),
  };
}

async function loadWorker({
  invoice,
  contact = null,
  customer = null,
  document = null,
  pdfBuffer = Buffer.from('pdf'),
} = {}) {
  jest.resetModules();

  const sendInvoiceSentEmail = jest.fn(async () => ({ messageId: 'smtp-1' }));
  const Invoice = { findById: jest.fn(() => queryResult(invoice)) };
  const Contact = { findById: jest.fn(() => queryResult(contact)) };
  const Customer = { findById: jest.fn(() => queryResult(customer)) };
  const AccountingDocument = { findById: jest.fn(() => queryResult(document)) };
  const fileService = { downloadBuffer: jest.fn(async () => pdfBuffer) };

  jest.unstable_mockModule('../../src/shared/mail/mail.js', () => ({
    sendInvoiceSentEmail,
    sendPasswordResetEmail: jest.fn(),
    sendWelcomeEmail: jest.fn(),
    sendActivationEmail: jest.fn(),
    sendPasswordChangedEmail: jest.fn(),
    sendProjectStatusNotification: jest.fn(),
    sendPartnerConfirmationEmail: jest.fn(),
    sendAppointmentConfirmationEmail: jest.fn(),
    sendAppointmentReminderEmail: jest.fn(),
    sendAppointmentCancellationEmail: jest.fn(),
    sendAppointmentRescheduledEmail: jest.fn(),
    sendQuotationEmail: jest.fn(),
    sendQopAppointmentReminderEmail: jest.fn(),
    sendMeetingNotificationEmail: jest.fn(),
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.model.js', () => ({
    default: Invoice,
  }));
  jest.unstable_mockModule('../../src/modules/crm/contact.model.js', () => ({
    default: Contact,
  }));
  jest.unstable_mockModule('../../src/modules/crm/customer.model.js', () => ({
    default: Customer,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountingDocument.model.js', () => ({
    default: AccountingDocument,
  }));
  jest.unstable_mockModule('../../src/modules/files/file.service.js', () => ({
    default: fileService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const { AuthEmailWorker } = await import('../../src/jobs/authEmail.job.js');
  return {
    worker: new AuthEmailWorker(),
    sendInvoiceSentEmail,
    Invoice,
    Contact,
    Customer,
    AccountingDocument,
    fileService,
    pdfBuffer,
  };
}

describe('auth email invoice delivery worker', () => {
  test('sends invoice email to contact with archived PDF attachment', async () => {
    const invoice = {
      _id: 'invoice-1',
      invoiceNumber: 'RE-2026-00001',
      customerName: 'Customer AG',
      customerId: 'customer-1',
      contactId: 'contact-1',
      invoiceDate: new Date('2026-05-13T00:00:00.000Z'),
      dueDate: new Date('2026-06-12T00:00:00.000Z'),
      currency: 'CHF',
      amountDue: 108.1,
      paymentTermsText: '30 days net',
      pdfDocumentId: 'doc-1',
    };
    const { worker, sendInvoiceSentEmail, fileService, pdfBuffer } = await loadWorker({
      invoice,
      contact: { email: 'billing@example.test', firstName: 'Ada', lastName: 'Lovelace' },
      document: { fileName: 'invoice.pdf', filePath: 'qop/invoice/invoice.pdf', mimeType: 'application/pdf' },
    });

    const result = await worker.process({ name: 'send-invoice', data: { invoiceId: 'invoice-1' } });

    expect(fileService.downloadBuffer).toHaveBeenCalledWith('qop/invoice/invoice.pdf');
    expect(sendInvoiceSentEmail).toHaveBeenCalledWith(
      'billing@example.test',
      expect.objectContaining({
        invoiceNumber: 'RE-2026-00001',
        customerName: 'Ada Lovelace',
        amountDue: 108.1,
      }),
      {
        filename: 'invoice.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    );
    expect(result).toEqual({
      sent: true,
      jobType: 'send-invoice',
      email: 'billing@example.test',
      messageId: 'smtp-1',
    });
  });

  test('falls back to customer email when invoice contact has no email', async () => {
    const { worker, sendInvoiceSentEmail, Customer } = await loadWorker({
      invoice: {
        _id: 'invoice-1',
        invoiceNumber: 'RE-2026-00001',
        customerName: 'Customer AG',
        customerId: 'customer-1',
        contactId: 'contact-1',
        currency: 'CHF',
        amountDue: 108.1,
      },
      contact: { firstName: 'Ada', lastName: 'Lovelace', email: '' },
      customer: { email: 'accounts@example.test', name: 'Customer Accounting' },
    });

    await worker.process({ name: 'send-invoice', data: { invoiceId: 'invoice-1' } });

    expect(Customer.findById).toHaveBeenCalledWith('customer-1');
    expect(sendInvoiceSentEmail).toHaveBeenCalledWith(
      'accounts@example.test',
      expect.objectContaining({ customerName: 'Customer Accounting' }),
      null,
    );
  });

  test('fails invoice delivery when no recipient email can be resolved', async () => {
    const { worker, sendInvoiceSentEmail } = await loadWorker({
      invoice: {
        _id: 'invoice-1',
        invoiceNumber: 'RE-2026-00001',
        customerName: 'Customer AG',
        customerId: 'customer-1',
        contactId: null,
        currency: 'CHF',
        amountDue: 108.1,
      },
      customer: { name: 'Customer AG', email: null },
    });

    await expect(worker.process({ name: 'send-invoice', data: { invoiceId: 'invoice-1' } }))
      .rejects.toThrow('No invoice recipient email found');
    expect(sendInvoiceSentEmail).not.toHaveBeenCalled();
  });
});
