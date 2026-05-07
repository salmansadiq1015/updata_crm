import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
const E = ENDPOINTS.ACCOUNTING;

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
  list:          (params = {}) => apiClient.get(E.AP_INVOICES, { params }),
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
  receivables:    (params = {}) => apiClient.get(E.AR_RECEIVABLES, { params }),
  aging:          ()            => apiClient.get(E.AR_AGING),
  summary:        ()            => apiClient.get(E.AR_SUMMARY),
  export:         (params = {}) => apiClient.post(E.AR_EXPORT, params),
  writeOff:       (id, reason)  => apiClient.post(E.AR_WRITE_OFF(id), { reason }),
  payments:       (params = {}) => apiClient.get(E.AR_PAYMENTS, { params }),
  paymentById:    (id)          => apiClient.get(E.AR_PAYMENT_BY_ID(id)),
  recordPayment:  (data)        => apiClient.post(E.AR_PAYMENTS, data),
  allocatePayment:(id, data)    => apiClient.post(E.AR_PAYMENT_ALLOCATE(id), data),
  overdueList:    ()            => apiClient.get(E.AR_DUNNING_OVERDUE),
  generateDunning:(data)        => apiClient.post(E.AR_DUNNING_GENERATE, data),
  dunningTemplates:()           => apiClient.get(E.AR_DUNNING_TEMPLATES),
  updateDunningTemplate:(level, data) => apiClient.put(E.AR_DUNNING_TEMPLATE(level), data),
};

export const bankService = {
  list:           (params = {}) => apiClient.get(E.BANK_ACCOUNTS, { params }),
  getById:        (id)          => apiClient.get(E.BANK_ACCOUNT_BY_ID(id)),
  create:         (data)        => apiClient.post(E.BANK_ACCOUNTS, data),
  update:         (id, data)    => apiClient.put(E.BANK_ACCOUNT_BY_ID(id), data),
  transactions:   (params = {}) => apiClient.get(E.BANK_TRANSACTIONS, { params }),
  importStatement:(file)        => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post(E.BANK_IMPORT, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  retrieve:       (data)        => apiClient.post(E.BANK_RETRIEVE, data),
};

export const accDocService = {
  list:       (params = {}) => apiClient.get(E.ACC_DOCUMENTS, { params }),
  getById:    (id)          => apiClient.get(E.ACC_DOCUMENT_BY_ID(id)),
  upload:     (file, meta)  => {
    const fd = new FormData();
    fd.append('file', file);
    if (meta) Object.entries(meta).forEach(([k, v]) => fd.append(k, v));
    return apiClient.post(E.ACC_DOCUMENT_UPLOAD, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  download:      (id)          => apiClient.get(E.ACC_DOCUMENT_DOWNLOAD(id), { responseType: 'blob' }),
  triggerOcr:    (id)          => apiClient.post(E.ACC_DOCUMENT_OCR(id)),
  getOcrResult:  (id)          => apiClient.get(E.ACC_DOCUMENT_OCR_RESULT(id)),
  confirmOcr:    (id, data)    => apiClient.post(E.ACC_DOCUMENT_OCR_CONFIRM(id), data),
  assign:        (id, data)    => apiClient.post(E.ACC_DOCUMENT_ASSIGN(id), data),
  bulkAssign:    (data)        => apiClient.post(E.ACC_DOCUMENT_BULK_ASSIGN, data),
};
