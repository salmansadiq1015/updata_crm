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
