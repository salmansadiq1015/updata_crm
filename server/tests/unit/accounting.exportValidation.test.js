import { jest, describe, expect, test } from '@jest/globals';

async function loadJournalService(entries = []) {
  jest.resetModules();

  const journalEntryRepository = {
    findForExport: jest.fn(async () => entries),
  };
  const cacheManager = {
    getOrSet: jest.fn(),
    del: jest.fn(),
    invalidatePattern: jest.fn(),
  };

  jest.unstable_mockModule('mongoose', () => {
    function MockSchema() {
      return { index: jest.fn(), pre: jest.fn() };
    }
    MockSchema.Types = { ObjectId: 'ObjectId' };
    return {
      default: {
        Schema: MockSchema,
        model: jest.fn(() => ({})),
        startSession: jest.fn(),
      },
    };
  });
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.repository.js', () => ({
    default: journalEntryRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accounting.counter.service.js', () => ({
    default: { getNextJournalEntryNumber: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/account.repository.js', () => ({
    default: { findById: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
    default: cacheManager,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: { publish: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: { ACCOUNTING_JOURNAL_ENTRY_CREATED: 'accounting.journal.created' },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: { logEvent: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/config/index.js', () => ({
    default: { redis: { keyPrefix: 'test:' } },
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/accounting/journalEntry.service.js')).default;
  return { service, journalEntryRepository };
}

async function loadAccountService({ account, openingDebit = 0, openingCredit = 0, transactions = [] }) {
  jest.resetModules();

  const accountRepository = {
    findById: jest.fn(async () => account),
    findByAccountNumber: jest.fn(),
    create: jest.fn(),
    findWithCursor: jest.fn(),
    findAll: jest.fn(),
  };
  const aggregate = jest.fn(async (pipeline) => {
    const match = pipeline[0].$match;
    if (match.debitAccountId) return openingDebit ? [{ total: openingDebit }] : [];
    if (match.creditAccountId) return openingCredit ? [{ total: openingCredit }] : [];
    return [];
  });
  const findQuery = {
    sort: jest.fn(() => findQuery),
    limit: jest.fn(() => findQuery),
    populate: jest.fn(() => findQuery),
    lean: jest.fn(async () => transactions),
  };
  const JournalEntry = {
    aggregate,
    find: jest.fn(() => findQuery),
  };

  jest.unstable_mockModule('../../src/modules/accounting/account.repository.js', () => ({
    default: accountRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.model.js', () => ({
    default: JournalEntry,
  }));
  jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
    default: { getOrSet: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: { publish: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: { logEvent: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/config/index.js', () => ({
    default: { redis: { keyPrefix: 'test:' } },
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/accounting/account.service.js')).default;
  return { service, accountRepository, JournalEntry };
}

describe('accounting export validation', () => {
  test('exports journal CSV with Sage-compatible account columns and safe quoting', async () => {
    const { service, journalEntryRepository } = await loadJournalService([
      {
        entryNumber: 42,
        entryDate: new Date('2026-05-13T12:00:00.000Z'),
        debitAccountId: { accountNumber: '1020', name: 'Bank, CHF' },
        creditAccountId: { accountNumber: '1100', name: 'Receivables' },
        amount: 1500,
        currency: 'CHF',
        description: '=Imported invoice, check',
        referenceType: 'AR_PAYMENT',
        referenceId: '507f1f77bcf86cd799439011',
        createdBy: { email: 'finance@example.test' },
      },
    ]);

    const csv = await service.exportCsv({ startDate: '2026-05-01', endDate: '2026-05-31' });

    expect(journalEntryRepository.findForExport).toHaveBeenCalledWith({
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    expect(csv.split('\n')[0]).toBe('EntryNumber,EntryDate,CompanyId,BranchId,DebitAccount,DebitAccountName,CreditAccount,CreditAccountName,Amount,Currency,Description,ReferenceType,ReferenceId,CreatedByEmail');
    expect(csv).toContain('42,2026-05-13,,,1020,"Bank, CHF",1100,Receivables,1500.00,CHF,"\'=Imported invoice, check",AR_PAYMENT,507f1f77bcf86cd799439011,finance@example.test');
  });

  test('builds account overview with debit-normal running balance and CSV export', async () => {
    const bankAccount = {
      _id: 'account-bank',
      accountNumber: '1020',
      name: 'Bank CHF',
      type: 'ASSET',
    };
    const transactions = [
      {
        _id: 'entry-1',
        entryNumber: 1,
        entryDate: new Date('2026-05-01T00:00:00.000Z'),
        description: 'Incoming payment',
        debitAccountId: { _id: 'account-bank', accountNumber: '1020', name: 'Bank CHF' },
        creditAccountId: { _id: 'account-ar', accountNumber: '1100', name: 'Receivables' },
        amount: 125,
        referenceType: 'AR_PAYMENT',
        referenceId: 'payment-1',
      },
      {
        _id: 'entry-2',
        entryNumber: 2,
        entryDate: new Date('2026-05-02T00:00:00.000Z'),
        description: 'Bank fee',
        debitAccountId: { _id: 'account-fee', accountNumber: '6940', name: 'Bank Fees' },
        creditAccountId: { _id: 'account-bank', accountNumber: '1020', name: 'Bank CHF' },
        amount: 5,
        referenceType: 'BANK_FEE',
        referenceId: 'fee-1',
      },
    ];
    const { service, JournalEntry } = await loadAccountService({
      account: bankAccount,
      openingDebit: 1000,
      openingCredit: 250,
      transactions,
    });

    const overview = await service.getOverview('account-bank', {
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });
    const csv = await service.exportOverviewCsv('account-bank', {
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });

    expect(JournalEntry.find).toHaveBeenCalledWith(expect.objectContaining({
      $or: [{ debitAccountId: 'account-bank' }, { creditAccountId: 'account-bank' }],
    }));
    expect(overview).toMatchObject({
      openingBalance: 750,
      periodDebits: 125,
      periodCredits: 5,
      closingBalance: 870,
    });
    expect(overview.transactions.map((entry) => entry.runningBalance)).toEqual([875, 870]);
    expect(csv).toContain('1,2026-05-01,Incoming payment,1020,1100,125.00,0.00,125.00,875.00,AR_PAYMENT,payment-1');
    expect(csv).toContain('2,2026-05-02,Bank fee,6940,1020,0.00,5.00,-5.00,870.00,BANK_FEE,fee-1');
  });

  test('caps account overview transaction reads at the 10K requirement boundary', async () => {
    const { service, JournalEntry } = await loadAccountService({
      account: {
        _id: 'account-bank',
        accountNumber: '1020',
        name: 'Bank CHF',
        type: 'ASSET',
      },
      transactions: [],
    });

    await service.getOverview('account-bank', {
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      limit: 250000,
    });

    const findQuery = JournalEntry.find.mock.results[0].value;
    expect(findQuery.limit).toHaveBeenCalledWith(10000);
  });
});
