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
  // Account pickers request up to 500 options, while the existing API accepts
  // at most 100 per cursor page. Preserve the requested set without raising
  // the backend limit or silently truncating the available accounts.
  list: async (params = {}) => {
    const requested = Number(params.limit);
    if (!Number.isInteger(requested) || requested <= 100) {
      return apiClient.get(E.ACCOUNTS, { params });
    }
    const target = Math.floor(requested);
    const data = [];
    let cursor = params.cursor;
    let response;
    const seen = new Set(cursor ? [cursor] : []);
    while (data.length < target) {
      response = await apiClient.get(E.ACCOUNTS, {
        params: { ...params, limit: Math.min(100, target - data.length), ...(cursor ? { cursor } : {}) },
      });
      const rows = Array.isArray(response.data) ? response.data : [];
      data.push(...rows);
      const next = response.pagination?.nextCursor;
      if (!rows.length || !response.pagination?.hasNext || !next || seen.has(next)) break;
      seen.add(next);
      cursor = next;
    }
    return { ...response, data, pagination: { ...response.pagination, limit: target } };
  },
  tree:       ()            => apiClient.get(E.ACCOUNT_TREE),
  getById:    (id)          => apiClient.get(E.ACCOUNT_BY_ID(id)),
  create:     (data)        => apiClient.post(E.ACCOUNTS, data),
  update:     (id, data)    => apiClient.put(E.ACCOUNT_BY_ID(id), data),
  getBalance: (id)          => apiClient.get(E.ACCOUNT_BALANCE(id)),
  getOverview:(id, params = {}) => apiClient.get(E.ACCOUNT_OVERVIEW(id), { params }),
  exportOverview:(id, params = {}) => apiClient.get(E.ACCOUNT_OVERVIEW_EXPORT(id), { params, responseType: 'blob' }),
};

export const dashboardService = {
  snapshot: (params = {}) => apiClient.get(E.DASHBOARD, { params }),
};

// Suppliers are business-type CRM customers; the AP invoice form picks from them.
// Empty query -> default suggestions; a query filters server-side via `search`.
export const supplierService = {
  search: (query = '') => apiClient.get(ENDPOINTS.CRM.SUPPLIERS, {
    params: { ...(query ? { search: query } : {}), limit: 25 },
  }),
};

export const accountingEntityService = {
  list:       (params = {}) => apiClient.get(E.ENTITIES, { params }),
  getById:    (id)          => apiClient.get(E.ENTITY_BY_ID(id)),
  create:     (data)        => apiClient.post(E.ENTITIES, data),
  update:     (id, data)    => apiClient.put(E.ENTITY_BY_ID(id), data),
  activate:   (id)          => apiClient.post(E.ENTITY_ACTIVATE(id)),
  deactivate: (id)          => apiClient.post(E.ENTITY_DEACTIVATE(id)),
};

export const accountingSearchService = {
  search: (params = {}) => apiClient.get(E.SEARCH, { params }),
};

export const exchangeRateService = {
  list:    (params = {}) => apiClient.get(E.EXCHANGE_RATES, { params }),
  upsert:  (data)        => apiClient.post(E.EXCHANGE_RATES, data),
  resolve: (params = {}) => apiClient.get(E.EXCHANGE_RATE_RESOLVE, { params }),
  convert: (data)        => apiClient.post(E.EXCHANGE_RATE_CONVERT, data),
  revaluationPreview: (params = {}) => apiClient.get(E.FX_REVALUATION_PREVIEW, { params }),
  postRevaluation:    (data = {})   => apiClient.post(E.FX_REVALUATION_POST, data),
  revaluationRuns:    (params = {}) => apiClient.get(E.FX_REVALUATION_RUNS, { params }),
};

