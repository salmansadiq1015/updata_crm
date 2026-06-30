import mongoose from 'mongoose';
import accountRepository from './account.repository.js';
import JournalEntry from './journalEntry.model.js';
import { toCsv } from '../../shared/utils/csv.js';

const FINANCIAL_ACCOUNT_TYPES = new Set(['REVENUE', 'EXPENSE']);
const BALANCE_SHEET_TYPES = new Set(['ASSET', 'LIABILITY', 'EQUITY']);
const DEBIT_NORMAL_TYPES = new Set(['ASSET', 'EXPENSE']);

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function defaultPeriod() {
  const now = new Date();
  return {
    startDate: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
    endDate: now,
  };
}

function buildPeriod({ startDate, endDate } = {}) {
  const defaults = defaultPeriod();
  return {
    startDate: startDate ? new Date(startDate) : defaults.startDate,
    endDate: endDate ? new Date(endDate) : defaults.endDate,
  };
}

function buildScope(query = {}) {
  return {
    company: query.companyId || null,
    branch: query.branchId || null,
  };
}

function scopeValue(value) {
  if (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return value;
}

function applyReportScope(match, query = {}) {
  if (query.companyId) match.companyId = scopeValue(query.companyId);
  if (query.branchId) match.branchId = scopeValue(query.branchId);
  return match;
}

function accountAmount(accountType, totals) {
  const debit = Number(totals.debit || 0);
  const credit = Number(totals.credit || 0);
  if (accountType === 'REVENUE') return roundMoney(credit - debit);
  if (accountType === 'EXPENSE') return roundMoney(debit - credit);
  return 0;
}

function signedAccountBalance(accountType, totals) {
  const debit = Number(totals.debit || 0);
  const credit = Number(totals.credit || 0);
  return DEBIT_NORMAL_TYPES.has(accountType)
    ? roundMoney(debit - credit)
    : roundMoney(credit - debit);
}

function trialBalanceSides(accountType, balance) {
  const amount = roundMoney(balance);
  const normalDebit = DEBIT_NORMAL_TYPES.has(accountType);
  if (amount >= 0) {
    return normalDebit
      ? { debitBalance: amount, creditBalance: 0 }
      : { debitBalance: 0, creditBalance: amount };
  }
  return normalDebit
    ? { debitBalance: 0, creditBalance: Math.abs(amount) }
    : { debitBalance: Math.abs(amount), creditBalance: 0 };
}

class AccountingReportsService {
  async _journalTotalsByAccount({
    endDate,
    startDate,
    currency = 'CHF',
    accountIds = [],
    companyId,
    branchId,
  } = {}) {
    if (!accountIds.length) return new Map();
    const match = applyReportScope({
      currency,
      $or: [
        { debitAccountId: { $in: accountIds } },
        { creditAccountId: { $in: accountIds } },
      ],
    }, { companyId, branchId });
    if (startDate || endDate) {
      match.entryDate = {};
      if (startDate) match.entryDate.$gte = new Date(startDate);
      if (endDate) match.entryDate.$lte = new Date(endDate);
    }

    const [result = { debits: [], credits: [] }] = await JournalEntry.aggregate([
      { $match: match },
      {
        $facet: {
          debits: [
            { $group: { _id: '$debitAccountId', total: { $sum: '$amount' } } },
          ],
          credits: [
            { $group: { _id: '$creditAccountId', total: { $sum: '$amount' } } },
          ],
        },
      },
    ]);

    const totalsByAccount = new Map();
    for (const row of result.debits || []) {
      const key = String(row._id);
      totalsByAccount.set(key, { ...(totalsByAccount.get(key) || {}), debit: row.total });
    }
    for (const row of result.credits || []) {
      const key = String(row._id);
      totalsByAccount.set(key, { ...(totalsByAccount.get(key) || {}), credit: row.total });
    }
    return totalsByAccount;
  }

  async getProfitLoss(query = {}) {
    const { startDate, endDate } = buildPeriod(query);
    const currency = query.currency || 'CHF';
    const accounts = (await accountRepository.findAll())
      .filter((account) => FINANCIAL_ACCOUNT_TYPES.has(account.type));
    const accountIds = accounts.map((account) => account._id);

    const aggregates = accountIds.length
      ? await JournalEntry.aggregate([
        {
          $match: applyReportScope({
            currency,
            entryDate: { $gte: startDate, $lte: endDate },
            $or: [
              { debitAccountId: { $in: accountIds } },
              { creditAccountId: { $in: accountIds } },
            ],
          }, query),
        },
        {
          $facet: {
            debits: [
              { $match: { debitAccountId: { $in: accountIds } } },
              { $group: { _id: '$debitAccountId', total: { $sum: '$amount' } } },
            ],
            credits: [
              { $match: { creditAccountId: { $in: accountIds } } },
              { $group: { _id: '$creditAccountId', total: { $sum: '$amount' } } },
            ],
          },
        },
      ])
      : [{ debits: [], credits: [] }];

    const totalsByAccount = new Map();
    const [result = { debits: [], credits: [] }] = aggregates;
    for (const row of result.debits || []) {
      const key = String(row._id);
      totalsByAccount.set(key, { ...(totalsByAccount.get(key) || {}), debit: row.total });
    }
    for (const row of result.credits || []) {
      const key = String(row._id);
      totalsByAccount.set(key, { ...(totalsByAccount.get(key) || {}), credit: row.total });
    }

    const rows = accounts
      .map((account) => {
        const totals = totalsByAccount.get(String(account._id)) || {};
        return {
          accountId: account._id,
          accountNumber: account.accountNumber,
          accountName: account.name,
          type: account.type,
          debit: roundMoney(totals.debit),
          credit: roundMoney(totals.credit),
          amount: accountAmount(account.type, totals),
        };
      })
      .filter((row) => row.amount !== 0 || row.debit !== 0 || row.credit !== 0)
      .sort((a, b) => String(a.accountNumber).localeCompare(String(b.accountNumber)));

    const revenue = roundMoney(rows
      .filter((row) => row.type === 'REVENUE')
      .reduce((sum, row) => sum + row.amount, 0));
    const expenses = roundMoney(rows
      .filter((row) => row.type === 'EXPENSE')
      .reduce((sum, row) => sum + row.amount, 0));
    const netProfit = roundMoney(revenue - expenses);

    return {
      period: {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
      },
      currency,
      scope: buildScope(query),
      revenue,
      expenses,
      netProfit,
      margin: revenue ? roundMoney((netProfit / revenue) * 100) : 0,
      rows,
      groups: {
        revenue: rows.filter((row) => row.type === 'REVENUE'),
        expenses: rows.filter((row) => row.type === 'EXPENSE'),
      },
    };
  }

  async exportProfitLossCsv(query = {}) {
    const report = await this.getProfitLoss(query);
    const headers = [
      'Type',
      'AccountNumber',
      'AccountName',
      'Debit',
      'Credit',
      'Amount',
      'Currency',
      'StartDate',
      'EndDate',
    ];
    const rows = report.rows.map((row) => ({
      Type: row.type,
      AccountNumber: row.accountNumber,
      AccountName: row.accountName,
      Debit: Number(row.debit || 0).toFixed(2),
      Credit: Number(row.credit || 0).toFixed(2),
      Amount: Number(row.amount || 0).toFixed(2),
      Currency: report.currency,
      StartDate: report.period.startDate,
      EndDate: report.period.endDate,
    }));

    rows.push({
      Type: 'SUMMARY',
      AccountNumber: '',
      AccountName: 'Revenue',
      Debit: '',
      Credit: '',
      Amount: Number(report.revenue).toFixed(2),
      Currency: report.currency,
      StartDate: report.period.startDate,
      EndDate: report.period.endDate,
    });
    rows.push({
      Type: 'SUMMARY',
      AccountNumber: '',
      AccountName: 'Expenses',
      Debit: '',
      Credit: '',
      Amount: Number(report.expenses).toFixed(2),
      Currency: report.currency,
      StartDate: report.period.startDate,
      EndDate: report.period.endDate,
    });
    rows.push({
      Type: 'SUMMARY',
      AccountNumber: '',
      AccountName: 'Net profit',
      Debit: '',
      Credit: '',
      Amount: Number(report.netProfit).toFixed(2),
      Currency: report.currency,
      StartDate: report.period.startDate,
      EndDate: report.period.endDate,
    });

    return toCsv(headers, rows);
  }

  async getBalanceSheet(query = {}) {
    const { endDate } = buildPeriod(query);
    const currency = query.currency || 'CHF';
    const accounts = (await accountRepository.findAll())
      .filter((account) => BALANCE_SHEET_TYPES.has(account.type));
    const accountIds = accounts.map((account) => account._id);
    const totalsByAccount = await this._journalTotalsByAccount({
      endDate,
      currency,
      accountIds,
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const rows = accounts
      .map((account) => {
        const totals = totalsByAccount.get(String(account._id)) || {};
        return {
          accountId: account._id,
          accountNumber: account.accountNumber,
          accountName: account.name,
          type: account.type,
          debit: roundMoney(totals.debit),
          credit: roundMoney(totals.credit),
          balance: signedAccountBalance(account.type, totals),
        };
      })
      .filter((row) => row.balance !== 0 || row.debit !== 0 || row.credit !== 0)
      .sort((a, b) => String(a.accountNumber).localeCompare(String(b.accountNumber)));

    const groups = {
      assets: rows.filter((row) => row.type === 'ASSET'),
      liabilities: rows.filter((row) => row.type === 'LIABILITY'),
      equity: rows.filter((row) => row.type === 'EQUITY'),
    };
    const totalAssets = roundMoney(groups.assets.reduce((sum, row) => sum + row.balance, 0));
    const totalLiabilities = roundMoney(groups.liabilities.reduce((sum, row) => sum + row.balance, 0));
    const totalEquity = roundMoney(groups.equity.reduce((sum, row) => sum + row.balance, 0));

    return {
      asOfDate: endDate.toISOString().slice(0, 10),
      period: { startDate: null, endDate: endDate.toISOString().slice(0, 10) },
      currency,
      scope: buildScope(query),
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: roundMoney(totalLiabilities + totalEquity),
      imbalance: roundMoney(totalAssets - totalLiabilities - totalEquity),
      rows,
      groups,
    };
  }

  async getTrialBalance(query = {}) {
    const { endDate } = buildPeriod(query);
    const currency = query.currency || 'CHF';
    const accounts = await accountRepository.findAll();
    const accountIds = accounts.map((account) => account._id);
    const totalsByAccount = await this._journalTotalsByAccount({
      endDate,
      currency,
      accountIds,
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const rows = accounts
      .map((account) => {
        const totals = totalsByAccount.get(String(account._id)) || {};
        const balance = signedAccountBalance(account.type, totals);
        const sides = trialBalanceSides(account.type, balance);
        return {
          accountId: account._id,
          accountNumber: account.accountNumber,
          accountName: account.name,
          type: account.type,
          debit: roundMoney(totals.debit),
          credit: roundMoney(totals.credit),
          balance,
          ...sides,
        };
      })
      .filter((row) => row.balance !== 0 || row.debit !== 0 || row.credit !== 0)
      .sort((a, b) => String(a.accountNumber).localeCompare(String(b.accountNumber)));

    const totalDebit = roundMoney(rows.reduce((sum, row) => sum + row.debitBalance, 0));
    const totalCredit = roundMoney(rows.reduce((sum, row) => sum + row.creditBalance, 0));

    return {
      asOfDate: endDate.toISOString().slice(0, 10),
      period: { startDate: null, endDate: endDate.toISOString().slice(0, 10) },
      currency,
      scope: buildScope(query),
      totalDebit,
      totalCredit,
      imbalance: roundMoney(totalDebit - totalCredit),
      rows,
    };
  }

  async getCashFlow(query = {}) {
    const { startDate, endDate } = buildPeriod(query);
    const currency = query.currency || 'CHF';
    const accounts = await accountRepository.findAll();
    const accountIds = accounts.map((account) => account._id);
    const totalsByAccount = await this._journalTotalsByAccount({
      startDate,
      endDate,
      currency,
      accountIds,
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const rows = accounts
      .map((account) => {
        const totals = totalsByAccount.get(String(account._id)) || {};
        const amount = signedAccountBalance(account.type, totals);
        let category = 'OPERATING';
        if (account.type === 'EQUITY' || account.type === 'LIABILITY') category = 'FINANCING';
        if (account.type === 'ASSET' && !String(account.accountNumber || '').startsWith('10')) category = 'INVESTING';
        return {
          accountId: account._id,
          accountNumber: account.accountNumber,
          accountName: account.name,
          type: account.type,
          category,
          amount,
          debit: roundMoney(totals.debit),
          credit: roundMoney(totals.credit),
        };
      })
      .filter((row) => row.amount !== 0 || row.debit !== 0 || row.credit !== 0)
      .sort((a, b) => String(a.accountNumber).localeCompare(String(b.accountNumber)));

    const totalByCategory = (category) => roundMoney(rows
      .filter((row) => row.category === category)
      .reduce((sum, row) => sum + row.amount, 0));

    const operating = totalByCategory('OPERATING');
    const investing = totalByCategory('INVESTING');
    const financing = totalByCategory('FINANCING');

    return {
      period: {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
      },
      currency,
      scope: buildScope(query),
      operating,
      investing,
      financing,
      netCashFlow: roundMoney(operating + investing + financing),
      rows,
      warnings: [
        'Cash-flow categories are derived from account type/number until dedicated cash-flow mapping exists.',
      ],
    };
  }

  async getGeneralLedger(query = {}) {
    const journalEntryRepository = (await import('./journalEntry.repository.js')).default;
    const result = await journalEntryRepository.findWithCursor({
      cursor: query.cursor,
      limit: query.limit,
      sortBy: query.sortBy || 'entryDate',
      sortOrder: query.sortOrder || 'asc',
      filters: {
        entryDateFrom: query.startDate,
        entryDateTo: query.endDate,
        referenceType: query.referenceType,
        accountId: query.accountId,
        currency: query.currency,
        companyId: query.companyId,
        branchId: query.branchId,
      },
    });

    return {
      period: {
        startDate: query.startDate || null,
        endDate: query.endDate || null,
      },
      currency: query.currency || null,
      scope: buildScope(query),
      data: result.data,
      pagination: result.pagination,
    };
  }
}

const accountingReportsService = new AccountingReportsService();
export default accountingReportsService;
