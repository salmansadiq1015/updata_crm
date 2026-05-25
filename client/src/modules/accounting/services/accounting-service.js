import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.ACCOUNTING;

function mapEnvelope(response, mapper) {
  if (!response || typeof response !== 'object') return response;
  if (Array.isArray(response.data)) {
    return { ...response, data: response.data.map(mapper) };
  }
  if (response.data && typeof response.data === 'object') {
    return { ...response, data: mapper(response.data) };
  }
  return response;
}

function flattenGroupedInvoices(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).flatMap((group) => (Array.isArray(group) ? group : []));
}

function normalizeArReceivable(invoice = {}) {
  const outstandingAmount = invoice.outstandingAmount ?? invoice.amountDue ?? 0;
  const totalAmount = invoice.totalAmount ?? invoice.grandTotalRounded ?? invoice.grandTotal ?? invoice.totalGross ?? 0;
  return {
    ...invoice,
    totalAmount,
    outstandingAmount,
    displayStatus: invoice.status === 'SENT' ? 'OPEN' : invoice.status,
  };
}

function normalizeApInvoice(invoice = {}) {
  return {
    ...invoice,
    totalAmount: invoice.totalAmount ?? 0,
    outstandingAmount: invoice.outstandingAmount ?? 0,
  };
}

function normalizeBankAccount(account = {}) {
  return {
    ...account,
    displayName: account.name || account.bankName || account.iban,
    currentBalance: account.currentBalance ?? account.openingBalance ?? 0,
  };
}

function normalizeBankTransaction(transaction = {}) {
  return {
    ...transaction,
    description: transaction.description || transaction.bookingText || transaction.payerPayeeName || '',
    bookingDate: transaction.bookingDate || transaction.transactionDate,
  };
}

export const chartService = {
  list:       (params = {}) => apiClient.get(E.ACCOUNTS, { params }),
  getById:    (id)          => apiClient.get(E.ACCOUNT_BY_ID(id)),
  create:     (data)        => apiClient.post(E.ACCOUNTS, data),
  update:     (id, data)    => apiClient.put(E.ACCOUNT_BY_ID(id), data),
  getBalance: (id)          => apiClient.get(E.ACCOUNT_BALANCE(id)),
};

export const journalService = {
  list:    (params = {}) => apiClient.get(E.JOURNAL, { params }),
  getById: (id)          => apiClient.get(E.JOURNAL_BY_ID(id)),
  create:  (data)        => apiClient.post(E.JOURNAL, data),
  reverse: (id)          => apiClient.post(E.JOURNAL_REVERSE(id)),
  export:  (params = {}) => apiClient.post(E.JOURNAL_EXPORT, params),
};

export const apService = {
  list:          (params = {}) => apiClient.get(E.AP_INVOICES, { params }).then((r) => mapEnvelope(r, normalizeApInvoice)),
  getById:       (id)          => apiClient.get(E.AP_INVOICE_BY_ID(id)),
  create:        (data)        => apiClient.post(E.AP_INVOICES, data),
  update:        (id, data)    => apiClient.put(E.AP_INVOICE_BY_ID(id), data),
  openPayables:  ()            => apiClient.get(E.AP_OPEN_PAYABLES),
  aging:         ()            => apiClient.get(E.AP_AGING),
  summary:       ()            => apiClient.get(E.AP_SUMMARY),
  approve:       (id)          => apiClient.post(E.AP_APPROVE(id)),
  secondApprove: (id)          => apiClient.post(E.AP_SECOND_APPROVE(id)),
  dispute:       (id, reason)  => apiClient.post(E.AP_DISPUTE(id), { reason }),
  paymentBatch:  (data)        => apiClient.post(E.AP_PAYMENT_BATCH, data),
};

