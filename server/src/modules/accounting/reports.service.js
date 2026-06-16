import accountRepository from './account.repository.js';
import JournalEntry from './journalEntry.model.js';
import { toCsv } from '../../shared/utils/csv.js';

const FINANCIAL_ACCOUNT_TYPES = new Set(['REVENUE', 'EXPENSE']);

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

function accountAmount(accountType, totals) {
  const debit = Number(totals.debit || 0);
  const credit = Number(totals.credit || 0);
  if (accountType === 'REVENUE') return roundMoney(credit - debit);
  if (accountType === 'EXPENSE') return roundMoney(debit - credit);
  return 0;
}

class AccountingReportsService {
  async getProfitLoss(query = {}) {
    const { startDate, endDate } = buildPeriod(query);
    const currency = query.currency || 'CHF';
    const accounts = (await accountRepository.findAll())
      .filter((account) => FINANCIAL_ACCOUNT_TYPES.has(account.type));
    const accountIds = accounts.map((account) => account._id);

    const aggregates = accountIds.length
      ? await JournalEntry.aggregate([
        {
          $match: {
            currency,
            entryDate: { $gte: startDate, $lte: endDate },
            $or: [
              { debitAccountId: { $in: accountIds } },
              { creditAccountId: { $in: accountIds } },
            ],
          },
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
}

const accountingReportsService = new AccountingReportsService();
export default accountingReportsService;
