import { jest, describe, expect, test } from '@jest/globals';

async function loadDocumentOutputService() {
  jest.resetModules();

  const accountingDocumentRepository = {
    create: jest.fn(async (data) => ({ _id: 'doc-1', ...data })),
  };
  const fileService = {
    upload: jest.fn(async () => ({ key: 'accounting/output.pdf', checksumSha256: 'hash-1' })),
  };
  const auditService = { logEvent: jest.fn() };
  const sendMail = jest.fn(async () => ({ messageId: 'email-1' }));

  jest.unstable_mockModule('../../src/modules/accounting/accountingDocument.repository.js', () => ({
    default: accountingDocumentRepository,
  }));
  jest.unstable_mockModule('../../src/modules/files/file.service.js', () => ({
    default: fileService,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/mail/mail.js', () => ({
    default: sendMail,
  }));
  jest.unstable_mockModule('../../src/config/index.js', () => ({
    default: {
      company: {
        name: 'MB Boiler',
        street: 'Mainstrasse',
        buildingNumber: '1',
        zip: '8000',
        city: 'Zurich',
        email: 'finance@example.test',
        phone: '+410000000',
      },
    },
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/accounting/accountingDocumentOutput.service.js')).default;
  return { service, accountingDocumentRepository, fileService, auditService, sendMail };
}

describe('accounting document output service', () => {
  test('generates, archives, and emails open-item statement PDFs', async () => {
    const { service, accountingDocumentRepository, fileService, sendMail } = await loadDocumentOutputService();
    const result = await service.createStatementOutput(
      {
        entityId: '64f000000000000000000001',
        entityType: 'customer',
        entityName: 'Customer AG',
        currency: 'CHF',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        totalDebit: 100,
        totalCredit: 25,
        closingBalance: 75,
        generatedAt: new Date('2026-02-01T00:00:00.000Z'),
        items: [{
          recordId: '64f000000000000000000101',
          type: 'INVOICE',
          date: '2026-01-10',
          reference: 'RE-1',
          description: 'Invoice RE-1',
          debit: 100,
          credit: 0,
          balance: 100,
        }],
      },
      { sendEmail: true, recipientEmail: 'customer@example.test' },
      '64f000000000000000000999',
    );

    expect(result.emailQueued).toBe(true);
    expect(fileService.upload).toHaveBeenCalledWith(expect.objectContaining({
      mimeType: 'application/pdf',
      module: 'accounting',
      entityType: 'statement',
      entityId: '64f000000000000000000001',
      bucket: 'documents',
    }));
    expect(accountingDocumentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      documentType: 'OPEN_ITEM_STATEMENT',
      linkedRecords: [{ recordType: 'AR_INVOICE', recordId: '64f000000000000000000101' }],
      ocrStatus: 'NOT_APPLICABLE',
      processingStatus: 'PROCESSED',
    }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      email: 'customer@example.test',
      template: 'accountingStatement.ejs',
      attachments: [expect.objectContaining({ filename: result.fileName, content: expect.any(Buffer) })],
    }));
  });

  test('generates and archives dunning PDFs without requiring email', async () => {
    const { service, accountingDocumentRepository, sendMail } = await loadDocumentOutputService();
    const result = await service.createDunningOutput(
      {
        invoiceId: '64f000000000000000000201',
        invoiceNumber: 'RE-2',
        customerName: 'Customer AG',
        amountDue: 125,
        dueDate: '2026-01-15',
        currency: 'CHF',
        level: 2,
        subject: 'Mahnung RE-2',
        bodyHtml: '<p>Bitte bezahlen Sie {{invoiceNumber}}</p>',
        feeAmount: 10,
      },
      { sendEmail: false },
      '64f000000000000000000999',
    );

    expect(result.documentId).toBe('doc-1');
    expect(result.emailQueued).toBe(false);
    expect(accountingDocumentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      documentType: 'DUNNING_LETTER',
      linkedRecords: [{ recordType: 'AR_INVOICE', recordId: '64f000000000000000000201' }],
      fileName: 'Mahnung_RE-2_Stufe_2.pdf',
    }));
    expect(sendMail).not.toHaveBeenCalled();
  });
});
