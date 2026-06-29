import mongoose from 'mongoose';
import budgetRepository from './budget.repository.js';
import accountRepository from './account.repository.js';
import counterService from './accounting.counter.service.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

const CREDIT_NORMAL_TYPES = new Set(['LIABILITY', 'EQUITY', 'REVENUE']);

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeCurrency(value) {
  return String(value || 'CHF').trim().toUpperCase();
}

function normalizeStatus(value) {
  return value ? String(value).trim().toUpperCase() : undefined;
}

function monthKey(value) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function actualAmount(accountType, totals = {}) {
  const debit = Number(totals.debit || 0);
  const credit = Number(totals.credit || 0);
  return CREDIT_NORMAL_TYPES.has(accountType)
    ? roundMoney(credit - debit)
    : roundMoney(debit - credit);
}

function variancePercent(variance, budgetAmount) {
  return budgetAmount ? roundMoney((variance / budgetAmount) * 100) : 0;
}

function stripUndefined(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function validateLinePeriods(lines = [], startDate, endDate) {
  const budgetStart = toDate(startDate);
  const budgetEnd = toDate(endDate);
  const invalidLine = lines.find((line) => {
    const periodStart = toDate(line.periodStart);
    const periodEnd = toDate(line.periodEnd);
    return periodStart < budgetStart || periodEnd > budgetEnd;
  });

  if (invalidLine) {
    throw new AppError(
      'Budget line periods must stay inside the budget period',
      400,
      ERROR_CODES.ACCT_BUDGET_LINE_INVALID,
      [{
        accountId: invalidLine.accountId,
        periodStart: invalidLine.periodStart,
        periodEnd: invalidLine.periodEnd,
        budgetStart,
        budgetEnd,
      }],
    );
  }
}

function assertBudgetState(budget, allowed, action) {
  if (!allowed.includes(budget.status)) {
    throw new AppError(
      `Budget ${budget.budgetNumber} cannot be ${action} while ${budget.status.toLowerCase()}`,
      409,
      ERROR_CODES.ACCT_BUDGET_INVALID_STATE,
      [{ budgetId: budget._id, status: budget.status, action }],
    );
  }
}

class BudgetService {
  async create(data, userId, meta = {}) {
    const session = await mongoose.startSession();
    let budget;

    try {
      await session.withTransaction(async () => {
        const budgetNumber = data.budgetNumber || await counterService.getNextBudgetNumber({ session });
        const lines = await this._enrichLines(data.lines || [], { session });
        validateLinePeriods(lines, data.startDate, data.endDate);
        budget = await budgetRepository.create({
          ...data,
          budgetNumber,
          currency: normalizeCurrency(data.currency),
          status: 'DRAFT',
          lines,
          createdBy: userId,
        }, { session });
      });
    } finally {
      await session.endSession();
    }

    auditService.logEvent({
      eventType: 'accounting.budget.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { budgetId: budget._id, budgetNumber: budget.budgetNumber },
      module: 'accounting',
    });

    return budgetRepository.findById(budget._id);
  }

  async list(filters = {}) {
    return budgetRepository.findWithFilters({
      ...filters,
      status: normalizeStatus(filters.status),
      currency: filters.currency ? normalizeCurrency(filters.currency) : undefined,
    });
  }

  async getById(id) {
    const budget = await budgetRepository.findById(id);
    if (!budget) throw new NotFoundError('Budget', id);
    return budget;
  }

  async update(id, data, userId, meta = {}) {
    const budget = await this.getById(id);
    assertBudgetState(budget, ['DRAFT'], 'updated');
    const lines = data.lines ? await this._enrichLines(data.lines) : undefined;
    const effectiveStartDate = data.startDate || budget.startDate;
    const effectiveEndDate = data.endDate || budget.endDate;
    validateLinePeriods(lines || budget.lines || [], effectiveStartDate, effectiveEndDate);

    const updated = await budgetRepository.updateById(id, stripUndefined({
      ...data,
      currency: data.currency ? normalizeCurrency(data.currency) : undefined,
      lines,
      updatedBy: userId,
    }));

    auditService.logEvent({
      eventType: 'accounting.budget.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { budgetId: id, changedFields: Object.keys(data) },
      module: 'accounting',
    });

    return updated;
  }

  async approve(id, userId, meta = {}) {
    const budget = await this.getById(id);
    assertBudgetState(budget, ['DRAFT'], 'approved');
    if (!budget.lines?.length) {
      throw new AppError(
        'Budget must contain at least one line before approval',
        400,
        ERROR_CODES.ACCT_BUDGET_LINE_INVALID,
      );
    }
    const updated = await budgetRepository.updateById(id, {
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedBy: userId,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.budget.approved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { budgetId: id },
      module: 'accounting',
    });

    return updated;
  }

  async lock(id, userId, meta = {}) {
    const budget = await this.getById(id);
    assertBudgetState(budget, ['APPROVED'], 'locked');
    const updated = await budgetRepository.updateById(id, {
      status: 'LOCKED',
      lockedAt: new Date(),
      lockedBy: userId,
      updatedBy: userId,
    });

    auditService.logEvent({
      eventType: 'accounting.budget.locked',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { budgetId: id },
      module: 'accounting',
    });

    return updated;
  }

  async variance(id) {
    const budget = await this.getById(id);
    const accountIds = [...new Set((budget.lines || []).map((line) => line.accountId))];
    const actualRows = await budgetRepository.aggregateMonthlyActuals({
      accountIds,
      startDate: budget.startDate,
      endDate: budget.endDate,
      currency: budget.currency,
    });
    const actualByAccountMonth = new Map(actualRows.map((row) => [`${row.accountId}:${row.month}`, row]));

    const rows = (budget.lines || []).map((line) => {
      const key = `${line.accountId}:${monthKey(line.periodStart)}`;
      const actual = actualAmount(line.accountType, actualByAccountMonth.get(key));
      const budgetAmount = roundMoney(line.amount);
      const variance = roundMoney(actual - budgetAmount);
      return {
        lineId: line._id,
        accountId: line.accountId,
        accountNumber: line.accountNumber,
        accountName: line.accountName,
        accountType: line.accountType,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        period: monthKey(line.periodStart),
        budgetAmount,
        actualAmount: actual,
        variance,
        variancePercent: variancePercent(variance, budgetAmount),
      };
    });

    const totalBudget = roundMoney(rows.reduce((sum, row) => sum + row.budgetAmount, 0));
    const totalActual = roundMoney(rows.reduce((sum, row) => sum + row.actualAmount, 0));
    const totalVariance = roundMoney(totalActual - totalBudget);

    return {
      budgetId: budget._id,
      budgetNumber: budget.budgetNumber,
      name: budget.name,
      status: budget.status,
      period: {
        startDate: budget.startDate,
        endDate: budget.endDate,
      },
      currency: budget.currency,
      totalBudget,
      totalActual,
      totalVariance,
      variancePercent: variancePercent(totalVariance, totalBudget),
      rows,
    };
  }

  async summary(filters = {}) {
    const currency = filters.currency ? normalizeCurrency(filters.currency) : undefined;
    const summary = await budgetRepository.summarize({ currency });
    return {
      currency: currency || null,
      totalBudget: roundMoney(summary.totalBudget),
      budgetCount: summary.count || 0,
      approvedCount: summary.approvedCount || 0,
      lockedCount: summary.lockedCount || 0,
    };
  }

  async _enrichLines(lines = [], options = {}) {
    const enriched = [];
    for (const line of lines) {
      const account = await accountRepository.findById(line.accountId, options);
      if (!account) throw new NotFoundError('Account', line.accountId);
      if (account.isGroup || account.isActive === false) {
        throw new AppError(
          'Budget lines must reference active posting accounts',
          400,
          ERROR_CODES.ACCT_BUDGET_LINE_INVALID,
          [{ accountId: line.accountId }],
        );
      }
      enriched.push({
        ...line,
        accountNumber: account.accountNumber,
        accountName: account.name,
        accountType: account.type,
        amount: roundMoney(line.amount),
      });
    }
    return enriched;
  }
}

const budgetService = new BudgetService();
export default budgetService;
