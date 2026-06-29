import {
  DEFAULT_ACCOUNTING_CURRENCY,
  TAX_DIRECTIONS,
  TAX_SCOPES,
  TAX_TYPES,
} from '../constants/accounting-constants';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

export function defaultTaxCodeForm() {
  return {
    code: '',
    name: '',
    type: 'VAT',
    direction: 'BOTH',
    scope: 'STANDARD',
    country: 'CH',
    rate: '8.1',
    recoverablePercent: '100',
    validFrom: todayInput(),
    validTo: '',
    description: '',
    isActive: true,
  };
}

export function defaultTaxFilters() {
  const now = new Date();
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
    currency: DEFAULT_ACCOUNTING_CURRENCY,
  };
}

export function defaultTaxCalculationForm() {
  return {
    direction: 'INPUT',
    currency: DEFAULT_ACCOUNTING_CURRENCY,
    documentDate: todayInput(),
    lineTotal: '1000',
    vatRate: '8.1',
    taxCode: '',
  };
}

export function buildTaxCodePayload(form = {}) {
  return {
    code: String(form.code || '').trim().toUpperCase(),
    name: String(form.name || '').trim(),
    type: normalizeEnum(form.type, TAX_TYPES, 'VAT'),
    direction: normalizeEnum(form.direction, TAX_DIRECTIONS, 'BOTH'),
    scope: normalizeEnum(form.scope, TAX_SCOPES, 'STANDARD'),
    country: String(form.country || 'CH').trim().toUpperCase(),
    rate: Number(form.rate || 0),
    recoverablePercent: Number(form.recoverablePercent ?? 100),
    validFrom: form.validFrom,
    validTo: form.validTo || null,
    description: form.description || '',
    isActive: form.isActive !== false,
  };
}

export function isTaxCodeFormValid(form = {}) {
  return Boolean(
    String(form.code || '').trim() &&
    String(form.name || '').trim() &&
    form.validFrom &&
    Number(form.rate) >= 0 &&
    Number(form.rate) <= 100 &&
    Number(form.recoverablePercent) >= 0 &&
    Number(form.recoverablePercent) <= 100,
  );
}

export function buildTaxCalculationPayload(form = {}) {
  return {
    direction: normalizeEnum(form.direction, ['INPUT', 'OUTPUT', 'WITHHOLDING'], 'INPUT'),
    currency: String(form.currency || DEFAULT_ACCOUNTING_CURRENCY).trim().toUpperCase(),
    documentDate: form.documentDate,
    lineItems: [{
      position: 1,
      description: 'Manual tax calculation',
      lineTotal: Number(form.lineTotal || 0),
      vatRate: Number(form.vatRate || 0),
      taxCode: form.taxCode || undefined,
    }],
  };
}

export function isTaxCalculationFormValid(form = {}) {
  return Boolean(form.documentDate && Number(form.lineTotal) >= 0 && Number(form.vatRate) >= 0);
}

export function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('de-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })}%`;
}
