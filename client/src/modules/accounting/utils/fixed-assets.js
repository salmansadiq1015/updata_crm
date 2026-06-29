import {
  DEFAULT_ACCOUNTING_CURRENCY,
  FIXED_ASSET_METHODS,
} from '../constants/accounting-constants';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMethod(value) {
  const method = String(value || '').trim().toUpperCase();
  return FIXED_ASSET_METHODS.includes(method) ? method : 'STRAIGHT_LINE';
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function defaultFixedAssetFilters() {
  return {
    status: 'ALL',
    currency: DEFAULT_ACCOUNTING_CURRENCY,
    search: '',
  };
}

export function defaultFixedAssetForm() {
  return {
    name: '',
    category: 'Equipment',
    description: '',
    acquisitionDate: todayInput(),
    placedInServiceDate: '',
    currency: DEFAULT_ACCOUNTING_CURRENCY,
    acquisitionCost: '1000',
    salvageValue: '0',
    usefulLifeMonths: '60',
    depreciationMethod: 'STRAIGHT_LINE',
  };
}

export function defaultDepreciationForm() {
  return {
    periodDate: todayInput(),
  };
}

export function defaultDisposalForm() {
  return {
    disposalDate: todayInput(),
    proceeds: '0',
  };
}

export function buildFixedAssetFilters(filters = {}) {
  return {
    status: filters.status && filters.status !== 'ALL' ? filters.status : undefined,
    currency: filters.currency || undefined,
    search: String(filters.search || '').trim() || undefined,
  };
}

export function buildFixedAssetPayload(form = {}) {
  return {
    name: String(form.name || '').trim(),
    category: String(form.category || 'Equipment').trim(),
    description: String(form.description || '').trim(),
    acquisitionDate: form.acquisitionDate,
    placedInServiceDate: form.placedInServiceDate || null,
    currency: String(form.currency || DEFAULT_ACCOUNTING_CURRENCY).trim().toUpperCase(),
    acquisitionCost: numberOrZero(form.acquisitionCost),
    salvageValue: numberOrZero(form.salvageValue),
    usefulLifeMonths: Number(form.usefulLifeMonths || 1),
    depreciationMethod: normalizeMethod(form.depreciationMethod),
  };
}

export function isFixedAssetFormValid(form = {}) {
  const cost = Number(form.acquisitionCost);
  const salvage = Number(form.salvageValue || 0);
  return Boolean(
    String(form.name || '').trim() &&
    form.acquisitionDate &&
    cost > 0 &&
    salvage >= 0 &&
    salvage <= cost &&
    Number(form.usefulLifeMonths) >= 1,
  );
}

export function buildDepreciationPayload(form = {}) {
  return {
    periodDate: form.periodDate,
  };
}

export function buildDisposalPayload(form = {}) {
  return {
    disposalDate: form.disposalDate,
    proceeds: numberOrZero(form.proceeds),
  };
}

export function statusBadgeClass(status) {
  const classes = {
    DRAFT: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    FULLY_DEPRECIATED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    DISPOSED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  };
  return classes[status] || classes.DRAFT;
}
