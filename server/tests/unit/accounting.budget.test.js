import { jest, describe, expect, test, beforeEach } from '@jest/globals';

async function loadBudgetService() {
  jest.resetModules();

  const session = {
    withTransaction: jest.fn(async (callback) => callback()),
    endSession: jest.fn(),
  };
  const budgetRepository = {
    create: jest.fn(),
    updateById: jest.fn(),
    findById: jest.fn(),
    findWithFilters: jest.fn(),
    summarize: jest.fn(),
    aggregateMonthlyActuals: jest.fn(),
  };
  const accountRepository = {
    findById: jest.fn(),
  };
  const counterService = {
    getNextBudgetNumber: jest.fn(async () => 'BUD-2026-00001'),
  };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('mongoose', () => ({
    default: { startSession: jest.fn(async () => session) },
  }));
  jest.unstable_mockModule('../../src/modules/accounting/budget.repository.js', () => ({
    default: budgetRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/account.repository.js', () => ({
    default: accountRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accounting.counter.service.js', () => ({
    default: counterService,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));

  const service = (await import('../../src/modules/accounting/budget.service.js')).default;
  return { service, budgetRepository, accountRepository, counterService, auditService };
}

const expenseAccount = {
  _id: '507f1f77bcf86cd799439011',
  accountNumber: '6000',
  name: 'Operating expense',
  type: 'EXPENSE',
  isGroup: false,
  isActive: true,
};

const revenueAccount = {
  _id: '507f1f77bcf86cd799439012',
  accountNumber: '3000',
  name: 'Sales revenue',
  type: 'REVENUE',
  isGroup: false,
  isActive: true,
};

describe('budget service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates draft budgets with enriched account lines and generated number', async () => {
    const { service, budgetRepository, accountRepository, counterService, auditService } = await loadBudgetService();
    accountRepository.findById.mockResolvedValue(expenseAccount);
    budgetRepository.create.mockResolvedValue({ _id: 'budget-1', budgetNumber: 'BUD-2026-00001' });
    budgetRepository.findById.mockResolvedValue({ _id: 'budget-1', budgetNumber: 'BUD-2026-00001' });

    const result = await service.create({
      name: 'FY 2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      currency: 'chf',
      lines: [{
        accountId: expenseAccount._id,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        amount: 1000.456,
      }],
    }, 'user-1');

    expect(counterService.getNextBudgetNumber).toHaveBeenCalled();
    expect(budgetRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      budgetNumber: 'BUD-2026-00001',
      currency: 'CHF',
      status: 'DRAFT',
      lines: [expect.objectContaining({
        accountId: expenseAccount._id,
        accountNumber: '6000',
        accountName: 'Operating expense',
        accountType: 'EXPENSE',
        amount: 1000.46,
      })],
      createdBy: 'user-1',
    }), expect.any(Object));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.budget.created',
    }));
    expect(result.budgetNumber).toBe('BUD-2026-00001');
  });

  test('rejects budget lines pointing to group accounts', async () => {
    const { service, accountRepository, budgetRepository } = await loadBudgetService();
    accountRepository.findById.mockResolvedValue({ ...expenseAccount, isGroup: true });

    await expect(service.create({
      name: 'Invalid budget',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      currency: 'CHF',
      lines: [{ accountId: expenseAccount._id, periodStart: '2026-01-01', periodEnd: '2026-01-31', amount: 100 }],
    }, 'user-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'ACCT_BUDGET_LINE_INVALID',
    });

    expect(budgetRepository.create).not.toHaveBeenCalled();
  });

  test('rejects budget lines outside the budget period', async () => {
    const { service, accountRepository, budgetRepository } = await loadBudgetService();
    accountRepository.findById.mockResolvedValue(expenseAccount);

    await expect(service.create({
      name: 'Invalid budget',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      currency: 'CHF',
      lines: [{ accountId: expenseAccount._id, periodStart: '2025-12-01', periodEnd: '2026-01-31', amount: 100 }],
    }, 'user-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'ACCT_BUDGET_LINE_INVALID',
    });

    expect(budgetRepository.create).not.toHaveBeenCalled();
  });

  test('rejects budget date updates that would exclude existing lines', async () => {
    const { service, budgetRepository } = await loadBudgetService();
    budgetRepository.findById.mockResolvedValue({
      _id: 'budget-1',
      budgetNumber: 'BUD-1',
      status: 'DRAFT',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.999Z'),
      lines: [{
        accountId: expenseAccount._id,
        periodStart: new Date('2026-12-01T00:00:00.000Z'),
        periodEnd: new Date('2026-12-31T23:59:59.999Z'),
        amount: 100,
      }],
    });

    await expect(service.update('budget-1', {
      endDate: '2026-11-30',
    }, 'user-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'ACCT_BUDGET_LINE_INVALID',
    });

    expect(budgetRepository.updateById).not.toHaveBeenCalled();
  });

  test('approves draft budgets and locks approved budgets only', async () => {
    const { service, budgetRepository, auditService } = await loadBudgetService();
    budgetRepository.findById
      .mockResolvedValueOnce({ _id: 'budget-1', budgetNumber: 'BUD-1', status: 'DRAFT', lines: [{ amount: 100 }] })
      .mockResolvedValueOnce({ _id: 'budget-1', budgetNumber: 'BUD-1', status: 'APPROVED', lines: [{ amount: 100 }] });
    budgetRepository.updateById
      .mockResolvedValueOnce({ _id: 'budget-1', status: 'APPROVED' })
      .mockResolvedValueOnce({ _id: 'budget-1', status: 'LOCKED' });

    await service.approve('budget-1', 'user-1');
    await service.lock('budget-1', 'user-1');

    expect(budgetRepository.updateById).toHaveBeenNthCalledWith(1, 'budget-1', expect.objectContaining({
      status: 'APPROVED',
      approvedBy: 'user-1',
    }));
    expect(budgetRepository.updateById).toHaveBeenNthCalledWith(2, 'budget-1', expect.objectContaining({
      status: 'LOCKED',
      lockedBy: 'user-1',
    }));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.budget.approved',
    }));
  });

  test('calculates budget-vs-actual variance using account normal balance', async () => {
    const { service, budgetRepository } = await loadBudgetService();
    budgetRepository.findById.mockResolvedValue({
      _id: 'budget-1',
      budgetNumber: 'BUD-1',
      name: 'FY 2026',
      status: 'APPROVED',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-31T23:59:59.999Z'),
      currency: 'CHF',
      lines: [
        {
          _id: 'line-expense',
          accountId: expenseAccount._id,
          accountNumber: '6000',
          accountName: 'Operating expense',
          accountType: 'EXPENSE',
          periodStart: new Date('2026-01-01T00:00:00.000Z'),
          periodEnd: new Date('2026-01-31T23:59:59.999Z'),
          amount: 1000,
        },
        {
          _id: 'line-revenue',
          accountId: revenueAccount._id,
          accountNumber: '3000',
          accountName: 'Sales revenue',
          accountType: 'REVENUE',
          periodStart: new Date('2026-01-01T00:00:00.000Z'),
          periodEnd: new Date('2026-01-31T23:59:59.999Z'),
          amount: 2000,
        },
      ],
    });
    budgetRepository.aggregateMonthlyActuals.mockResolvedValue([
      { accountId: expenseAccount._id, month: '2026-01', debit: 1250, credit: 100 },
      { accountId: revenueAccount._id, month: '2026-01', debit: 200, credit: 2300 },
    ]);

    const result = await service.variance('budget-1');

    expect(budgetRepository.aggregateMonthlyActuals).toHaveBeenCalledWith(expect.objectContaining({
      accountIds: [expenseAccount._id, revenueAccount._id],
      currency: 'CHF',
    }));
    expect(result.rows).toEqual([
      expect.objectContaining({
        lineId: 'line-expense',
        budgetAmount: 1000,
        actualAmount: 1150,
        variance: 150,
      }),
      expect.objectContaining({
        lineId: 'line-revenue',
        budgetAmount: 2000,
        actualAmount: 2100,
        variance: 100,
      }),
    ]);
    expect(result.totalBudget).toBe(3000);
    expect(result.totalActual).toBe(3250);
    expect(result.totalVariance).toBe(250);
  });

  test('summarizes budget totals by currency', async () => {
    const { service, budgetRepository } = await loadBudgetService();
    budgetRepository.summarize.mockResolvedValue({
      totalBudget: 5000,
      count: 2,
      approvedCount: 1,
      lockedCount: 1,
    });

    const result = await service.summary({ currency: 'chf' });

    expect(budgetRepository.summarize).toHaveBeenCalledWith({ currency: 'CHF' });
    expect(result).toEqual({
      currency: 'CHF',
      totalBudget: 5000,
      budgetCount: 2,
      approvedCount: 1,
      lockedCount: 1,
    });
  });
});
