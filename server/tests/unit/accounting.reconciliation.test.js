import { jest, describe, expect, test } from '@jest/globals';

async function loadReconciliationService({
  transaction,
  unmatched = [],
  invoice,
  apInvoice,
  transactionUpdate = { matchedCount: 1 },
  invoiceUpdate = { matchedCount: 1 },
  apInvoiceUpdate = { matchedCount: 1 },
  learnedCandidate = null,
  openInvoices = [],
} = {}) {
  jest.resetModules();

  const session = {
    withTransaction: jest.fn(async (callback) => callback()),
    endSession: jest.fn(),
  };
  const bankTransactionRepository = {
    findById: jest.fn(async () => transaction),
    findUnmatched: jest.fn(async () => unmatched),
    markReconciledIfUnmatched: jest.fn(async () => transactionUpdate),
  };
  const arPaymentRepository = {
    create: jest.fn(async (data) => ({ _id: 'payment-1', ...data })),
  };
  const arPaymentAllocationRepository = {
    create: jest.fn(async (data) => ({ _id: 'allocation-1', ...data })),
  };
  const apInvoiceRepository = {
    findById: jest.fn(async () => apInvoice),
    findOpenForAutoMatch: jest.fn(async () => apInvoice),
    findSingleOpenBySupplierAndAmount: jest.fn(async () => apInvoice),
    applyPaymentDelta: jest.fn(async () => apInvoiceUpdate),
  };
  const reconciliationLearningRepository = {
    findCandidate: jest.fn(async () => learnedCandidate),
    recordManualMatch: jest.fn(async (data) => ({ _id: 'learning-1', ...data })),
  };
  let lastFindOneQuery = {};
  const findQuery = {
    sort: jest.fn(() => findQuery),
    limit: jest.fn(() => findQuery),
    populate: jest.fn(() => findQuery),
    lean: jest.fn(async () => openInvoices),
  };
  const findOneQuery = {
    session: jest.fn(() => findOneQuery),
    lean: jest.fn(async () => {
      if (lastFindOneQuery?._id) {
        const byId = openInvoices.find((candidate) => String(candidate._id) === String(lastFindOneQuery._id));
        if (byId) return byId;
      }
      const amountDueFilter = lastFindOneQuery?.amountDue;
      if (invoice && amountDueFilter?.$gte !== undefined && invoice.amountDue < amountDueFilter.$gte) {
        return null;
      }
      if (invoice && amountDueFilter?.$gt !== undefined && invoice.amountDue <= amountDueFilter.$gt) {
        return null;
      }
      return invoice;
    }),
  };
  const Invoice = {
    findOne: jest.fn((query) => {
      lastFindOneQuery = query;
      return findOneQuery;
    }),
    find: jest.fn(() => findQuery),
    updateOne: jest.fn(async () => invoiceUpdate),
  };
  const journalEntryService = {
    createFromEvent: jest.fn(async () => ({ _id: 'journal-1' })),
  };
  const accountMappingService = {
    resolveGlobal: jest.fn(async (mappingType) => ({
      BANK_CLEARING: 'bank-clearing-account',
      AR_RECEIVABLE: 'ar-receivable-account',
      AP_PAYABLE: 'ap-payable-account',
    }[mappingType] || `${mappingType.toLowerCase()}-account`)),
  };
  const eventBus = { publish: jest.fn() };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('mongoose', () => ({
    default: { startSession: jest.fn(async () => session) },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/bankTransaction.repository.js', () => ({
    default: bankTransactionRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/arPayment.repository.js', () => ({
    arPaymentRepository,
    arPaymentAllocationRepository,
    default: arPaymentRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/apInvoice.repository.js', () => ({
    default: apInvoiceRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/reconciliationLearning.repository.js', () => ({
    default: reconciliationLearningRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.service.js', () => ({
    default: journalEntryService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountMapping.service.js', () => ({
    ACCOUNT_MAPPING: {
      AR_RECEIVABLE: 'AR_RECEIVABLE',
      BANK_CLEARING: 'BANK_CLEARING',
      AP_PAYABLE: 'AP_PAYABLE',
    },
    default: accountMappingService,
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.model.js', () => ({
    default: Invoice,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: { ACCOUNTING_RECONCILIATION_COMPLETED: 'accounting.reconciliation.completed' },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/accounting/reconciliation.service.js')).default;

  return {
    service,
    session,
    bankTransactionRepository,
    arPaymentRepository,
    arPaymentAllocationRepository,
    apInvoiceRepository,
    reconciliationLearningRepository,
    Invoice,
    journalEntryService,
    accountMappingService,
  };
}

describe('manual reconciliation integrity', () => {
  test('posts payment, allocation, invoice update, bank match, and journal in one transaction', async () => {
    const { service, session, bankTransactionRepository, arPaymentRepository, arPaymentAllocationRepository, reconciliationLearningRepository, Invoice, journalEntryService } =
      await loadReconciliationService({
        transaction: {
          _id: 'txn-1',
          reconciliationStatus: 'UNMATCHED',
          transactionDate: new Date('2026-05-12T00:00:00.000Z'),
          valueDate: new Date('2026-05-12T00:00:00.000Z'),
          amount: 75,
          reference: 'RE-2026-1',
          payerPayeeName: 'Custom Bank Text AG',
          payerPayeeIban: 'CH5604835012345678009',
          currency: 'CHF',
          bankAccountId: 'bank-1',
        },
        invoice: {
          _id: 'invoice-1',
          customerId: 'customer-1',
          amountPaid: 25,
          amountDue: 75,
          status: 'SENT',
        },
      });

    await service.manualMatch('txn-1', 'invoice-1', 'user-1');

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(bankTransactionRepository.findById).toHaveBeenCalledWith('txn-1', { session });
    expect(arPaymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 75,
        customerId: 'customer-1',
        bankTransactionId: 'txn-1',
        unallocatedAmount: 0,
        allocatedAmount: 75,
      }),
      { session },
    );
    expect(arPaymentAllocationRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'payment-1',
        invoiceId: 'invoice-1',
        amount: 75,
      }),
      { session },
    );
    expect(Invoice.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'invoice-1',
        amountDue: { $gte: 75 },
      }),
      {
        $set: {
          amountPaid: 100,
          amountDue: 0,
          status: 'PAID',
          paidAt: expect.any(Date),
        },
      },
      { session },
    );
    expect(bankTransactionRepository.markReconciledIfUnmatched).toHaveBeenCalledWith(
      'txn-1',
      'MANUALLY_MATCHED',
      { matchedInvoiceId: 'invoice-1' },
      { session },
    );
    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'MANUAL_RECONCILIATION',
      'txn-1',
      'bank-clearing-account',
      'ar-receivable-account',
      75,
      'Manual reconciliation: RE-2026-1',
      'user-1',
      { session },
    );
    expect(reconciliationLearningRepository.recordManualMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'INCOMING',
        targetType: 'AR_INVOICE',
        entityId: 'customer-1',
        partyName: 'Custom Bank Text AG',
        partyIban: 'CH5604835012345678009',
        currency: 'CHF',
        transactionId: 'txn-1',
        invoiceId: 'invoice-1',
        userId: 'user-1',
      }),
    );
  });

  test('rejects outgoing transactions before creating accounting records', async () => {
    const { service, arPaymentRepository, arPaymentAllocationRepository, Invoice, journalEntryService } =
      await loadReconciliationService({
        transaction: {
          _id: 'txn-1',
          reconciliationStatus: 'UNMATCHED',
          amount: -10,
        },
      });

    await expect(service.manualMatch('txn-1', 'invoice-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 400 });

    expect(arPaymentRepository.create).not.toHaveBeenCalled();
    expect(arPaymentAllocationRepository.create).not.toHaveBeenCalled();
    expect(Invoice.updateOne).not.toHaveBeenCalled();
    expect(journalEntryService.createFromEvent).not.toHaveBeenCalled();
  });

  test('rejects racing transaction matches before reporting success', async () => {
    const { service } = await loadReconciliationService({
      transaction: {
        _id: 'txn-1',
        reconciliationStatus: 'UNMATCHED',
        transactionDate: new Date('2026-05-12T00:00:00.000Z'),
        valueDate: new Date('2026-05-12T00:00:00.000Z'),
        amount: 50,
        reference: 'RE-2026-1',
        bankAccountId: 'bank-1',
      },
      invoice: {
        _id: 'invoice-1',
        customerId: 'customer-1',
        amountPaid: 0,
        amountDue: 50,
        status: 'SENT',
      },
      transactionUpdate: { matchedCount: 0 },
    });

    await expect(service.manualMatch('txn-1', 'invoice-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('posts outgoing AP match with mapped payable and bank accounts', async () => {
    const { service, session, bankTransactionRepository, apInvoiceRepository, reconciliationLearningRepository, journalEntryService } =
      await loadReconciliationService({
        transaction: {
          _id: 'txn-ap-1',
          reconciliationStatus: 'UNMATCHED',
          transactionDate: new Date('2026-05-12T00:00:00.000Z'),
          valueDate: new Date('2026-05-12T00:00:00.000Z'),
          amount: -80,
          reference: 'SUP-1',
          payerPayeeName: 'Supplier Alias AG',
          payerPayeeIban: 'CH9300762011623852957',
          currency: 'CHF',
          bankAccountId: 'bank-1',
        },
        apInvoice: {
          _id: 'ap-1',
          apInvoiceNumber: 'APR-1',
          supplierId: 'supplier-1',
          paidAmount: 10,
          outstandingAmount: 80,
          status: 'APPROVED',
        },
      });

    await service.manualMatchAp('txn-ap-1', 'ap-1', 'user-1');

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(bankTransactionRepository.findById).toHaveBeenCalledWith('txn-ap-1', { session });
    expect(apInvoiceRepository.findById).toHaveBeenCalledWith('ap-1', { session });
    expect(apInvoiceRepository.applyPaymentDelta).toHaveBeenCalledWith('ap-1', 80, { session });
    expect(bankTransactionRepository.markReconciledIfUnmatched).toHaveBeenCalledWith(
      'txn-ap-1',
      'MANUALLY_MATCHED',
      { matchedInvoiceId: 'ap-1' },
      { session },
    );
    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'AP_PAYMENT',
      'txn-ap-1',
      'ap-payable-account',
      'bank-clearing-account',
      80,
      'Manual AP reconciliation: SUP-1',
      'user-1',
      { session },
    );
    expect(reconciliationLearningRepository.recordManualMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'OUTGOING',
        targetType: 'AP_INVOICE',
        entityId: 'supplier-1',
        partyName: 'Supplier Alias AG',
        partyIban: 'CH9300762011623852957',
        currency: 'CHF',
        transactionId: 'txn-ap-1',
        invoiceId: 'ap-1',
        userId: 'user-1',
      }),
    );
  });
});

