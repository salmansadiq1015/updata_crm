import { jest, describe, expect, test } from '@jest/globals';

async function loadService({
  invoices = [],
  invoice = null,
  reservationResult = { modifiedCount: 0 },
  batch = null,
  bankAccount = null,
  batchInvoices = [],
  accountsById = {},
} = {}) {
  jest.resetModules();

  const session = {
    withTransaction: jest.fn(async (callback) => callback()),
    endSession: jest.fn(),
  };
  const apInvoiceRepository = {
    findById: jest.fn(async () => invoice),
    findByIds: jest.fn(async () => invoices),
    findByPaymentBatchId: jest.fn(async () => batchInvoices),
    updateById: jest.fn(async (_id, data) => ({ _id, ...invoice, ...data })),
    reserveForPaymentBatch: jest.fn(async () => reservationResult),
  };
  const paymentBatchRepository = {
    create: jest.fn(async (data) => ({ _id: 'batch-1', ...data })),
    findById: jest.fn(async (id) => batch || ({ _id: id, batchNumber: 'PB-2026-00001' })),
    updateStatus: jest.fn(async (id, status, data) => ({ _id: id, status, ...data })),
  };
  const bankAccountRepository = {
    findById: jest.fn(async () => bankAccount),
  };
  const accountRepository = {
    findById: jest.fn(async (id) => accountsById[id] || {
      _id: id,
      accountNumber: String(id),
      isActive: true,
      isGroup: false,
    }),
  };
  const accountingCounterService = {
    getNextApInvoiceNumber: jest.fn(async () => 'APR-2026-00001'),
    getNextPaymentBatchNumber: jest.fn(async () => 'PB-2026-00001'),
  };
  const iso20022Parser = {
    generatePain001: jest.fn(() => '<Document><CdtTrfTxInf /></Document>'),
  };
  const cacheManager = {
    getOrSet: jest.fn(),
    del: jest.fn(),
    invalidatePattern: jest.fn(),
  };
  const eventBus = { publish: jest.fn() };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('mongoose', () => ({
    default: { startSession: jest.fn(async () => session) },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/apInvoice.repository.js', () => ({
    default: apInvoiceRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/paymentBatch.repository.js', () => ({
    default: paymentBatchRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/bankAccount.repository.js', () => ({
    default: bankAccountRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/account.repository.js', () => ({
    default: accountRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/iso20022.parser.js', () => iso20022Parser);
  jest.unstable_mockModule('../../src/modules/accounting/accounting.counter.service.js', () => ({
    default: accountingCounterService,
  }));
  jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
    default: cacheManager,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: {
      ACCOUNTING_AP_INVOICE_RECORDED: 'accounting.ap.invoice.recorded',
      ACCOUNTING_AP_INVOICE_APPROVED: 'accounting.ap.invoice.approved',
      ACCOUNTING_AP_PAYMENT_BATCH_CREATED: 'accounting.ap.payment_batch.created',
    },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/config/index.js', () => ({
    default: {
      accounting: { approvalThreshold: 10000 },
      redis: { keyPrefix: 'test:' },
    },
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/accounting/apInvoice.service.js')).default;

  return {
    service,
    session,
    apInvoiceRepository,
    paymentBatchRepository,
    bankAccountRepository,
    accountRepository,
    iso20022Parser,
    accountingCounterService,
    eventBus,
    auditService,
  };
}

describe('AP payment batch integrity', () => {
  test('creates payment batch from outstanding amounts and reserves invoices transactionally', async () => {
    const invoices = [
      {
        _id: 'invoice-1',
        apInvoiceNumber: 'APR-1',
        status: 'APPROVED',
        totalAmount: 100,
        outstandingAmount: 60.25,
        paymentBatchId: null,
      },
      {
        _id: 'invoice-2',
        apInvoiceNumber: 'APR-2',
        status: 'APPROVED',
        totalAmount: 100,
        outstandingAmount: 40,
        paymentBatchId: null,
      },
    ];
    const { service, session, apInvoiceRepository, paymentBatchRepository, accountingCounterService } = await loadService({
      invoices,
      reservationResult: { modifiedCount: 2 },
    });

    await service.createPaymentBatch(['invoice-1', 'invoice-2'], 'bank-1', 'user-1');

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(accountingCounterService.getNextPaymentBatchNumber).toHaveBeenCalledWith({ session });
    expect(paymentBatchRepository.create).toHaveBeenCalledWith(
      {
        batchNumber: 'PB-2026-00001',
        totalAmount: 100.25,
        invoiceCount: 2,
        invoiceIds: ['invoice-1', 'invoice-2'],
        bankAccountId: 'bank-1',
        createdBy: 'user-1',
      },
      { session },
    );
    expect(apInvoiceRepository.reserveForPaymentBatch).toHaveBeenCalledWith(
      ['invoice-1', 'invoice-2'],
      'batch-1',
      { session },
    );
  });

  test('rejects invoices already assigned to another payment batch before creating a batch', async () => {
    const { service, apInvoiceRepository, paymentBatchRepository } = await loadService({
      invoices: [{
        _id: 'invoice-1',
        apInvoiceNumber: 'APR-1',
        status: 'APPROVED',
        outstandingAmount: 50,
        paymentBatchId: 'batch-existing',
      }],
      reservationResult: { modifiedCount: 0 },
    });

    await expect(service.createPaymentBatch(['invoice-1'], 'bank-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(paymentBatchRepository.create).not.toHaveBeenCalled();
    expect(apInvoiceRepository.reserveForPaymentBatch).not.toHaveBeenCalled();
  });

  test('rejects duplicate invoice ids in a payment batch request', async () => {
    const { service, apInvoiceRepository, paymentBatchRepository } = await loadService();

    await expect(service.createPaymentBatch(['invoice-1', 'invoice-1'], 'bank-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(apInvoiceRepository.findByIds).not.toHaveBeenCalled();
    expect(paymentBatchRepository.create).not.toHaveBeenCalled();
  });

  test('exports payment batch as creditor-level pain.001 and marks batch exported', async () => {
    const batch = {
      _id: 'batch-1',
      batchNumber: 'PB-2026-00001',
      status: 'CREATED',
      bankAccountId: 'bank-1',
      totalAmount: 100.25,
      invoiceCount: 2,
    };
    const bankAccount = {
      _id: 'bank-1',
      name: 'MB Boiler AG',
      iban: 'CH9300762011623852957',
      bic: 'POFICHBEXXX',
      currency: 'CHF',
    };
    const batchInvoices = [
      {
        _id: 'invoice-1',
        apInvoiceNumber: 'APR-1',
        supplierInvoiceNumber: 'SUP-1',
        supplierName: 'Supplier One AG',
        supplierIban: 'ch5604835012345678009',
        supplierBic: 'RAIFCH22XXX',
        status: 'APPROVED',
        outstandingAmount: 60.25,
        currency: 'CHF',
      },
      {
        _id: 'invoice-2',
        apInvoiceNumber: 'APR-2',
        supplierInvoiceNumber: 'SUP-2',
        supplierName: 'Supplier Two AG',
        supplierIban: 'CH9300762011623852957',
        status: 'APPROVED',
        outstandingAmount: 40,
        currency: 'CHF',
      },
    ];
    const {
      service,
      apInvoiceRepository,
      paymentBatchRepository,
      bankAccountRepository,
      iso20022Parser,
      auditService,
    } = await loadService({ batch, bankAccount, batchInvoices });

    const exported = await service.exportPaymentBatchPain001('batch-1', 'user-1');

    expect(bankAccountRepository.findById).toHaveBeenCalledWith('bank-1');
    expect(apInvoiceRepository.findByPaymentBatchId).toHaveBeenCalledWith('batch-1');
    expect(iso20022Parser.generatePain001).toHaveBeenCalledWith(
      batch,
      bankAccount,
      [
        expect.objectContaining({
          instructionId: 'APR-1',
          endToEndId: 'SUP-1',
          amount: 60.25,
          creditorName: 'Supplier One AG',
          creditorIban: 'CH5604835012345678009',
          remittanceText: 'APR-1 / SUP-1',
        }),
        expect.objectContaining({
          instructionId: 'APR-2',
          amount: 40,
          creditorName: 'Supplier Two AG',
          creditorIban: 'CH9300762011623852957',
        }),
      ],
    );
    expect(paymentBatchRepository.updateStatus).toHaveBeenCalledWith(
      'batch-1',
      'EXPORTED',
      expect.objectContaining({ exportedBy: 'user-1' }),
    );
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.payment_batch.pain001_exported',
      result: 'success',
    }));
    expect(exported).toMatchObject({
      fileName: 'PB-2026-00001.pain001.xml',
      contentType: 'application/xml',
      xml: '<Document><CdtTrfTxInf /></Document>',
    });
  });

  test('rejects payment batch export when an invoice is missing supplier IBAN', async () => {
    const { service, paymentBatchRepository, iso20022Parser } = await loadService({
      batch: {
        _id: 'batch-1',
        batchNumber: 'PB-2026-00001',
        status: 'CREATED',
        bankAccountId: 'bank-1',
        totalAmount: 50,
        invoiceCount: 1,
      },
      bankAccount: { _id: 'bank-1', name: 'MB Boiler AG', iban: 'CH9300762011623852957', currency: 'CHF' },
      batchInvoices: [{
        _id: 'invoice-1',
        apInvoiceNumber: 'APR-1',
        supplierName: 'Supplier One AG',
        status: 'APPROVED',
        outstandingAmount: 50,
        currency: 'CHF',
      }],
    });

    await expect(service.exportPaymentBatchPain001('batch-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(iso20022Parser.generatePain001).not.toHaveBeenCalled();
    expect(paymentBatchRepository.updateStatus).not.toHaveBeenCalled();
  });

  test('rejects second approval by the first approver', async () => {
    const { service, apInvoiceRepository } = await loadService({
      invoice: {
        _id: 'invoice-1',
        status: 'RECORDED',
        approvedBy: { _id: 'user-1' },
        totalAmount: 15000,
      },
    });

    await expect(service.secondApprove('invoice-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(apInvoiceRepository.updateById).not.toHaveBeenCalled();
  });

  test('approves supplier invoice with split line allocations across posting accounts', async () => {
    const { service, apInvoiceRepository, accountRepository } = await loadService({
      invoice: {
        _id: 'invoice-1',
        status: 'RECORDED',
        totalAmount: 100,
        lineItems: [{
          description: 'Project material',
          quantity: 1,
          unitPrice: 100,
          lineTotal: 100,
          allocations: [
            { accountId: 'account-1', amount: 60, costCenter: 'INSTALL' },
            { accountId: 'account-2', amount: 40, costCenter: 'SERVICE' },
          ],
        }],
      },
    });

    await service.approve('invoice-1', 'user-1');

    expect(accountRepository.findById).toHaveBeenCalledWith('account-1');
    expect(accountRepository.findById).toHaveBeenCalledWith('account-2');
    expect(apInvoiceRepository.updateById).toHaveBeenCalledWith(
      'invoice-1',
      expect.objectContaining({ status: 'APPROVED', approvedBy: 'user-1' }),
    );
  });

  test('rejects supplier invoice approval when split allocations do not balance to line total', async () => {
    const { service, apInvoiceRepository } = await loadService({
      invoice: {
        _id: 'invoice-1',
        status: 'RECORDED',
        totalAmount: 100,
        lineItems: [{
          description: 'Project material',
          quantity: 1,
          unitPrice: 100,
          lineTotal: 100,
          allocations: [
            { accountId: 'account-1', amount: 70 },
            { accountId: 'account-2', amount: 20 },
          ],
        }],
      },
    });

    await expect(service.approve('invoice-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 400 });

    expect(apInvoiceRepository.updateById).not.toHaveBeenCalled();
  });

  test('rejects supplier invoice approval when allocation account is not a posting account', async () => {
    const { service, apInvoiceRepository } = await loadService({
      accountsById: {
        'account-1': {
          _id: 'account-1',
          accountNumber: '4000',
          isActive: true,
          isGroup: true,
        },
      },
      invoice: {
        _id: 'invoice-1',
        status: 'RECORDED',
        totalAmount: 100,
        lineItems: [{
          description: 'Project material',
          quantity: 1,
          unitPrice: 100,
          lineTotal: 100,
          allocations: [{ accountId: 'account-1', amount: 100 }],
        }],
      },
    });

    await expect(service.approve('invoice-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(apInvoiceRepository.updateById).not.toHaveBeenCalled();
  });
});
