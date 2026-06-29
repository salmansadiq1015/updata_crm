import { jest, describe, expect, test } from '@jest/globals';

async function loadDashboardService({ arSummary, arSummaryError = null } = {}) {
  jest.resetModules();

  const arReceivablesService = {
    getSummary: jest.fn(async () => {
      if (arSummaryError) throw arSummaryError;
      return arSummary || { totalOutstanding: 900, overdueAmount: 100, overdueCount: 1 };
    }),
    getAgingReport: jest.fn(async () => ({
      buckets: { current: 800, '1_30': 100, '31_60': 0, '61_90': 0, '90_plus': 0, over_90: 0 },
      totalOutstanding: 900,
      invoiceCount: 3,
    })),
  };
  const apInvoiceService = {
    getSummary: jest.fn(async () => ({ openAmount: 400, overdueAmount: 25, openCount: 2 })),
    getAgingReport: jest.fn(async () => ({
      buckets: { current: 375, '1_30': 25, '31_60': 0, '61_90': 0, '90_plus': 0, over_90: 0 },
      totalOutstanding: 400,
      invoiceCount: 2,
    })),
  };
  const cashManagementService = {
    getBalances: jest.fn(async () => [{ _id: 'bank-1', currency: 'CHF', balance: 1200 }]),
    getForecast: jest.fn(async () => ({
      currentBalance: 1200,
      projections: [{ date: '2026-01-01', outflows: 100, netPosition: 1100 }],
    })),
  };
  const accountingReportsService = {
    getProfitLoss: jest.fn(async () => ({ revenue: 5000, expenses: 3500, netProfit: 1500, margin: 30 })),
  };

  jest.unstable_mockModule('../../src/modules/accounting/arReceivables.service.js', () => ({
    default: arReceivablesService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/apInvoice.service.js', () => ({
    default: apInvoiceService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/cashManagement.service.js', () => ({
    default: cashManagementService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/reports.service.js', () => ({
    default: accountingReportsService,
  }));

  const service = (await import('../../src/modules/accounting/dashboard.service.js')).default;
  return {
    service,
    arReceivablesService,
    apInvoiceService,
    cashManagementService,
    accountingReportsService,
  };
}

describe('accounting dashboard service', () => {
  test('builds a consolidated accounting snapshot', async () => {
    const { service, accountingReportsService } = await loadDashboardService();

    const snapshot = await service.getSnapshot({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      currency: 'CHF',
      forecastDays: 30,
    });

    expect(accountingReportsService.getProfitLoss).toHaveBeenCalledWith({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      currency: 'CHF',
    });
    expect(snapshot.kpis).toEqual(expect.objectContaining({
      openReceivables: 900,
      openPayables: 400,
      bankBalance: 1200,
      projectedCashPosition: 1100,
      netProfit: 1500,
    }));
    expect(snapshot.warnings).toEqual([]);
  });

  test('returns partial dashboard data with warnings when one source fails', async () => {
    const { service } = await loadDashboardService({
      arSummaryError: new Error('AR unavailable'),
    });

    const snapshot = await service.getSnapshot({ currency: 'CHF' });

    expect(snapshot.kpis.openReceivables).toBe(0);
    expect(snapshot.kpis.openPayables).toBe(400);
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({ source: 'arSummary', message: 'AR unavailable' }),
    ]);
  });
});
