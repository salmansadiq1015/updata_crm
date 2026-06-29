import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi, beforeEach } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  ar: {
    recordAndAllocateInvoicePayment: vi.fn(),
    generateDunning: vi.fn(),
  },
  bank: {
    retrieve: vi.fn(),
  },
  documents: {
    confirmOcr: vi.fn(),
    bulkAssign: vi.fn(),
  },
  fiscalPeriods: {
    create: vi.fn(),
    close: vi.fn(),
    reopen: vi.fn(),
  },
  exchangeRates: {
    upsert: vi.fn(),
    convert: vi.fn(),
    postRevaluation: vi.fn(),
  },
  tax: {
    createCode: vi.fn(),
    updateCode: vi.fn(),
    calculate: vi.fn(),
  },
  fixedAssets: {
    create: vi.fn(),
    update: vi.fn(),
    activate: vi.fn(),
    depreciate: vi.fn(),
    dispose: vi.fn(),
  },
  budgets: {
    create: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    lock: vi.fn(),
  },
  recurring: {
    create: vi.fn(),
    update: vi.fn(),
    activate: vi.fn(),
    pause: vi.fn(),
    archive: vi.fn(),
    run: vi.fn(),
    runDue: vi.fn(),
  },
}));

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock('../services/accounting-service', () => ({
  chartService: {},
  journalService: {},
  apService: {},
  arService: serviceMocks.ar,
  bankService: serviceMocks.bank,
  cashService: {},
  reconciliationService: {},
  openItemsService: {},
  accDocService: serviceMocks.documents,
  exchangeRateService: serviceMocks.exchangeRates,
  fiscalPeriodService: serviceMocks.fiscalPeriods,
  taxService: serviceMocks.tax,
  fixedAssetService: serviceMocks.fixedAssets,
  budgetService: serviceMocks.budgets,
  recurringTransactionService: serviceMocks.recurring,
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (_key, fallback) => fallback,
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccess },
}));

