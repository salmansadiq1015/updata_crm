import { roundCurrency } from '../../shared/data/currencies.js';
import arReceivablesService from './arReceivables.service.js';
import apInvoiceService from './apInvoice.service.js';
import cashManagementService from './cashManagement.service.js';
import accountingReportsService from './reports.service.js';

const DEFAULT_CURRENCY = 'CHF';

function roundMoney(value, currency = 'CHF') { return roundCurrency(value, currency); }

function defaultPeriod({ startDate, endDate } = {}) {
  const now = new Date();
  return {
    startDate: startDate || new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10),
    endDate: endDate || now.toISOString().slice(0, 10),
  };
}

function emptyAging() {
  return {
    buckets: {
      current: 0,
      '1_30': 0,
      '31_60': 0,
      '61_90': 0,
      '90_plus': 0,
      over_90: 0,
    },
    totalOutstanding: 0,
    invoiceCount: 0,
  };
}

function settledValue(results, key, fallback, warnings) {
  const result = results[key];
  if (result?.status === 'fulfilled') return result.value;
  warnings.push({
    source: key,
    message: result?.reason?.message || 'Accounting dashboard source unavailable',
  });
  return fallback;
}

function sumBalancesByCurrency(balances, currency) {
  return roundMoney(
    balances
      .filter((balance) => !balance.currency || balance.currency === currency)
      .reduce((sum, balance) => sum + Number(balance.balance || 0), 0),
    currency);
}

class AccountingDashboardService {
  async getSnapshot(query = {}) {
    const currency = query.currency || DEFAULT_CURRENCY;
    const period = defaultPeriod(query);
    const forecastDays = Number(query.forecastDays || 90);

    const entries = await Promise.allSettled([
      arReceivablesService.getSummary({ currency }),
      arReceivablesService.getAgingReport({ currency }),
      apInvoiceService.getSummary({ currency }),
      apInvoiceService.getAgingReport({ currency }),
      cashManagementService.getBalances(),
      cashManagementService.getForecast({ days: forecastDays, currency }),
      accountingReportsService.getProfitLoss({
        startDate: period.startDate,
        endDate: period.endDate,
        currency,
      }),
    ]);

    const results = {
      arSummary: entries[0],
      arAging: entries[1],
      apSummary: entries[2],
      apAging: entries[3],
      cashBalances: entries[4],
      cashForecast: entries[5],
      profitLoss: entries[6],
    };
    const warnings = [];

    const arSummary = settledValue(results, 'arSummary', {}, warnings);
    const arAging = settledValue(results, 'arAging', emptyAging(), warnings);
    const apSummary = settledValue(results, 'apSummary', {}, warnings);
    const apAging = settledValue(results, 'apAging', emptyAging(), warnings);
    const cashBalances = settledValue(results, 'cashBalances', [], warnings);
    const cashForecast = settledValue(results, 'cashForecast', { currentBalance: 0, projections: [] }, warnings);
    const profitLoss = settledValue(results, 'profitLoss', { revenue: 0, expenses: 0, netProfit: 0, margin: 0 }, warnings);

    const bankBalance = sumBalancesByCurrency(cashBalances, currency);
    const forecastCurrentBalance = cashForecast.currentBalance ?? bankBalance;
    const latestProjection = cashForecast.projections?.[cashForecast.projections.length - 1] || null;

    return {
      generatedAt: new Date().toISOString(),
      freshness: {
        balancesSeconds: 60,
        forecastSeconds: 120,
        reports: 'live',
      },
      scope: {
        company: query.companyId || null,
        branch: query.branchId || null,
      },
      currency,
      period,
      kpis: {
        openReceivables: roundMoney(arSummary.totalOutstanding ?? arSummary.openAmount, currency),
        overdueReceivables: roundMoney(arSummary.overdueAmount, currency),
        openPayables: roundMoney(apSummary.openAmount, currency),
        overduePayables: roundMoney(apSummary.overdueAmount, currency),
        bankBalance,
        cashPosition: roundMoney(forecastCurrentBalance, currency),
        projectedCashPosition: roundMoney(latestProjection?.netPosition ?? forecastCurrentBalance, currency),
        monthlyRevenue: roundMoney(profitLoss.revenue, currency),
        monthlyExpenses: roundMoney(profitLoss.expenses, currency),
        netProfit: roundMoney(profitLoss.netProfit, currency),
        profitMargin: roundMoney(profitLoss.margin, 'CHF'),
        grossProfit: null,
        ebitda: null,
      },
      aging: {
        receivables: arAging,
        payables: apAging,
      },
      cash: {
        balances: cashBalances,
        forecast: cashForecast,
      },
      drilldowns: {
        receivables: '/api/v1/accounting/ar/open',
        payables: '/api/v1/accounting/ap/invoices/open',
        cash: '/api/v1/accounting/cash/forecast',
        profitLoss: '/api/v1/accounting/reports/profit-loss',
      },
      warnings,
    };
  }
}

const accountingDashboardService = new AccountingDashboardService();
export default accountingDashboardService;
