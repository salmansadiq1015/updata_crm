import { jest, describe, expect, test } from '@jest/globals';

async function loadJournalService({ original, reversalUpdate = { matchedCount: 1 }, debitAccount, creditAccount } = {}) {
  jest.resetModules();

  const session = {
    withTransaction: jest.fn(async (callback) => callback()),
    endSession: jest.fn(),
  };
  const journalEntryRepository = {
    create: jest.fn(async (data) => ({ _id: 'entry-new', ...data })),
    findById: jest.fn(async (id) => (id === 'entry-new' ? { _id: 'entry-new' } : original)),
    setReversedBy: jest.fn(async () => reversalUpdate),
  };
  const counterService = {
    getNextJournalEntryNumber: jest.fn(async () => 1001),
  };
  const accountRepository = {
    findById: jest.fn(async (id) => (id === 'debit-1' ? debitAccount : creditAccount)),
  };
  const cacheManager = {
    getOrSet: jest.fn(),
    del: jest.fn(),
    invalidatePattern: jest.fn(),
  };
  const eventBus = { publish: jest.fn() };
  const auditService = { logEvent: jest.fn() };
  const fiscalPeriodService = {
    assertPostingDateOpen: jest.fn(async () => null),
  };

  jest.unstable_mockModule('mongoose', () => ({
    default: { startSession: jest.fn(async () => session) },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.repository.js', () => ({
    default: journalEntryRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accounting.counter.service.js', () => ({
    default: counterService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/account.repository.js', () => ({
    default: accountRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/fiscalPeriod.service.js', () => ({
    default: fiscalPeriodService,
  }));
  jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
    default: cacheManager,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: { ACCOUNTING_JOURNAL_ENTRY_CREATED: 'accounting.journal.created' },
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

  const service = (await import('../../src/modules/accounting/journalEntry.service.js')).default;

  return {
    service,
    session,
    journalEntryRepository,
    counterService,
    accountRepository,
    fiscalPeriodService,
  };
}

describe('journal integrity', () => {
  test('creates manual entries inside the journal-number transaction', async () => {
    const { service, session, journalEntryRepository, counterService, accountRepository, fiscalPeriodService } = await loadJournalService({
      debitAccount: { _id: 'debit-1', isGroup: false },
      creditAccount: { _id: 'credit-1', isGroup: false },
    });

    await service.createManual({
      entryDate: new Date('2026-05-12T00:00:00.000Z'),
      description: 'Manual adjustment',
      debitAccountId: 'debit-1',
      creditAccountId: 'credit-1',
      amount: 25,
    }, 'user-1');

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(fiscalPeriodService.assertPostingDateOpen).toHaveBeenCalledWith(
      new Date('2026-05-12T00:00:00.000Z'),
      { session },
    );
    expect(accountRepository.findById).toHaveBeenCalledWith('debit-1', { session });
    expect(accountRepository.findById).toHaveBeenCalledWith('credit-1', { session });
    expect(counterService.getNextJournalEntryNumber).toHaveBeenCalledWith({ session });
    expect(journalEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        entryNumber: 1001,
        referenceType: 'MANUAL',
        createdBy: 'user-1',
      }),
      { session },
    );
  });

  test('reverses entries atomically and guards the original entry update', async () => {
    const original = {
      _id: 'entry-original',
      debitAccountId: { _id: 'debit-1' },
      creditAccountId: { _id: 'credit-1' },
      amount: 75,
      currency: 'CHF',
      referenceId: 'invoice-1',
      reversedBy: null,
    };
    const { service, session, journalEntryRepository, counterService, fiscalPeriodService } = await loadJournalService({ original });

    await service.reverse('entry-original', 'Correction', 'user-1');

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(fiscalPeriodService.assertPostingDateOpen).toHaveBeenCalledWith(expect.any(Date), { session });
    expect(counterService.getNextJournalEntryNumber).toHaveBeenCalledWith({ session });
    expect(journalEntryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        entryNumber: 1001,
        debitAccountId: 'credit-1',
        creditAccountId: 'debit-1',
        referenceType: 'REVERSAL',
        reversalOf: 'entry-original',
      }),
      { session },
    );
    expect(journalEntryRepository.setReversedBy).toHaveBeenCalledWith(
      'entry-original',
      'entry-new',
      { session },
    );
  });

  test('rejects a racing double reversal before reporting success', async () => {
    const original = {
      _id: 'entry-original',
      debitAccountId: 'debit-1',
      creditAccountId: 'credit-1',
      amount: 75,
      currency: 'CHF',
      referenceId: 'invoice-1',
      reversedBy: null,
    };
    const { service } = await loadJournalService({
      original,
      reversalUpdate: { matchedCount: 0 },
    });

    await expect(service.reverse('entry-original', 'Correction', 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
