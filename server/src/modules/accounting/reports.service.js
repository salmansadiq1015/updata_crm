import { roundCurrency, currencyDigits } from '../../shared/data/currencies.js';
import mongoose from 'mongoose';
import accountRepository from './account.repository.js';
import JournalEntry from './journalEntry.model.js';
import { toCsv } from '../../shared/utils/csv.js';

const FINANCIAL_ACCOUNT_TYPES = new Set(['REVENUE', 'EXPENSE']);
const BALANCE_SHEET_TYPES = new Set(['ASSET', 'LIABILITY', 'EQUITY']);
const DEBIT_NORMAL_TYPES = new Set(['ASSET', 'EXPENSE']);

function roundMoney(value, currency = 'CHF') { return roundCurrency(value, currency); }

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

function accountAmount(accountType, totals, currency) {
  const debit = Number(totals.debit || 0);
  const credit = Number(totals.credit || 0);
  if (accountType === 'REVENUE') return roundMoney(credit - debit, currency);
  if (accountType === 'EXPENSE') return roundMoney(debit - credit, currency);
  return 0;
}

function signedAccountBalance(accountType, totals, currency) {
  const debit = Number(totals.debit || 0);
  const credit = Number(totals.credit || 0);
  return DEBIT_NORMAL_TYPES.has(accountType)
    ? roundMoney(debit - credit, currency)
    : roundMoney(credit - debit, currency);
}

function trialBalanceSides(accountType, balance, currency) {
  const amount = roundMoney(balance, currency);
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
          debit: roundMoney(totals.debit, currency),
          credit: roundMoney(totals.credit, currency),
          amount: accountAmount(account.type, totals, currency),
        };
      })
      .filter((row) => row.amount !== 0 || row.debit !== 0 || row.credit !== 0)
      .sort((a, b) => String(a.accountNumber).localeCompare(String(b.accountNumber)));

    const revenue = roundMoney(rows
      .filter((row) => row.type === 'REVENUE')
      .reduce((sum, row) => sum + row.amount, 0), currency);
    const expenses = roundMoney(rows
      .filter((row) => row.type === 'EXPENSE')
      .reduce((sum, row) => sum + row.amount, 0), currency);
    const netProfit = roundMoney(revenue - expenses, currency);

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
      margin: revenue ? roundMoney((netProfit / revenue) * 100, 'CHF') : 0,
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
      Debit: Number(row.debit || 0).toFixed(currencyDigits(report.currency)),
      Credit: Number(row.credit || 0).toFixed(currencyDigits(report.currency)),
      Amount: Number(row.amount || 0).toFixed(currencyDigits(report.currency)),
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
      Amount: Number(report.revenue).toFixed(currencyDigits(report.currency)),
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
      Amount: Number(report.expenses).toFixed(currencyDigits(report.currency)),
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
      Amount: Number(report.netProfit).toFixed(currencyDigits(report.currency)),
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
          debit: roundMoney(totals.debit, currency),
          credit: roundMoney(totals.credit, currency),
          balance: signedAccountBalance(account.type, totals, currency),
        };
      })
      .filter((row) => row.balance !== 0 || row.debit !== 0 || row.credit !== 0)
      .sort((a, b) => String(a.accountNumber).localeCompare(String(b.accountNumber)));

    const groups = {
      assets: rows.filter((row) => row.type === 'ASSET'),
      liabilities: rows.filter((row) => row.type === 'LIABILITY'),
      equity: rows.filter((row) => row.type === 'EQUITY'),
    };
    const totalAssets = roundMoney(groups.assets.reduce((sum, row) => sum + row.balance, 0), currency);
    const totalLiabilities = roundMoney(groups.liabilities.reduce((sum, row) => sum + row.balance, 0), currency);
    const totalEquity = roundMoney(groups.equity.reduce((sum, row) => sum + row.balance, 0), currency);

    return {
      asOfDate: endDate.toISOString().slice(0, 10),
      period: { startDate: null, endDate: endDate.toISOString().slice(0, 10) },
      currency,
      scope: buildScope(query),
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: roundMoney(totalLiabilities + totalEquity, currency),
      imbalance: roundMoney(totalAssets - totalLiabilities - totalEquity, currency),
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
        const balance = signedAccountBalance(account.type, totals, currency);
        const sides = trialBalanceSides(account.type, balance, currency);
        return {
          accountId: account._id,
          accountNumber: account.accountNumber,
          accountName: account.name,
          type: account.type,
          debit: roundMoney(totals.debit, currency),
          credit: roundMoney(totals.credit, currency),
          balance,
          ...sides,
        };
      })
      .filter((row) => row.balance !== 0 || row.debit !== 0 || row.credit !== 0)
      .sort((a, b) => String(a.accountNumber).localeCompare(String(b.accountNumber)));

    const totalDebit = roundMoney(rows.reduce((sum, row) => sum + row.debitBalance, 0), currency);
    const totalCredit = roundMoney(rows.reduce((sum, row) => sum + row.creditBalance, 0), currency);

    return {
      asOfDate: endDate.toISOString().slice(0, 10),
      period: { startDate: null, endDate: endDate.toISOString().slice(0, 10) },
      currency,
      scope: buildScope(query),
      totalDebit,
      totalCredit,
      imbalance: roundMoney(totalDebit - totalCredit, currency),
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
        const amount = signedAccountBalance(account.type, totals, currency);
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
          debit: roundMoney(totals.debit, currency),
          credit: roundMoney(totals.credit, currency),
        };
      })
      .filter((row) => row.amount !== 0 || row.debit !== 0 || row.credit !== 0)
      .sort((a, b) => String(a.accountNumber).localeCompare(String(b.accountNumber)));

    const totalByCategory = (category) => roundMoney(rows
      .filter((row) => row.category === category)
      .reduce((sum, row) => sum + row.amount, 0), currency);

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
      netCashFlow: roundMoney(operating + investing + financing, currency),
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
