import { jest, describe, expect, test } from '@jest/globals';

async function loadInvoiceService({
  repositoryInvoice,
  modelInvoice,
  originalInvoice,
  invoiceUpdate = { matchedCount: 1 },
} = {}) {
  jest.resetModules();

  const invoiceRepository = {
    create: jest.fn(async (data) => ({ _id: 'invoice-new', ...data })),
    findById: jest.fn(async () => repositoryInvoice || { _id: 'invoice-new' }),
    updateById: jest.fn(async (id, data) => ({ _id: id, ...data })),
  };
  const invoicePdfService = {
    generateAndStore: jest.fn(async () => ({
      invoice: { _id: 'invoice-1', pdfDocumentId: 'doc-1' },
      document: { _id: 'doc-1' },
    })),
  };
  const counterService = {
    getNextInvoiceNumber: jest.fn(async () => 'RE-2026-00099'),
  };
  const cacheManager = {
    del: jest.fn(async () => undefined),
    invalidatePattern: jest.fn(async () => undefined),
    getOrSet: jest.fn(async (_key, fn) => fn()),
  };
  const eventBus = { publish: jest.fn() };
  const auditService = { logEvent: jest.fn() };
  const queueManager = { addJob: jest.fn(async () => undefined) };
  const documentStatusLogService = {
    logTransition: jest.fn(async () => undefined),
  };
  const invoiceDoc = modelInvoice || {
    _id: 'invoice-1',
    invoiceNumber: 'RE-2026-00001',
    status: 'DRAFT',
    customerId: 'customer-1',
    save: jest.fn(async () => undefined),
  };
  const Invoice = {
    findById: jest.fn(async () => invoiceDoc),
    findOne: jest.fn(() => ({
      lean: jest.fn(async () => originalInvoice),
    })),
    updateOne: jest.fn(async () => invoiceUpdate),
  };

  jest.unstable_mockModule('../../src/modules/qop/invoice.repository.js', () => ({
    default: invoiceRepository,
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoicePdf.service.js', () => ({
    default: invoicePdfService,
  }));
  jest.unstable_mockModule('../../src/modules/qop/counter.service.js', () => ({
    default: counterService,
  }));
  jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
    default: cacheManager,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: {
      INVOICE_CREATED: 'invoice.created',
      INVOICE_FINALIZED: 'invoice.finalized',
      INVOICE_SENT: 'invoice.sent',
      INVOICE_PAYMENT_RECORDED: 'invoice.payment_recorded',
      INVOICE_PAID: 'invoice.paid',
    },
  }));
  jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
    default: queueManager,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/config/index.js', () => ({
    default: { redis: { keyPrefix: 'test:' } },
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.model.js', () => ({
    default: Invoice,
  }));
  jest.unstable_mockModule('../../src/modules/qop/documentStatusLog.service.js', () => ({
    default: documentStatusLogService,
  }));

  const service = (await import('../../src/modules/qop/invoice.service.js')).default;
  return {
    service,
    invoiceRepository,
    invoicePdfService,
    counterService,
    queueManager,
    documentStatusLogService,
    Invoice,
    invoiceDoc,
  };
}

describe('QOP invoice lifecycle hardening', () => {
  test('rejects edits to finalized draft invoices with generated PDF markers', async () => {
    const { service, invoiceRepository } = await loadInvoiceService({
      repositoryInvoice: {
        _id: 'invoice-1',
        status: 'DRAFT',
        pdfDocumentId: 'doc-1',
        version: 1,
      },
    });

    await expect(service.update('invoice-1', { title: 'Changed', version: 1 }, 'user-1'))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(invoiceRepository.updateById).not.toHaveBeenCalled();
  });

  test('sends draft invoices by generating PDF before status transition and email queueing', async () => {
    const invoiceDoc = {
      _id: 'invoice-1',
      invoiceNumber: 'RE-2026-00001',
      status: 'DRAFT',
      customerId: 'customer-1',
      pdfDocumentId: null,
      save: jest.fn(async () => undefined),
    };
    const { service, invoicePdfService, queueManager, documentStatusLogService } = await loadInvoiceService({
      modelInvoice: invoiceDoc,
      repositoryInvoice: { _id: 'invoice-1', status: 'SENT' },
    });

    await service.send('invoice-1', 'user-1');

    expect(invoicePdfService.generateAndStore).toHaveBeenCalledWith('invoice-1', 'user-1', {});
    expect(invoiceDoc.status).toBe('SENT');
    expect(invoiceDoc.sentAt).toBeInstanceOf(Date);
    expect(invoiceDoc.save).toHaveBeenCalledTimes(1);
    expect(queueManager.addJob).toHaveBeenCalledWith('auth-email', 'send-invoice', {
      invoiceId: 'invoice-1',
      invoiceNumber: 'RE-2026-00001',
      customerId: 'customer-1',
    });
    expect(documentStatusLogService.logTransition).toHaveBeenCalledWith('invoice', 'invoice-1', 'DRAFT', 'SENT', 'user-1');
  });

  test('rejects direct cancellation of sent invoices through status transition', async () => {
    const { service } = await loadInvoiceService({
      modelInvoice: {
        _id: 'invoice-1',
        invoiceNumber: 'RE-2026-00001',
        status: 'SENT',
        save: jest.fn(async () => undefined),
      },
    });

    await expect(service.transitionStatus('invoice-1', 'CANCELLED', { reason: 'wrong' }, 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('creates credit note with negative totals and cancels original invoice', async () => {
    const originalInvoice = {
      _id: 'invoice-original',
      invoiceNumber: 'RE-2026-00001',
      invoiceType: 'STANDARD',
      status: 'SENT',
      sourceOrderId: 'order-1',
      sourceQuotationId: null,
      customerId: 'customer-1',
      customerName: 'Customer AG',
      contactId: null,
      projectId: null,
      departmentId: 'department-1',
      language: 'de',
      currency: 'CHF',
      subtotal: 100,
      vatBreakdown: [{ rate: 8.1, base: 100, amount: 8.1 }],
      grandTotalRounded: 108.1,
      amountDue: 108.1,
      lineItems: [{
        position: 1,
        description: 'Service',
        quantity: 1,
        unitPrice: 100,
        vatRate: 8.1,
        lineTotal: 100,
      }],
    };
    const { service, invoiceRepository, Invoice } = await loadInvoiceService({
      originalInvoice,
      repositoryInvoice: { _id: 'credit-note-1', invoiceType: 'CREDIT_NOTE' },
    });

    await service.createCreditNote('invoice-original', { reason: 'Cancellation' }, 'user-1');

    expect(invoiceRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      invoiceNumber: 'RE-2026-00099',
      invoiceType: 'CREDIT_NOTE',
      creditNoteForInvoiceId: 'invoice-original',
      subtotal: -100,
      grandTotal: -108.1,
      grandTotalRounded: -108.1,
      amountDue: -108.1,
      lineItems: [expect.objectContaining({ lineTotal: -100 })],
    }));
    expect(Invoice.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'invoice-original', status: { $ne: 'CANCELLED' } }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'CANCELLED',
          cancellationReason: 'Cancellation',
          updatedBy: 'user-1',
        }),
        $inc: { version: 1 },
      }),
    );
  });
});
