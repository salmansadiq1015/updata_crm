import { jest, describe, expect, test } from '@jest/globals';

async function loadReportsService({ accounts = [], aggregateResult = [] } = {}) {
  jest.resetModules();

  const accountRepository = {
    findAll: jest.fn(async () => accounts),
  };
  const JournalEntry = {
    aggregate: jest.fn(async () => aggregateResult),
  };

  jest.unstable_mockModule('../../src/modules/accounting/account.repository.js', () => ({
    default: accountRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.model.js', () => ({
    default: JournalEntry,
  }));

  const service = (await import('../../src/modules/accounting/reports.service.js')).default;
  return { service, accountRepository, JournalEntry };
}

describe('accounting reports', () => {
  test('calculates profit and loss from journal debits and credits', async () => {
    const accounts = [
      { _id: 'revenue-1', accountNumber: '3400', name: 'Sales', type: 'REVENUE' },
      { _id: 'expense-1', accountNumber: '4000', name: 'Materials', type: 'EXPENSE' },
      { _id: 'asset-1', accountNumber: '1020', name: 'Bank', type: 'ASSET' },
    ];
    const { service, JournalEntry } = await loadReportsService({
      accounts,
      aggregateResult: [{
        debits: [
          { _id: 'revenue-1', total: 200 },
          { _id: 'expense-1', total: 1400 },
        ],
        credits: [
          { _id: 'revenue-1', total: 5000 },
          { _id: 'expense-1', total: 100 },
        ],
      }],
    });

    const report = await service.getProfitLoss({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      currency: 'CHF',
    });

    expect(JournalEntry.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        $match: expect.objectContaining({
          currency: 'CHF',
          entryDate: {
            $gte: new Date('2026-01-01'),
            $lte: new Date('2026-01-31'),
          },
        }),
      }),
    ]));
    expect(report).toMatchObject({
      currency: 'CHF',
      revenue: 4800,
      expenses: 1300,
      netProfit: 3500,
      margin: 72.92,
    });
    expect(report.rows).toEqual([
      expect.objectContaining({ accountNumber: '3400', amount: 4800 }),
      expect.objectContaining({ accountNumber: '4000', amount: 1300 }),
    ]);
  });

  test('exports profit and loss CSV with summary rows', async () => {
    const { service } = await loadReportsService({
      accounts: [
        { _id: 'revenue-1', accountNumber: '3400', name: '=Sales', type: 'REVENUE' },
        { _id: 'expense-1', accountNumber: '4000', name: 'Materials', type: 'EXPENSE' },
      ],
      aggregateResult: [{
        debits: [{ _id: 'expense-1', total: 250 }],
        credits: [{ _id: 'revenue-1', total: 1000 }],
      }],
    });

    const csv = await service.exportProfitLossCsv({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });

    expect(csv.split('\n')[0]).toBe('Type,AccountNumber,AccountName,Debit,Credit,Amount,Currency,StartDate,EndDate');
    expect(csv).toContain("REVENUE,3400,'=Sales,0.00,1000.00,1000.00,CHF,2026-02-01,2026-02-28");
    expect(csv).toContain('EXPENSE,4000,Materials,250.00,0.00,250.00,CHF,2026-02-01,2026-02-28');
    expect(csv).toContain('SUMMARY,,Net profit,,,750.00,CHF,2026-02-01,2026-02-28');
  });
});
