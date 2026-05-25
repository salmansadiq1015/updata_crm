import { jest, describe, expect, test } from '@jest/globals';

async function loadService() {
  jest.resetModules();

  const invoice = {
    _id: 'invoice-1',
    invoiceNumber: 'RE-2026-00001',
    customerName: 'Customer AG',
    invoiceDate: new Date('2026-05-12T00:00:00.000Z'),
    dueDate: new Date('2026-06-11T00:00:00.000Z'),
    currency: 'CHF',
    lineItems: [{
      position: 1,
      description: 'Boiler service',
      quantity: 1,
      unit: 'pcs',
      unitPrice: 250,
      lineTotal: 250,
    }],
    subtotal: 250,
    vatBreakdown: [{ rate: 8.1, amount: 20.25 }],
    grandTotalRounded: 270.25,
    amountDue: 270.25,
  };

  const invoiceRepository = {
    findById: jest.fn(async () => invoice),
    updateById: jest.fn(async (_id, data) => ({ ...invoice, ...data })),
  };
  const accountingDocumentRepository = {
    create: jest.fn(async (data) => ({ _id: 'doc-1', ...data })),
  };
  const fileService = {
    upload: jest.fn(async () => ({
      _id: 'file-1',
      key: 'qop/invoice/invoice-1/Rechnung_RE-2026-00001.pdf',
      checksumSha256: 'abc123',
    })),
  };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/qop/invoice.repository.js', () => ({
    default: invoiceRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountingDocument.repository.js', () => ({
    default: accountingDocumentRepository,
  }));
  jest.unstable_mockModule('../../src/modules/files/file.service.js', () => ({
    default: fileService,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/config/index.js', () => ({
    default: {
      company: {
        name: 'MB Boiler & Heizung AG',
        street: 'Buchenstrasse',
        buildingNumber: '57B',
        zip: '4142',
        city: 'Muenchenstein',
        country: 'CH',
        phone: '+41 61 301 26 70',
        email: 'finance@example.test',
        qrIban: 'CH4431999123000889012',
      },
    },
  }));

  const module = await import('../../src/modules/qop/invoicePdf.service.js');
  return {
    invoice,
    invoicePdfService: module.default,
    buildQrReference: module.buildQrReference,
    fileService,
    accountingDocumentRepository,
    invoiceRepository,
    auditService,
  };
}

describe('invoice PDF generation', () => {
  test('builds a 27-digit Swiss QR reference from invoice number', async () => {
    const { buildQrReference } = await loadService();
    const reference = buildQrReference('RE-2026-00001');

    expect(reference).toMatch(/^\d{27}$/);
    expect(reference).toBe('000000000000000002026000014');
  });

  test('generates and stores invoice PDF as accounting archive document', async () => {
    const {
      invoicePdfService,
      fileService,
      accountingDocumentRepository,
      invoiceRepository,
      auditService,
    } = await loadService();

    const result = await invoicePdfService.generateAndStore('invoice-1', 'user-1');

    expect(fileService.upload).toHaveBeenCalledWith(expect.objectContaining({
      originalName: 'Rechnung_RE-2026-00001.pdf',
      mimeType: 'application/pdf',
      module: 'qop',
      entityType: 'invoice',
      entityId: 'invoice-1',
      uploadedBy: 'user-1',
      bucket: 'documents',
    }));
    expect(fileService.upload.mock.calls[0][0].buffer).toBeInstanceOf(Buffer);
    expect(fileService.upload.mock.calls[0][0].buffer.length).toBeGreaterThan(1000);
    expect(accountingDocumentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'qop/invoice/invoice-1/Rechnung_RE-2026-00001.pdf',
      fileName: 'Rechnung_RE-2026-00001.pdf',
      mimeType: 'application/pdf',
      documentType: 'AR_INVOICE_PDF',
      ocrStatus: 'NOT_APPLICABLE',
      createdBy: 'user-1',
    }));
    expect(invoiceRepository.updateById).toHaveBeenCalledWith('invoice-1', expect.objectContaining({
      pdfDocumentId: 'doc-1',
      qrBillReference: expect.stringMatching(/^\d{27}$/),
      updatedBy: 'user-1',
    }));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'invoice.pdf_generated',
      result: 'success',
    }));
    expect(result.document._id).toBe('doc-1');
  });
});
