import { jest, describe, expect, test } from '@jest/globals';
import ERROR_CODES from '../../src/shared/errors/errorCodes.js';

async function loadService({ payment, invoices }) {
  jest.resetModules();

  const session = {
    withTransaction: jest.fn(async (callback) => callback()),
    endSession: jest.fn(),
  };

  const arPaymentRepository = {
    create: jest.fn(async (data) => ({ _id: 'payment-new', ...data })),
    findById: jest.fn(async () => payment),
    applyAllocationDelta: jest.fn(async () => ({ matchedCount: 1 })),
    getCustomerCreditBalance: jest.fn(async () => ({
      customerId: 'customer-1',
      currency: 'CHF',
      totalCredit: 75,
      paymentCount: 1,
      oldestCreditDate: new Date('2026-05-12T00:00:00.000Z'),
      payments: [{
        _id: 'payment-1',
        unallocatedAmount: 75,
      }],
    })),
  };
  const arPaymentAllocationRepository = {
    create: jest.fn(async (data) => ({ _id: `allocation-${data.invoiceId}`, ...data })),
  };
  const findQuery = {
    session: jest.fn(() => findQuery),
    lean: jest.fn(async () => invoices),
  };
  const Invoice = {
    find: jest.fn(() => findQuery),
    updateOne: jest.fn(async () => ({ matchedCount: 1 })),
  };
  const journalEntryService = { createFromEvent: jest.fn(async () => ({ _id: 'journal-1' })) };
  const accountMappingService = {
    resolveGlobal: jest.fn(async (mappingType) => ({
      BANK_CLEARING: 'bank-clearing-account',
      AR_RECEIVABLE: 'ar-receivable-account',
      WRITE_OFF_EXPENSE: 'write-off-expense-account',
    }[mappingType])),
  };
  const eventBus = { publish: jest.fn() };
  const auditService = { logEvent: jest.fn() };
  const fiscalPeriodService = { assertPostingDateOpen: jest.fn(async () => null) };

  jest.unstable_mockModule('mongoose', () => ({
    default: { startSession: jest.fn(async () => session) },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/arPayment.repository.js', () => ({
    arPaymentRepository,
    arPaymentAllocationRepository,
    default: arPaymentRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.service.js', () => ({
    default: journalEntryService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountMapping.service.js', () => ({
    ACCOUNT_MAPPING: {
      AR_RECEIVABLE: 'AR_RECEIVABLE',
      BANK_CLEARING: 'BANK_CLEARING',
      WRITE_OFF_EXPENSE: 'WRITE_OFF_EXPENSE',
    },
    default: accountMappingService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/fiscalPeriod.service.js', () => ({
    default: fiscalPeriodService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/dunningTemplate.repository.js', () => ({
    default: {},
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: {
      ACCOUNTING_AR_PAYMENT_ALLOCATED: 'accounting.ar.payment.allocated',
      ACCOUNTING_AR_PAYMENT_RECORDED: 'accounting.ar.payment.recorded',
    },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.model.js', () => ({
    default: Invoice,
  }));

  const service = (await import('../../src/modules/accounting/arReceivables.service.js')).default;

  return {
    service,
    session,
    arPaymentRepository,
    arPaymentAllocationRepository,
    Invoice,
    journalEntryService,
    accountMappingService,
    eventBus,
    auditService,
  };
}

describe('AR payment allocation integrity', () => {
  test('records bank payments using configured bank clearing and AR receivable accounts', async () => {
    const { service, arPaymentRepository, journalEntryService, accountMappingService } = await loadService({
      payment: null,
      invoices: [],
    });

    await service.recordPayment({
      paymentDate: new Date('2026-05-12T00:00:00.000Z'),
      amount: 125,
      customerId: 'customer-1',
      bankAccountId: 'bank-1',
      paymentReference: 'PMT-1',
      source: 'MANUAL',
    }, 'user-1');

    expect(arPaymentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      amount: 125,
      unallocatedAmount: 125,
      allocatedAmount: 0,
    }));
    expect(accountMappingService.resolveGlobal).toHaveBeenCalledWith('BANK_CLEARING');
    expect(accountMappingService.resolveGlobal).toHaveBeenCalledWith('AR_RECEIVABLE');
    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'AR_PAYMENT',
      'payment-new',
      'bank-clearing-account',
      'ar-receivable-account',
      125,
      'AR Payment received - PMT-1',
      'user-1',
    );
  });

  test('allocates against amountDue and groups duplicate invoice allocations atomically', async () => {
    const { service, session, arPaymentRepository, arPaymentAllocationRepository, Invoice } = await loadService({
      payment: {
        _id: 'payment-1',
        customerId: 'customer-1',
        allocatedAmount: 0,
        unallocatedAmount: 50,
      },
      invoices: [{
        _id: 'invoice-1',
        customerId: 'customer-1',
        status: 'SENT',
        amountPaid: 20,
        amountDue: 100,
      }],
    });

    await service.allocatePayment(
      'payment-1',
      [
        { invoiceId: 'invoice-1', amount: 10 },
        { invoiceId: 'invoice-1', amount: 20 },
      ],
      'user-1',
    );

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(arPaymentRepository.applyAllocationDelta).toHaveBeenCalledWith('payment-1', 30, { session });
    expect(arPaymentAllocationRepository.create).toHaveBeenCalledTimes(2);
    expect(Invoice.updateOne).toHaveBeenCalledWith(
      {
        _id: 'invoice-1',
        isDeleted: false,
        status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        amountDue: { $gte: 30 },
      },
      {
        $set: {
          amountPaid: 50,
          amountDue: 70,
          status: 'PARTIALLY_PAID',
        },
      },
      { session },
    );
  });

  test('rejects allocation when payment and invoice customers differ before writing', async () => {
    const { service, arPaymentRepository, arPaymentAllocationRepository, Invoice } = await loadService({
      payment: {
        _id: 'payment-1',
        customerId: 'customer-1',
        allocatedAmount: 0,
        unallocatedAmount: 50,
      },
      invoices: [{
        _id: 'invoice-1',
        customerId: 'customer-2',
        status: 'SENT',
        amountPaid: 0,
        amountDue: 40,
      }],
    });

    await expect(service.allocatePayment(
      'payment-1',
      [{ invoiceId: 'invoice-1', amount: 30 }],
      'user-1',
    )).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.ACCT_AR_PAYMENT_EXCEEDS_OUTSTANDING,
    });

    expect(arPaymentRepository.applyAllocationDelta).not.toHaveBeenCalled();
    expect(arPaymentAllocationRepository.create).not.toHaveBeenCalled();
    expect(Invoice.updateOne).not.toHaveBeenCalled();
  });

  test('exposes customer credit balance from unallocated AR payments', async () => {
    const { service, arPaymentRepository } = await loadService({
      payment: null,
      invoices: [],
    });

    const result = await service.getCustomerCreditBalance('customer-1');

    expect(arPaymentRepository.getCustomerCreditBalance).toHaveBeenCalledWith('customer-1');
    expect(result).toEqual(expect.objectContaining({
      customerId: 'customer-1',
      currency: 'CHF',
      totalCredit: 75,
      paymentCount: 1,
      payments: [expect.objectContaining({ unallocatedAmount: 75 })],
    }));
  });
});
