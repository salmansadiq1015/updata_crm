import { jest, describe, expect, test } from '@jest/globals';

async function loadAccountingEvents() {
  jest.resetModules();

  const handlers = {};
  const eventBus = {
    subscribe: jest.fn((type, handler) => {
      handlers[type] = handler;
    }),
  };
  const EVENT_TYPES = {
    INVOICE_FINALIZED: 'invoice.finalized',
    INVOICE_PAYMENT_RECORDED: 'invoice.payment_recorded',
    INVOICE_PAID: 'invoice.paid',
    INVOICE_OVERDUE: 'invoice.overdue',
    ACCOUNTING_DOCUMENT_UPLOADED: 'accounting.document_uploaded',
  };
  const journalEntryService = {
    createFromEvent: jest.fn(),
  };
  const taxService = {
    recordFromArInvoiceEvent: jest.fn(),
  };
  const accountMappingService = {
    resolveGlobal: jest.fn(async (key) => `${key}-account`),
  };
  const ACCOUNT_MAPPING = {
    AR_RECEIVABLE: 'AR_RECEIVABLE',
    SALES_REVENUE: 'SALES_REVENUE',
    BANK_CLEARING: 'BANK_CLEARING',
  };

  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: EVENT_TYPES,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountMapping.service.js', () => ({
    default: accountMappingService,
    ACCOUNT_MAPPING,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.service.js', () => ({
    default: journalEntryService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/tax.service.js', () => ({
    default: taxService,
  }));

  const module = await import('../../src/modules/accounting/accounting.events.js');
  return { ...module, handlers, EVENT_TYPES, journalEntryService, taxService };
}

describe('accounting event integration', () => {
  test('unwraps invoice finalized envelopes and posts journal with amount/date/currency', async () => {
    const {
      registerAccountingEvents,
      handlers,
      EVENT_TYPES,
      journalEntryService,
      taxService,
    } = await loadAccountingEvents();
    registerAccountingEvents();

    await handlers[EVENT_TYPES.INVOICE_FINALIZED]({
      payload: {
        invoiceId: 'invoice-1',
        invoiceNumber: 'INV-1',
        invoiceDate: '2026-04-01',
        totalAmount: 250,
        currency: 'EUR',
        userId: 'user-1',
        vatBreakdown: [{ rate: 20, base: 250, amount: 50 }],
      },
    });

    expect(journalEntryService.createFromEvent).toHaveBeenCalledWith(
      'INVOICE_FINALIZED',
      'invoice-1',
      'AR_RECEIVABLE-account',
      'SALES_REVENUE-account',
      250,
      'Revenue: Invoice INV-1 finalized',
      'user-1',
      { entryDate: '2026-04-01', currency: 'EUR' },
    );
    expect(taxService.recordFromArInvoiceEvent).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: 'invoice-1',
      invoiceNumber: 'INV-1',
      vatBreakdown: [{ rate: 20, base: 250, amount: 50 }],
    }));
  });
});
