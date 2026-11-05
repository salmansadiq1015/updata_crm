import { getAccountingCurrency } from '../state/accounting-currency';
export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function defaultRecurringFilters() {
  return {
    status: 'ACTIVE',
    transactionType: 'ALL',
    search: '',
  };
}

export function defaultTemplatePayload(type = 'JOURNAL') {
  if (type === 'AP_BILL') {
    return {
      supplierId: '',
      supplierName: '',
      supplierInvoiceNumber: 'RECURRING-{period}',
      paymentTermsDays: 30,
      currency: getAccountingCurrency(),
      lineItems: [
        { position: 1, description: '', quantity: 1, unitPrice: 0, vatRate: 0 },
      ],
    };
  }

  if (type === 'AR_INVOICE') {
    return {
      customerId: '',
      customerName: '',
      title: 'Recurring invoice {period}',
      paymentTermsDays: 30,
      currency: getAccountingCurrency(),
      lineItems: [
        { position: 1, description: '', unit: 'pcs', quantity: 1, unitPrice: 0, vatRate: 0 },
      ],
    };
  }

  return {
    description: 'Recurring journal {period}',
    debitAccountId: '',
    creditAccountId: '',
    amount: 0,
    currency: getAccountingCurrency(),
  };
}

export function defaultRecurringForm(type = 'JOURNAL') {
  return {
    name: '',
    description: '',
    transactionType: type,
    frequency: 'MONTHLY',
    interval: '1',
    startDate: todayDate(),
    nextRunDate: todayDate(),
    endDate: '',
    maxRuns: '',
    timezone: 'UTC',
    templatePayloadText: JSON.stringify(defaultTemplatePayload(type), null, 2),
  };
}

export function buildRecurringFilters(filters = {}) {
  const params = {};
  if (filters.status && filters.status !== 'ALL') params.status = filters.status;
  if (filters.transactionType && filters.transactionType !== 'ALL') params.transactionType = filters.transactionType;
  if (filters.search) params.search = filters.search.trim();
  return params;
}

export function parseTemplatePayload(text) {
  const parsed = JSON.parse(text || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Template payload must be an object');
  }
  return parsed;
}

export function buildRecurringPayload(form) {
  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
    transactionType: form.transactionType,
    frequency: form.frequency,
    interval: Number(form.interval || 1),
    startDate: form.startDate,
    nextRunDate: form.nextRunDate || form.startDate,
    timezone: form.timezone || 'UTC',
    templatePayload: parseTemplatePayload(form.templatePayloadText),
  };

  if (form.endDate) payload.endDate = form.endDate;
  if (form.maxRuns) payload.maxRuns = Number(form.maxRuns);
  return payload;
}

export function isRecurringFormValid(form) {
  if (!form.name.trim() || !form.transactionType || !form.frequency || !form.startDate) return false;
  if (!(Number(form.interval || 0) >= 1)) return false;
  if (form.maxRuns && !(Number(form.maxRuns) >= 1)) return false;
  try {
    parseTemplatePayload(form.templatePayloadText);
    return true;
  } catch {
    return false;
  }
}

export function recurringStatusClass(status) {
  const classes = {
    DRAFT: 'bg-slate-500/15 text-slate-100 border-slate-300/20',
    ACTIVE: 'bg-emerald-500/15 text-emerald-100 border-emerald-300/20',
    PAUSED: 'bg-amber-500/15 text-amber-100 border-amber-300/20',
    COMPLETED: 'bg-sky-500/15 text-sky-100 border-sky-300/20',
    ARCHIVED: 'bg-zinc-500/15 text-zinc-100 border-zinc-300/20',
  };
  return classes[status] || classes.DRAFT;
}

export function recurringTypeLabel(type) {
  const labels = {
    JOURNAL: 'Journal',
    AP_BILL: 'AP bill',
    AR_INVOICE: 'Sales invoice',
  };
  return labels[type] || type;
}
