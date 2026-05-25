import { jest, describe, expect, test } from '@jest/globals';

async function loadService({ arRows = [], apRows = [] } = {}) {
  jest.resetModules();

  const Invoice = {
    aggregate: jest.fn(async () => arRows),
    find: jest.fn(() => {
      throw new Error('getNetPosition must aggregate AR balances');
    }),
  };
  const ApInvoice = {
    aggregate: jest.fn(async () => apRows),
    find: jest.fn(() => {
      throw new Error('getNetPosition must aggregate AP balances');
    }),
  };

  jest.unstable_mockModule('mongoose', () => ({
    default: { startSession: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.model.js', () => ({
    default: Invoice,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/apInvoice.model.js', () => ({
    default: ApInvoice,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.service.js', () => ({
    default: {},
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountMapping.service.js', () => ({
    ACCOUNT_MAPPING: {},
    default: {},
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/accounting/openItems.service.js')).default;
  return { service, Invoice, ApInvoice };
}

describe('open-item large-read safeguards', () => {
  test('calculates net position with aggregation instead of loading AR/AP invoices', async () => {
    const { service, Invoice, ApInvoice } = await loadService({
      arRows: [{ _id: null, total: 125000.123 }],
      apRows: [{ _id: null, total: 62000.456 }],
    });

    const result = await service.getNetPosition('entity-1');

    expect(Invoice.find).not.toHaveBeenCalled();
    expect(ApInvoice.find).not.toHaveBeenCalled();
    expect(Invoice.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          customerId: 'entity-1',
          isDeleted: false,
          status: { $in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          amountDue: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$amountDue' } } },
    ]);
    expect(ApInvoice.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          supplierId: 'entity-1',
          isDeleted: false,
          status: { $in: ['RECORDED', 'APPROVED', 'PARTIALLY_PAID'] },
          outstandingAmount: { $gt: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: '$outstandingAmount' } } },
    ]);
    expect(result).toEqual({
      entityId: 'entity-1',
      arTotal: 125000.12,
      apTotal: 62000.46,
      netPosition: 62999.66,
    });
  });
});