import {
  useAccDocumentMutations,
  useArMutations,
  useBankMutations,
  useBudgetMutations,
  useExchangeRateMutations,
  useFixedAssetMutations,
  useRecurringTransactionMutations,
  useTaxMutations,
} from '../hooks/use-accounting-mutations';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  function wrapper({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { wrapper, invalidateSpy };
}

describe('accounting mutation hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('recordInvoicePayment invalidates AR receivables, summary, and payments', async () => {
    serviceMocks.ar.recordAndAllocateInvoicePayment.mockResolvedValue({ data: { _id: 'payment-1' } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useArMutations(), { wrapper });

    await act(async () => {
      await result.current.recordInvoicePayment.mutateAsync({
        invoice: { _id: 'invoice-1', customerId: 'customer-1' },
        amount: 50,
      });
    });

    expect(serviceMocks.ar.recordAndAllocateInvoicePayment).toHaveBeenCalledWith(
      {
        invoice: { _id: 'invoice-1', customerId: 'customer-1' },
        amount: 50,
      },
      expect.objectContaining({ client: expect.any(QueryClient) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'ar-receivables'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'ar-summary'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'ar-payments'] });
    expect(toastSuccess).toHaveBeenCalledWith('Payment recorded and allocated');
  });

  test('generateDunning refreshes the overdue queue only', async () => {
    serviceMocks.ar.generateDunning.mockResolvedValue({ data: { generated: 1 } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useArMutations(), { wrapper });

    await act(async () => {
      await result.current.generateDunning.mutateAsync({ invoiceIds: ['invoice-1'], level: 1 });
    });

    expect(serviceMocks.ar.generateDunning).toHaveBeenCalledWith(
      { invoiceIds: ['invoice-1'], level: 1 },
      expect.objectContaining({ client: expect.any(QueryClient) }),
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'ar-overdue'] });
    expect(toastSuccess).toHaveBeenCalledWith('Dunning letters generated');
  });

  test('retrieveStatements refreshes bank and cash views after gateway retrieval', async () => {
    serviceMocks.bank.retrieve.mockResolvedValue({ data: { imported: 2 } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useBankMutations(), { wrapper });

    await act(async () => {
      await result.current.retrieveStatements.mutateAsync({ bankAccountId: 'bank-1' });
    });

    expect(serviceMocks.bank.retrieve).toHaveBeenCalledWith(
      { bankAccountId: 'bank-1' },
      expect.objectContaining({ client: expect.any(QueryClient) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'bank-transactions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'bank-accounts'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'cash-balances'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'cash-forecast'] });
    expect(toastSuccess).toHaveBeenCalledWith('Bank retrieval completed');
  });

  test('upsertExchangeRate refreshes FX rate queries', async () => {
    serviceMocks.exchangeRates.upsert.mockResolvedValue({ data: { _id: 'rate-1' } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useExchangeRateMutations(), { wrapper });

    await act(async () => {
      await result.current.upsertExchangeRate.mutateAsync({
        baseCurrency: 'CHF',
        quoteCurrency: 'EUR',
        rate: 0.95,
        rateDate: '2026-06-25',
      });
    });

    expect(serviceMocks.exchangeRates.upsert).toHaveBeenCalledWith(
      {
        baseCurrency: 'CHF',
        quoteCurrency: 'EUR',
        rate: 0.95,
        rateDate: '2026-06-25',
      },
      expect.objectContaining({ client: expect.any(QueryClient) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'exchange-rates'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'exchange-rate-resolve'] });
    expect(toastSuccess).toHaveBeenCalledWith('Exchange rate saved');
  });

  test('postFxRevaluation refreshes FX run, journal, dashboard, and financial report queries', async () => {
    serviceMocks.exchangeRates.postRevaluation.mockResolvedValue({ data: { runNumber: 'FXR-1' } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useExchangeRateMutations(), { wrapper });

    await act(async () => {
      await result.current.postFxRevaluation.mutateAsync({
        baseCurrency: 'CHF',
        revaluationDate: '2026-06-30',
      });
    });

    expect(serviceMocks.exchangeRates.postRevaluation).toHaveBeenCalledWith({
      baseCurrency: 'CHF',
      revaluationDate: '2026-06-30',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'fx-revaluation-preview'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'fx-revaluation-runs'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'journal'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'dashboard'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'balance-sheet'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'profit-loss'] });
    expect(toastSuccess).toHaveBeenCalledWith('FX revaluation posted');
  });

  test('createTaxCode refreshes tax management queries', async () => {
    serviceMocks.tax.createCode.mockResolvedValue({ data: { _id: 'tax-1' } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useTaxMutations(), { wrapper });

    await act(async () => {
      await result.current.createTaxCode.mutateAsync({
        code: 'VAT81',
        name: 'Swiss VAT',
        rate: 8.1,
      });
    });

    expect(serviceMocks.tax.createCode).toHaveBeenCalledWith(
      {
        code: 'VAT81',
        name: 'Swiss VAT',
        rate: 8.1,
      },
      expect.objectContaining({ client: expect.any(QueryClient) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'tax-codes'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'tax-summary'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'vat-report'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'tax-transactions'] });
    expect(toastSuccess).toHaveBeenCalledWith('Tax code created');
  });

  test('depreciateFixedAsset refreshes asset, dashboard, journal, and report queries', async () => {
    serviceMocks.fixedAssets.depreciate.mockResolvedValue({ data: { entry: { amount: 100 } } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useFixedAssetMutations(), { wrapper });

    await act(async () => {
      await result.current.depreciateFixedAsset.mutateAsync({
        id: 'asset-1',
        data: { periodDate: '2026-02-01' },
      });
    });

    expect(serviceMocks.fixedAssets.depreciate).toHaveBeenCalledWith(
      'asset-1',
      { periodDate: '2026-02-01' },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'fixed-assets'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'fixed-asset-summary'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'dashboard'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'journal'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'balance-sheet'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'profit-loss'] });
    expect(toastSuccess).toHaveBeenCalledWith('Depreciation posted');
  });

  test('approveBudget refreshes budget, dashboard, and financial report queries', async () => {
    serviceMocks.budgets.approve.mockResolvedValue({ data: { status: 'APPROVED' } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useBudgetMutations(), { wrapper });

    await act(async () => {
      await result.current.approveBudget.mutateAsync('budget-1');
    });

    expect(serviceMocks.budgets.approve).toHaveBeenCalledWith('budget-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'budgets'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'budget-summary'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'budget-variance'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'dashboard'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'profit-loss'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'balance-sheet'] });
    expect(toastSuccess).toHaveBeenCalledWith('Budget approved');
  });

  test('runRecurringTransaction refreshes recurring, dashboard, journal, AP, AR, and report queries', async () => {
    serviceMocks.recurring.run.mockResolvedValue({ data: { status: 'COMPLETED' } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useRecurringTransactionMutations(), { wrapper });

    await act(async () => {
      await result.current.runRecurringTransaction.mutateAsync({
        id: 'recurring-1',
        data: { runDate: '2026-01-31' },
      });
    });

    expect(serviceMocks.recurring.run).toHaveBeenCalledWith('recurring-1', { runDate: '2026-01-31' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'recurring-transactions'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'recurring-transaction-summary'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'recurring-transaction-runs'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'dashboard'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'journal'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'ap-invoices'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'ar-receivables'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'profit-loss'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'balance-sheet'] });
    expect(toastSuccess).toHaveBeenCalledWith('Recurring transaction executed');
  });

  test('confirmOcr refreshes document list and OCR result detail', async () => {
    serviceMocks.documents.confirmOcr.mockResolvedValue({ data: { status: 'CONFIRMED' } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useAccDocumentMutations(), { wrapper });

    await act(async () => {
      await result.current.confirmOcr.mutateAsync({
        id: 'doc-1',
        data: { correctedFields: { supplierName: 'Supplier AG' } },
      });
    });

    expect(serviceMocks.documents.confirmOcr).toHaveBeenCalledWith('doc-1', {
      correctedFields: { supplierName: 'Supplier AG' },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'documents'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'document-ocr-result'] });
    expect(toastSuccess).toHaveBeenCalledWith('OCR confirmed');
  });

  test('bulkAssignDocuments refreshes document archive state', async () => {
    serviceMocks.documents.bulkAssign.mockResolvedValue({ data: { assigned: 2 } });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useAccDocumentMutations(), { wrapper });

    await act(async () => {
      await result.current.bulkAssignDocuments.mutateAsync({
        documentIds: ['doc-1', 'doc-2'],
        userId: 'user-1',
        note: 'Review',
      });
    });

    expect(serviceMocks.documents.bulkAssign).toHaveBeenCalledWith(
      {
        documentIds: ['doc-1', 'doc-2'],
        userId: 'user-1',
        note: 'Review',
      },
      expect.objectContaining({ client: expect.any(QueryClient) }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounting', 'documents'] });
    expect(toastSuccess).toHaveBeenCalledWith('Document assigned');
  });
});
