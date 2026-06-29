import { describe, expect, test, vi, beforeEach } from 'vitest';

const apiClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  default: apiClient,
}));

import {
  accDocService,
  accountingSearchService,
  arService,
  bankService,
  budgetService,
  dashboardService,
  exchangeRateService,
  fiscalPeriodService,
  fixedAssetService,
  journalService,
  recurringTransactionService,
  reportsService,
  taxService,
} from '../services/accounting-service';
import {
  buildApInvoicePayload,
  calculateApInvoicePreview,
  emptyApLine,
} from '../utils/ap-invoice-payload';

describe('accounting service normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('normalizes AR receivables from mixed invoice fields', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: [
        {
          _id: 'invoice-1',
          status: 'SENT',
          grandTotalRounded: 120.5,
          amountDue: 42.25,
        },
      ],
      pagination: { nextCursor: null },
    });

    const response = await arService.receivables({ customerId: 'customer-1' });

    expect(apiClient.get).toHaveBeenCalledWith('/accounting/ar/receivables', {
      params: { customerId: 'customer-1' },
    });
    expect(response.data[0]).toEqual(expect.objectContaining({
      totalAmount: 120.5,
      outstandingAmount: 42.25,
      displayStatus: 'OPEN',
    }));
  });

  test('flattens grouped dunning invoices into a normalized list', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: {
        reminder: [{ _id: 'inv-1', status: 'SENT', totalGross: 100, amountDue: 60 }],
        warning: [{ _id: 'inv-2', status: 'PARTIALLY_PAID', totalAmount: 200, outstandingAmount: 25 }],
      },
    });

    const response = await arService.overdueList();

    expect(response.data).toHaveLength(2);
    expect(response.data[0]).toEqual(expect.objectContaining({
      _id: 'inv-1',
      totalAmount: 100,
      outstandingAmount: 60,
      displayStatus: 'OPEN',
    }));
  });

  test('records and allocates invoice payment through the AR payment API', async () => {
    apiClient.post
      .mockResolvedValueOnce({ data: { _id: 'payment-1' } })
      .mockResolvedValueOnce({ data: { allocated: true } });

    const invoice = {
      _id: 'invoice-1',
      invoiceNumber: 'RE-2026-00001',
      customerId: 'customer-1',
    };

    const response = await arService.recordAndAllocateInvoicePayment({
      invoice,
      amount: '108.10',
      paymentReference: '',
      bankAccountId: 'bank-1',
    });

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/accounting/ar/payments', expect.objectContaining({
      amount: 108.1,
      customerId: 'customer-1',
      paymentReference: 'RE-2026-00001',
      bankAccountId: 'bank-1',
      source: 'MANUAL',
    }));
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/accounting/ar/payments/payment-1/allocate', {
      allocations: [{ invoiceId: 'invoice-1', amount: 108.1 }],
    });
    expect(response.data._id).toBe('payment-1');
  });

  test('sends bank statement uploads as multipart form data with bank metadata', async () => {
    apiClient.post.mockResolvedValueOnce({ data: { imported: 1 } });
    const file = new File(['<xml />'], 'statement.xml', { type: 'application/xml' });

    await bankService.importStatement({ file, bankAccountId: 'bank-1', format: 'camt.053' });

    const [, formData, config] = apiClient.post.mock.calls[0];
    expect(apiClient.post.mock.calls[0][0]).toBe('/accounting/bank/import');
    expect(formData.get('file')).toBe(file);
    expect(formData.get('bankAccountId')).toBe('bank-1');
    expect(formData.get('format')).toBe('camt.053');
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  test('uploads accounting documents with only populated metadata fields', async () => {
    apiClient.post.mockResolvedValueOnce({ data: { _id: 'doc-1' } });
    const file = new File(['pdf'], 'supplier.pdf', { type: 'application/pdf' });

    await accDocService.upload(file, {
      documentType: 'SUPPLIER_INVOICE',
      notes: '',
      projectReference: 'PRJ-1',
    });

    const [, formData, config] = apiClient.post.mock.calls[0];
    expect(apiClient.post.mock.calls[0][0]).toBe('/accounting/documents/upload');
    expect(formData.get('file')).toBe(file);
    expect(formData.get('documentType')).toBe('SUPPLIER_INVOICE');
    expect(formData.get('projectReference')).toBe('PRJ-1');
    expect(formData.has('notes')).toBe(false);
    expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  test('calls dashboard and extended report endpoints through the service layer', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: { kpis: {} } })
      .mockResolvedValueOnce({ data: { rows: [] } })
      .mockResolvedValueOnce({ data: { rows: [] } })
      .mockResolvedValueOnce({ data: { rows: [] } })
      .mockResolvedValueOnce({ data: [], pagination: { hasMore: false } });

    await dashboardService.snapshot({ currency: 'CHF' });
    await reportsService.balanceSheet({ endDate: '2026-12-31' });
    await reportsService.trialBalance({ endDate: '2026-12-31' });
    await reportsService.cashFlow({ startDate: '2026-01-01', endDate: '2026-12-31' });
    await reportsService.generalLedger({ accountId: 'account-1' });

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/accounting/dashboard', { params: { currency: 'CHF' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/accounting/reports/balance-sheet', { params: { endDate: '2026-12-31' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/accounting/reports/trial-balance', { params: { endDate: '2026-12-31' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(4, '/accounting/reports/cash-flow', { params: { startDate: '2026-01-01', endDate: '2026-12-31' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(5, '/accounting/reports/general-ledger', { params: { accountId: 'account-1' } });
  });

  test('calls global accounting search with normalized query params', async () => {
    apiClient.get.mockResolvedValueOnce({ data: [], meta: { returned: 0 } });

    await accountingSearchService.search({
      q: 'INV-100',
      type: 'AP_INVOICE',
      currency: 'CHF',
      minAmount: 100,
    });

    expect(apiClient.get).toHaveBeenCalledWith('/accounting/search', {
      params: {
        q: 'INV-100',
        type: 'AP_INVOICE',
        currency: 'CHF',
        minAmount: 100,
      },
    });
  });

  test('calls exchange-rate endpoints through the service layer', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { effectiveRate: 0.95 } })
      .mockResolvedValueOnce({ data: { lineCount: 1 } })
      .mockResolvedValueOnce({ data: [] });
    apiClient.post
      .mockResolvedValueOnce({ data: { _id: 'rate-1' } })
      .mockResolvedValueOnce({ data: { convertedAmount: 950 } })
      .mockResolvedValueOnce({ data: { runNumber: 'FXR-1' } });

    await exchangeRateService.list({ baseCurrency: 'CHF', quoteCurrency: 'EUR' });
    await exchangeRateService.upsert({
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      rate: 0.95,
      rateDate: '2026-06-25',
    });
    await exchangeRateService.resolve({
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      asOfDate: '2026-06-25',
    });
    await exchangeRateService.convert({
      amount: 1000,
      fromCurrency: 'CHF',
      toCurrency: 'EUR',
      asOfDate: '2026-06-25',
    });
    await exchangeRateService.revaluationPreview({ baseCurrency: 'CHF', revaluationDate: '2026-06-30' });
    await exchangeRateService.revaluationRuns({ baseCurrency: 'CHF' });
    await exchangeRateService.postRevaluation({ baseCurrency: 'CHF', revaluationDate: '2026-06-30' });

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/accounting/exchange-rates', {
      params: { baseCurrency: 'CHF', quoteCurrency: 'EUR' },
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/accounting/exchange-rates', {
      baseCurrency: 'CHF',
      quoteCurrency: 'EUR',
      rate: 0.95,
      rateDate: '2026-06-25',
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/accounting/exchange-rates/resolve', {
      params: { baseCurrency: 'CHF', quoteCurrency: 'EUR', asOfDate: '2026-06-25' },
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/accounting/exchange-rates/convert', {
      amount: 1000,
      fromCurrency: 'CHF',
      toCurrency: 'EUR',
      asOfDate: '2026-06-25',
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/accounting/exchange-rates/revaluation/preview', {
      params: { baseCurrency: 'CHF', revaluationDate: '2026-06-30' },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(4, '/accounting/exchange-rates/revaluation/runs', {
      params: { baseCurrency: 'CHF' },
    });
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/accounting/exchange-rates/revaluation/post', {
      baseCurrency: 'CHF',
      revaluationDate: '2026-06-30',
    });
  });

  test('calls fiscal period management endpoints through the service layer', async () => {
    apiClient.get.mockResolvedValueOnce({ data: [] });
    apiClient.post
      .mockResolvedValueOnce({ data: { _id: 'period-1' } })
      .mockResolvedValueOnce({ data: { status: 'CLOSED' } })
      .mockResolvedValueOnce({ data: { status: 'OPEN' } });

    await fiscalPeriodService.list({ status: 'OPEN' });
    await fiscalPeriodService.create({ name: 'FY 2026' });
    await fiscalPeriodService.close('period-1', 'Month-end lock');
    await fiscalPeriodService.reopen('period-1', 'Correction');

    expect(apiClient.get).toHaveBeenCalledWith('/accounting/fiscal-periods', { params: { status: 'OPEN' } });
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/accounting/fiscal-periods', { name: 'FY 2026' });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/accounting/fiscal-periods/period-1/close', { reason: 'Month-end lock' });
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/accounting/fiscal-periods/period-1/reopen', { reason: 'Correction' });
  });

  test('calls tax management endpoints through the service layer', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { outputTax: 0 } })
      .mockResolvedValueOnce({ data: { outputTax: 0 } });
    apiClient.post
      .mockResolvedValueOnce({ data: { _id: 'tax-1' } })
      .mockResolvedValueOnce({ data: { totals: { taxAmount: 8.1 } } });
    apiClient.put.mockResolvedValueOnce({ data: { _id: 'tax-1', rate: 7.7 } });

    await taxService.codes({ country: 'CH' });
    await taxService.createCode({ code: 'VAT81', rate: 8.1 });
    await taxService.updateCode('tax-1', { rate: 7.7 });
    await taxService.groups({ country: 'CH' });
    await taxService.exemptions({ isActive: true });
    await taxService.calculate({ lineItems: [{ lineTotal: 100, vatRate: 8.1 }] });
    await taxService.transactions({ direction: 'OUTPUT' });
    await taxService.summary({ currency: 'CHF' });
    await taxService.vatReport({ startDate: '2026-01-01' });

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/accounting/tax/codes', { params: { country: 'CH' } });
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/accounting/tax/codes', { code: 'VAT81', rate: 8.1 });
    expect(apiClient.put).toHaveBeenCalledWith('/accounting/tax/codes/tax-1', { rate: 7.7 });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/accounting/tax/groups', { params: { country: 'CH' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/accounting/tax/exemptions', { params: { isActive: true } });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/accounting/tax/calculate', { lineItems: [{ lineTotal: 100, vatRate: 8.1 }] });
    expect(apiClient.get).toHaveBeenNthCalledWith(4, '/accounting/tax/transactions', { params: { direction: 'OUTPUT' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(5, '/accounting/tax/summary', { params: { currency: 'CHF' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(6, '/accounting/tax/vat-report', { params: { startDate: '2026-01-01' } });
  });

  test('calls fixed asset lifecycle endpoints through the service layer', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { bookValue: 1000 } })
      .mockResolvedValueOnce({ data: { _id: 'asset-1' } });
    apiClient.post
      .mockResolvedValueOnce({ data: { _id: 'asset-1' } })
      .mockResolvedValueOnce({ data: { status: 'ACTIVE' } })
      .mockResolvedValueOnce({ data: { entry: { amount: 100 } } })
      .mockResolvedValueOnce({ data: { status: 'DISPOSED' } });
    apiClient.put.mockResolvedValueOnce({ data: { _id: 'asset-1', name: 'Updated' } });

    await fixedAssetService.list({ status: 'ACTIVE' });
    await fixedAssetService.summary({ currency: 'CHF' });
    await fixedAssetService.getById('asset-1');
    await fixedAssetService.create({ name: 'Asset' });
    await fixedAssetService.update('asset-1', { name: 'Updated' });
    await fixedAssetService.activate('asset-1', { placedInServiceDate: '2026-01-01' });
    await fixedAssetService.depreciate('asset-1', { periodDate: '2026-02-01' });
    await fixedAssetService.dispose('asset-1', { disposalDate: '2026-06-25', proceeds: 250 });

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/accounting/assets', { params: { status: 'ACTIVE' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/accounting/assets/summary', { params: { currency: 'CHF' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/accounting/assets/asset-1');
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/accounting/assets', { name: 'Asset' });
    expect(apiClient.put).toHaveBeenCalledWith('/accounting/assets/asset-1', { name: 'Updated' });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/accounting/assets/asset-1/activate', { placedInServiceDate: '2026-01-01' });
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/accounting/assets/asset-1/depreciate', { periodDate: '2026-02-01' });
    expect(apiClient.post).toHaveBeenNthCalledWith(4, '/accounting/assets/asset-1/dispose', { disposalDate: '2026-06-25', proceeds: 250 });
  });

  test('calls budget planning endpoints through the service layer', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { totalBudget: 1000 } })
      .mockResolvedValueOnce({ data: { _id: 'budget-1' } })
      .mockResolvedValueOnce({ data: { rows: [] } });
    apiClient.post
      .mockResolvedValueOnce({ data: { _id: 'budget-1' } })
      .mockResolvedValueOnce({ data: { status: 'APPROVED' } })
      .mockResolvedValueOnce({ data: { status: 'LOCKED' } });
    apiClient.put.mockResolvedValueOnce({ data: { _id: 'budget-1', name: 'Updated' } });

    await budgetService.list({ status: 'DRAFT' });
    await budgetService.summary({ currency: 'CHF' });
    await budgetService.getById('budget-1');
    await budgetService.create({ name: 'Budget' });
    await budgetService.update('budget-1', { name: 'Updated' });
    await budgetService.approve('budget-1');
    await budgetService.lock('budget-1');
    await budgetService.variance('budget-1');

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/accounting/budgets', { params: { status: 'DRAFT' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/accounting/budgets/summary', { params: { currency: 'CHF' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/accounting/budgets/budget-1');
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/accounting/budgets', { name: 'Budget' });
    expect(apiClient.put).toHaveBeenCalledWith('/accounting/budgets/budget-1', { name: 'Updated' });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/accounting/budgets/budget-1/approve');
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/accounting/budgets/budget-1/lock');
    expect(apiClient.get).toHaveBeenNthCalledWith(4, '/accounting/budgets/budget-1/variance');
  });

  test('calls recurring transaction endpoints through the service layer', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { activeCount: 1 } })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { _id: 'recurring-1' } });
    apiClient.post
      .mockResolvedValueOnce({ data: { _id: 'recurring-1' } })
      .mockResolvedValueOnce({ data: { status: 'ACTIVE' } })
      .mockResolvedValueOnce({ data: { status: 'PAUSED' } })
      .mockResolvedValueOnce({ data: { status: 'ARCHIVED' } })
      .mockResolvedValueOnce({ data: { status: 'COMPLETED' } })
      .mockResolvedValueOnce({ data: { processed: 1 } });
    apiClient.put.mockResolvedValueOnce({ data: { _id: 'recurring-1', name: 'Updated' } });

    await recurringTransactionService.list({ status: 'ACTIVE' });
    await recurringTransactionService.summary();
    await recurringTransactionService.runs({ limit: 5 });
    await recurringTransactionService.getById('recurring-1');
    await recurringTransactionService.create({ name: 'Template' });
    await recurringTransactionService.update('recurring-1', { name: 'Updated' });
    await recurringTransactionService.activate('recurring-1');
    await recurringTransactionService.pause('recurring-1');
    await recurringTransactionService.archive('recurring-1');
    await recurringTransactionService.run('recurring-1', { runDate: '2026-01-31' });
    await recurringTransactionService.runDue({ asOfDate: '2026-01-31' });

    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/accounting/recurring-transactions', { params: { status: 'ACTIVE' } });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/accounting/recurring-transactions/summary');
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/accounting/recurring-transactions/runs', { params: { limit: 5 } });
    expect(apiClient.get).toHaveBeenNthCalledWith(4, '/accounting/recurring-transactions/recurring-1');
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/accounting/recurring-transactions', { name: 'Template' });
    expect(apiClient.put).toHaveBeenCalledWith('/accounting/recurring-transactions/recurring-1', { name: 'Updated' });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/accounting/recurring-transactions/recurring-1/activate');
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/accounting/recurring-transactions/recurring-1/pause');
    expect(apiClient.post).toHaveBeenNthCalledWith(4, '/accounting/recurring-transactions/recurring-1/archive');
    expect(apiClient.post).toHaveBeenNthCalledWith(5, '/accounting/recurring-transactions/recurring-1/run', { runDate: '2026-01-31' });
    expect(apiClient.post).toHaveBeenNthCalledWith(6, '/accounting/recurring-transactions/run-due', { asOfDate: '2026-01-31' });
  });

  test('exports journal CSV with date range as query params', async () => {
    apiClient.post.mockResolvedValueOnce({ data: 'EntryNumber,Amount\nJE-1,100.00' });

    await journalService.export({ startDate: '2026-01-01', endDate: '2026-01-31' });

    expect(apiClient.post).toHaveBeenCalledWith('/accounting/journal/export', {}, {
      params: { startDate: '2026-01-01', endDate: '2026-01-31' },
      responseType: 'blob',
    });
  });

  test('builds AP invoice payload and preview totals outside UI components', () => {
    const line = {
      ...emptyApLine(),
      description: 'Materials',
      quantity: '2',
      unitPrice: '100',
      accountId: 'expense-1',
      costCenter: 'OPS',
    };
    const form = {
      supplierId: ' supplier-1 ',
      supplierName: ' Supplier AG ',
      supplierIban: '',
      supplierBic: '',
      supplierInvoiceNumber: ' INV-1 ',
      invoiceDate: '2026-01-01',
      dueDate: '2026-01-31',
      paymentTermsDays: '30',
      currency: 'CHF',
      projectReference: 'PRJ-1',
      orderReference: '',
    };

    expect(calculateApInvoicePreview([line])).toEqual({
      subtotal: 200,
      vatTotal: 16.2,
      total: 216.2,
    });
    expect(buildApInvoicePayload(form, [line])).toEqual(expect.objectContaining({
      supplierId: 'supplier-1',
      supplierName: 'Supplier AG',
      supplierInvoiceNumber: 'INV-1',
      lineItems: [
        expect.objectContaining({
          position: 1,
          accountId: 'expense-1',
          allocations: [expect.objectContaining({ amount: 200, projectReference: 'PRJ-1' })],
        }),
      ],
    }));
  });
});
