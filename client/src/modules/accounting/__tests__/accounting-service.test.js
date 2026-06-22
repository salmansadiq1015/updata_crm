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
  arService,
  bankService,
} from '../services/accounting-service';

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
});