export const arService = {
  receivables:    (params = {}) => apiClient.get(E.AR_RECEIVABLES, { params }).then((r) => mapEnvelope(r, normalizeArReceivable)),
  aging:          ()            => apiClient.get(E.AR_AGING),
  summary:        ()            => apiClient.get(E.AR_SUMMARY),
  export:         (params = {}) => apiClient.post(E.AR_EXPORT, params),
  writeOff:       (id, reason)  => apiClient.post(E.AR_WRITE_OFF(id), { reason }),
  payments:       (params = {}) => apiClient.get(E.AR_PAYMENTS, { params }),
  paymentById:    (id)          => apiClient.get(E.AR_PAYMENT_BY_ID(id)),
  recordPayment:  (data)        => apiClient.post(E.AR_PAYMENTS, data),
  recordAndAllocateInvoicePayment: async ({ invoice, amount, paymentReference, bankAccountId }) => {
    const payment = await apiClient.post(E.AR_PAYMENTS, {
      paymentDate: new Date().toISOString(),
      amount: Number(amount),
      customerId: invoice.customerId,
      paymentReference: paymentReference || invoice.invoiceNumber,
      bankAccountId: bankAccountId || undefined,
      source: 'MANUAL',
    });
    await apiClient.post(E.AR_PAYMENT_ALLOCATE(payment.data._id), {
      allocations: [{ invoiceId: invoice._id, amount: Number(amount) }],
    });
    return payment;
  },
  allocatePayment:(id, data)    => apiClient.post(E.AR_PAYMENT_ALLOCATE(id), data),
  overdueList:    ()            => apiClient.get(E.AR_DUNNING_OVERDUE).then((r) => ({
    ...r,
    data: flattenGroupedInvoices(r.data).map(normalizeArReceivable),
  })),
  generateDunning:(data)        => apiClient.post(E.AR_DUNNING_GENERATE, data),
  dunningTemplates:()           => apiClient.get(E.AR_DUNNING_TEMPLATES),
  updateDunningTemplate:(level, data) => apiClient.put(E.AR_DUNNING_TEMPLATE(level), data),
};

export const bankService = {
  list:           (params = {}) => apiClient.get(E.BANK_ACCOUNTS, { params }).then((r) => mapEnvelope(r, normalizeBankAccount)),
  getById:        (id)          => apiClient.get(E.BANK_ACCOUNT_BY_ID(id)),
  create:         (data)        => apiClient.post(E.BANK_ACCOUNTS, data),
  update:         (id, data)    => apiClient.put(E.BANK_ACCOUNT_BY_ID(id), data),
  transactions:   (params = {}) => apiClient.get(E.BANK_TRANSACTIONS, { params }).then((r) => mapEnvelope(r, normalizeBankTransaction)),
  importStatement:(payload)     => {
    const file = payload?.file || payload;
    const fd = new FormData();
    fd.append('file', file);
    if (payload?.bankAccountId) fd.append('bankAccountId', payload.bankAccountId);
    if (payload?.format) fd.append('format', payload.format);
    return apiClient.post(E.BANK_IMPORT, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importPaymentStatus:(file)    => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post(E.BANK_PAYMENT_STATUS_IMPORT, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  retrieve:       (data)        => apiClient.post(E.BANK_RETRIEVE, data),
};

export const accDocService = {
  list:       (params = {}) => apiClient.get(E.ACC_DOCUMENTS, { params }),
  getById:    (id)          => apiClient.get(E.ACC_DOCUMENT_BY_ID(id)),
  upload:     (file, meta)  => {
    const fd = new FormData();
    fd.append('file', file);
    if (meta) {
      Object.entries(meta).forEach(([k, v]) => {
        if (v != null && v !== '') fd.append(k, v);
      });
    }
    return apiClient.post(E.ACC_DOCUMENT_UPLOAD, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  download:      (id)          => apiClient.get(E.ACC_DOCUMENT_DOWNLOAD(id), { responseType: 'blob' }),
  triggerOcr:    (id)          => apiClient.post(E.ACC_DOCUMENT_OCR(id)),
  getOcrResult:  (id)          => apiClient.get(E.ACC_DOCUMENT_OCR_RESULT(id)),
  confirmOcr:    (id, data)    => apiClient.post(E.ACC_DOCUMENT_OCR_CONFIRM(id), data),
  assign:        (id, data)    => apiClient.post(E.ACC_DOCUMENT_ASSIGN(id), data),
  bulkAssign:    (data)        => apiClient.post(E.ACC_DOCUMENT_BULK_ASSIGN, data),
};