describe('auto reconciliation integrity', () => {
  test('uses the transactional AR posting path for exact invoice reference matches', async () => {
    const transaction = {
      _id: 'txn-1',
      reconciliationStatus: 'UNMATCHED',
      transactionDate: new Date('2026-05-12T00:00:00.000Z'),
      valueDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: 75,
      reference: 'RE-2026-1',
      bankAccountId: 'bank-1',
    };
    const { service, bankTransactionRepository, arPaymentRepository, journalEntryService } =
      await loadReconciliationService({
        transaction,
        unmatched: [transaction],
        invoice: {
          _id: 'invoice-1',
          customerId: 'customer-1',
          amountPaid: 25,
          amountDue: 75,
          status: 'SENT',
        },
      });

    const result = await service.runAutoReconciliation('bank-1');

    expect(result).toEqual({ matchedCount: 1, unmatchedCount: 0 });
    expect(bankTransactionRepository.findUnmatched).toHaveBeenCalledWith('bank-1');
    expect(arPaymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 75,
        customerId: 'customer-1',
        bankTransactionId: 'txn-1',
        createdBy: null,
      }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(bankTransactionRepository.markReconciledIfUnmatched).toHaveBeenCalledWith(
      'txn-1',
      'AUTO_MATCHED',
      { matchedInvoiceId: 'invoice-1' },
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'AUTO_RECONCILIATION',
      'txn-1',
      'bank-clearing-account',
      'ar-receivable-account',
      75,
      'Auto-reconciled: RE-2026-1',
      null,
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });

  test('leaves failed auto matches unmatched when transactional posting rejects them', async () => {
    const transaction = {
      _id: 'txn-1',
      reconciliationStatus: 'UNMATCHED',
      transactionDate: new Date('2026-05-12T00:00:00.000Z'),
      valueDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: 100,
      reference: 'RE-2026-1',
      bankAccountId: 'bank-1',
    };
    const { service, bankTransactionRepository } = await loadReconciliationService({
      transaction,
      unmatched: [transaction],
      invoice: {
        _id: 'invoice-1',
        customerId: 'customer-1',
        amountPaid: 0,
        amountDue: 50,
        status: 'SENT',
      },
    });

    const result = await service.runAutoReconciliation('bank-1');

    expect(result).toEqual({ matchedCount: 0, unmatchedCount: 1 });
    expect(bankTransactionRepository.markReconciledIfUnmatched).not.toHaveBeenCalled();
  });

  test('auto matches outgoing AP transactions through transactional AP posting path', async () => {
    const transaction = {
      _id: 'txn-ap-1',
      reconciliationStatus: 'UNMATCHED',
      transactionDate: new Date('2026-05-12T00:00:00.000Z'),
      valueDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: -120,
      reference: 'SUP-2026-1',
      payerPayeeName: 'Supplier AG',
      bankAccountId: 'bank-1',
    };
    const { service, bankTransactionRepository, apInvoiceRepository, journalEntryService } =
      await loadReconciliationService({
        transaction,
        unmatched: [transaction],
        apInvoice: {
          _id: 'ap-1',
          apInvoiceNumber: 'APR-1',
          supplierId: 'supplier-1',
          supplierName: 'Supplier AG',
          paidAmount: 0,
          outstandingAmount: 120,
          status: 'APPROVED',
        },
      });

    const result = await service.runAutoReconciliation('bank-1');

    expect(result).toEqual({ matchedCount: 1, unmatchedCount: 0 });
    expect(apInvoiceRepository.findOpenForAutoMatch).toHaveBeenCalledWith({
      reference: 'SUP-2026-1',
      amount: 120,
      payeeName: 'Supplier AG',
    });
    expect(apInvoiceRepository.applyPaymentDelta).toHaveBeenCalledWith(
      'ap-1',
      120,
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(bankTransactionRepository.markReconciledIfUnmatched).toHaveBeenCalledWith(
      'txn-ap-1',
      'AUTO_MATCHED',
      { matchedInvoiceId: 'ap-1' },
      expect.objectContaining({ session: expect.any(Object) }),
    );
    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'AP_PAYMENT',
      'txn-ap-1',
      'ap-payable-account',
      'bank-clearing-account',
      120,
      'Auto AP reconciliation: SUP-2026-1',
      null,
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });

  test('uses learned AR manual-match patterns only when they resolve to one open invoice', async () => {
    const transaction = {
      _id: 'txn-learnt-ar-1',
      reconciliationStatus: 'UNMATCHED',
      transactionDate: new Date('2026-05-12T00:00:00.000Z'),
      valueDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: 88,
      reference: 'BANK-TEXT-42',
      payerPayeeName: 'Alias Customer Payments',
      payerPayeeIban: 'CH5604835012345678009',
      currency: 'CHF',
      bankAccountId: 'bank-1',
    };
    const learnedInvoice = {
      _id: 'invoice-learned-1',
      customerId: 'customer-1',
      amountPaid: 0,
      amountDue: 88,
      status: 'SENT',
    };
    const { service, Invoice, reconciliationLearningRepository, arPaymentRepository } =
      await loadReconciliationService({
        transaction,
        unmatched: [transaction],
        invoice: null,
        learnedCandidate: {
          _id: 'learning-1',
          entityId: 'customer-1',
        },
        openInvoices: [learnedInvoice],
      });

    const result = await service.runAutoReconciliation('bank-1');

    expect(result).toEqual({ matchedCount: 1, unmatchedCount: 0 });
    expect(reconciliationLearningRepository.findCandidate).toHaveBeenCalledWith({
      direction: 'INCOMING',
      targetType: 'AR_INVOICE',
      partyName: 'Alias Customer Payments',
      partyIban: 'CH5604835012345678009',
      currency: 'CHF',
    });
    expect(Invoice.find).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'customer-1',
      amountDue: 88,
    }));
    expect(arPaymentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-1', amount: 88 }),
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });

  test('uses learned AP manual-match patterns only when they resolve to one open payable', async () => {
    const transaction = {
      _id: 'txn-learnt-ap-1',
      reconciliationStatus: 'UNMATCHED',
      transactionDate: new Date('2026-05-12T00:00:00.000Z'),
      valueDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: -44,
      reference: 'BANK-TEXT-77',
      payerPayeeName: 'Supplier Alias',
      payerPayeeIban: 'CH9300762011623852957',
      currency: 'CHF',
      bankAccountId: 'bank-1',
    };
    const { service, apInvoiceRepository, reconciliationLearningRepository } =
      await loadReconciliationService({
        transaction,
        unmatched: [transaction],
        learnedCandidate: {
          _id: 'learning-ap-1',
          entityId: 'supplier-1',
        },
        apInvoice: {
          _id: 'ap-learned-1',
          apInvoiceNumber: 'APR-LEARNED-1',
          supplierId: 'supplier-1',
          outstandingAmount: 44,
          status: 'APPROVED',
        },
      });

    const result = await service.runAutoReconciliation('bank-1');

    expect(result).toEqual({ matchedCount: 1, unmatchedCount: 0 });
    expect(reconciliationLearningRepository.findCandidate).toHaveBeenCalledWith({
      direction: 'OUTGOING',
      targetType: 'AP_INVOICE',
      partyName: 'Supplier Alias',
      partyIban: 'CH9300762011623852957',
      currency: 'CHF',
    });
    expect(apInvoiceRepository.findSingleOpenBySupplierAndAmount).toHaveBeenCalledWith({
      supplierId: 'supplier-1',
      amount: 44,
      currency: 'CHF',
    });
    expect(apInvoiceRepository.findOpenForAutoMatch).not.toHaveBeenCalled();
    expect(apInvoiceRepository.applyPaymentDelta).toHaveBeenCalledWith(
      'ap-learned-1',
      44,
      expect.objectContaining({ session: expect.any(Object) }),
    );
  });
});
