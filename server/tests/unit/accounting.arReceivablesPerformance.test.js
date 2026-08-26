import { jest, describe, expect, test } from '@jest/globals';

async function loadService({ aggregateRows = [] } = {}) {
  jest.resetModules();

  const Invoice = {
    aggregate: jest.fn(async () => aggregateRows),
    find: jest.fn(() => {
      throw new Error('getSummary must use aggregation, not full collection find');
    }),
  };

  jest.unstable_mockModule('mongoose', () => ({
    default: { startSession: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/arPayment.repository.js', () => ({
    arPaymentRepository: {},
    arPaymentAllocationRepository: {},
    default: {},
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.service.js', () => ({
    default: {},
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountMapping.service.js', () => ({
    ACCOUNT_MAPPING: {},
    default: {},
  }));
  jest.unstable_mockModule('../../src/modules/accounting/dunningTemplate.repository.js', () => ({
    default: {},
  }));
  // The service reaches the fiscal-period guard, which pulls in a model —
  // and a model definition needs a real mongoose Schema, which the stub above
  // deliberately does not provide. Stubbing the guard keeps this test about
  // the aggregation it is named for.
  jest.unstable_mockModule('../../src/modules/accounting/fiscalPeriod.service.js', () => ({
    default: { assertPostingDateOpen: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: { publish: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: {},
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: { logEvent: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.model.js', () => ({
    default: Invoice,
  }));

  const service = (await import('../../src/modules/accounting/arReceivables.service.js')).default;
  return { service, Invoice };
}

describe('AR receivables large-read safeguards', () => {
  test('builds receivables summary through Mongo aggregation instead of loading open invoices', async () => {
    const { service, Invoice } = await loadService({
      aggregateRows: [{
        _id: null,
        totalOutstanding: 123456.789,
        openCount: 10000,
        overdueAmount: 50000.111,
        overdueCount: 2500,
        totalDaysOutstanding: 317000,
      }],
    });

    const summary = await service.getSummary();

    expect(Invoice.aggregate).toHaveBeenCalledTimes(1);
    expect(Invoice.find).not.toHaveBeenCalled();
    expect(Invoice.aggregate.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        $match: expect.objectContaining({
          isDeleted: false,
          amountDue: { $gt: 0 },
        }),
      }),
      expect.objectContaining({
        $group: expect.objectContaining({
          totalOutstanding: { $sum: '$amountDue' },
          openCount: { $sum: 1 },
        }),
      }),
    ]));
    expect(summary).toEqual({
      totalOutstanding: 123456.79,
      openAmount: 123456.79,
      openCount: 10000,
      overdueAmount: 50000.11,
      overdueCount: 2500,
      avgDaysOutstanding: 32,
      totalInvoices: 10000,
    });
  });

  test('returns a stable empty summary when no open receivables exist', async () => {
    const { service, Invoice } = await loadService({ aggregateRows: [] });

    await expect(service.getSummary()).resolves.toEqual({
      totalOutstanding: 0,
      openAmount: 0,
      openCount: 0,
      overdueAmount: 0,
      overdueCount: 0,
      avgDaysOutstanding: 0,
      totalInvoices: 0,
    });
    expect(Invoice.find).not.toHaveBeenCalled();
  });
});