export const taxService = {
  codes:        (params = {}) => apiClient.get(E.TAX_CODES, { params }),
  createCode:   (data)        => apiClient.post(E.TAX_CODES, data),
  updateCode:   (id, data)    => apiClient.put(E.TAX_CODE_BY_ID(id), data),
  groups:       (params = {}) => apiClient.get(E.TAX_GROUPS, { params }),
  exemptions:   (params = {}) => apiClient.get(E.TAX_EXEMPTIONS, { params }),
  calculate:    (data)        => apiClient.post(E.TAX_CALCULATE, data),
  transactions: (params = {}) => apiClient.get(E.TAX_TRANSACTIONS, { params }),
  summary:      (params = {}) => apiClient.get(E.TAX_SUMMARY, { params }),
  vatReport:    (params = {}) => apiClient.get(E.TAX_VAT_REPORT, { params }),
};

export const fixedAssetService = {
  list:       (params = {}) => apiClient.get(E.FIXED_ASSETS, { params }),
  summary:    (params = {}) => apiClient.get(E.FIXED_ASSET_SUMMARY, { params }),
  getById:    (id)          => apiClient.get(E.FIXED_ASSET_BY_ID(id)),
  create:     (data)        => apiClient.post(E.FIXED_ASSETS, data),
  update:     (id, data)    => apiClient.put(E.FIXED_ASSET_BY_ID(id), data),
  activate:   (id, data = {}) => apiClient.post(E.FIXED_ASSET_ACTIVATE(id), data),
  depreciate: (id, data = {}) => apiClient.post(E.FIXED_ASSET_DEPRECIATE(id), data),
  dispose:    (id, data = {}) => apiClient.post(E.FIXED_ASSET_DISPOSE(id), data),
};

export const budgetService = {
  list:     (params = {}) => apiClient.get(E.BUDGETS, { params }),
  summary:  (params = {}) => apiClient.get(E.BUDGET_SUMMARY, { params }),
  getById:  (id)          => apiClient.get(E.BUDGET_BY_ID(id)),
  create:   (data)        => apiClient.post(E.BUDGETS, data),
  update:   (id, data)    => apiClient.put(E.BUDGET_BY_ID(id), data),
  approve:  (id)          => apiClient.post(E.BUDGET_APPROVE(id)),
  lock:     (id)          => apiClient.post(E.BUDGET_LOCK(id)),
  variance: (id)          => apiClient.get(E.BUDGET_VARIANCE(id)),
};

export const recurringTransactionService = {
  list:     (params = {}) => apiClient.get(E.RECURRING_TRANSACTIONS, { params }),
  summary:  ()            => apiClient.get(E.RECURRING_TRANSACTION_SUMMARY),
  runs:     (params = {}) => apiClient.get(E.RECURRING_TRANSACTION_RUNS, { params }),
  getById:  (id)          => apiClient.get(E.RECURRING_TRANSACTION_BY_ID(id)),
  create:   (data)        => apiClient.post(E.RECURRING_TRANSACTIONS, data),
  update:   (id, data)    => apiClient.put(E.RECURRING_TRANSACTION_BY_ID(id), data),
  activate: (id)          => apiClient.post(E.RECURRING_TRANSACTION_ACTIVATE(id)),
  pause:    (id)          => apiClient.post(E.RECURRING_TRANSACTION_PAUSE(id)),
  archive:  (id)          => apiClient.post(E.RECURRING_TRANSACTION_ARCHIVE(id)),
  run:      (id, data = {}) => apiClient.post(E.RECURRING_TRANSACTION_RUN(id), data),
  runDue:   (data = {})   => apiClient.post(E.RECURRING_TRANSACTION_RUN_DUE, data),
};

export const inventoryAccountingService = {
  valuation:    (params = {}) => apiClient.get(E.INVENTORY_VALUATION, { params }),
  movements:    (params = {}) => apiClient.get(E.INVENTORY_MOVEMENTS, { params }),
  entries:      (params = {}) => apiClient.get(E.INVENTORY_ENTRIES, { params }),
  postMovement: (movementId, data = {}) => apiClient.post(E.INVENTORY_POST_MOVEMENT(movementId), data),
  postPeriod:   (data = {})   => apiClient.post(E.INVENTORY_POST_PERIOD, data),
};

export const journalService = {
  list:    (params = {}) => apiClient.get(E.JOURNAL, { params }),
  getById: (id)          => apiClient.get(E.JOURNAL_BY_ID(id)),
  create:  (data)        => apiClient.post(E.JOURNAL, data),
  reverse: (id)          => apiClient.post(E.JOURNAL_REVERSE(id)),
  export:  (params = {}) => apiClient.post(E.JOURNAL_EXPORT, {}, { params, responseType: 'blob' }),
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
  paymentBatchById: (batchId)  => apiClient.get(E.AP_PAYMENT_BATCH_BY_ID(batchId)),
  exportPaymentBatch: (batchId) => apiClient.post(E.AP_PAYMENT_BATCH_EXPORT(batchId), {}, { responseType: 'blob' }),
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

export const reconciliationService = {
  run:          (data)        => apiClient.post(E.RECONCILIATION_RUN, data),
  report:       (params = {}) => apiClient.get(E.RECONCILIATION_REPORT, { params }),
  unmatched:    (params = {}) => apiClient.get(E.RECONCILIATION_UNMATCHED, { params }).then((r) => mapEnvelope(r, normalizeBankTransaction)),
  suggestions:  (txId)        => apiClient.get(E.RECONCILIATION_SUGGESTIONS(txId)),
  matchAr:      (data)        => apiClient.post(E.RECONCILIATION_MATCH_AR, data),
  matchAp:      (data)        => apiClient.post(E.RECONCILIATION_MATCH_AP, data),
  categorize:   (data)        => apiClient.post(E.RECONCILIATION_CATEGORIZE, data),
};

export const cashService = {
  balances:      ()            => apiClient.get(E.CASH_BALANCES),
  forecast:      (params = {}) => apiClient.get(E.CASH_FORECAST, { params }),
  manualBalance: (data)        => apiClient.post(E.CASH_MANUAL_BALANCE, data),
};

export const openItemsService = {
  list:        (params = {}) => apiClient.get(E.OPEN_ITEMS, { params }),
  aging:       (params = {}) => apiClient.get(E.OPEN_ITEMS_AGING, { params }),
  statement:   (entityId, params = {}, data = {}) => apiClient.post(E.OPEN_ITEMS_STATEMENT(entityId), data, { params }),
  netPosition: (entityId) => apiClient.post(E.OPEN_ITEMS_NET_POSITION(entityId)),
  netItems:    (data) => apiClient.post(E.OPEN_ITEMS_NETTING, data),
};

export const reportsService = {
  profitLoss:       (params = {}) => apiClient.get(E.PROFIT_LOSS, { params }),
  exportProfitLoss: (params = {}) => apiClient.get(E.PROFIT_LOSS_EXPORT, { params, responseType: 'blob' }),
  balanceSheet:     (params = {}) => apiClient.get(E.BALANCE_SHEET, { params }),
  trialBalance:     (params = {}) => apiClient.get(E.TRIAL_BALANCE, { params }),
  cashFlow:         (params = {}) => apiClient.get(E.CASH_FLOW_REPORT, { params }),
  generalLedger:    (params = {}) => apiClient.get(E.GENERAL_LEDGER, { params }),
};

export const fiscalPeriodService = {
  list:    (params = {}) => apiClient.get(E.FISCAL_PERIODS, { params }),
  getById: (id)          => apiClient.get(E.FISCAL_PERIOD_BY_ID(id)),
  create:  (data)        => apiClient.post(E.FISCAL_PERIODS, data),
  close:   (id, reason)  => apiClient.post(E.FISCAL_PERIOD_CLOSE(id), { reason }),
  reopen:  (id, reason)  => apiClient.post(E.FISCAL_PERIOD_REOPEN(id), { reason }),
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
  rejectOcr:     (id, data)    => apiClient.post(E.ACC_DOCUMENT_OCR_REJECT(id), data),
  assign:        (id, data)    => apiClient.post(E.ACC_DOCUMENT_ASSIGN(id), data),
  bulkAssign:    (data)        => apiClient.post(E.ACC_DOCUMENT_BULK_ASSIGN, data),
  bulkDownload:  (data)        => apiClient.post(E.ACC_DOCUMENT_BULK_DOWNLOAD, data, { responseType: 'blob' }),
};
