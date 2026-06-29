import {
  ACCOUNTING_CURRENCIES,
  DEFAULT_ACCOUNTING_CURRENCY,
  EXCHANGE_RATE_SOURCES,
} from '../constants/accounting-constants';

const DEFAULT_QUOTE_CURRENCY = 'EUR';
const DEFAULT_CONVERSION_AMOUNT = '1000';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeCurrency(value, fallback = DEFAULT_ACCOUNTING_CURRENCY) {
  const normalized = String(value || '').trim().toUpperCase();
  return ACCOUNTING_CURRENCIES.includes(normalized) ? normalized : fallback;
}

function normalizeSource(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return EXCHANGE_RATE_SOURCES.includes(normalized) ? normalized : 'MANUAL';
}

export function defaultExchangeRateForm() {
  return {
    baseCurrency: DEFAULT_ACCOUNTING_CURRENCY,
    quoteCurrency: DEFAULT_QUOTE_CURRENCY,
    rate: '',
    rateDate: todayInput(),
    source: 'MANUAL',
    note: '',
  };
}

export function defaultExchangeRateFilters() {
  return {
    baseCurrency: DEFAULT_ACCOUNTING_CURRENCY,
    quoteCurrency: 'ALL',
    startDate: '',
    endDate: '',
  };
}

export function defaultConversionForm() {
  return {
    amount: DEFAULT_CONVERSION_AMOUNT,
    fromCurrency: DEFAULT_ACCOUNTING_CURRENCY,
    toCurrency: DEFAULT_QUOTE_CURRENCY,
    asOfDate: todayInput(),
  };
}

export function defaultFxRevaluationForm() {
  return {
    baseCurrency: DEFAULT_ACCOUNTING_CURRENCY,
    revaluationDate: todayInput(),
    sourceTypes: ['AR_INVOICE', 'AP_BILL'],
  };
}

export function buildExchangeRateFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries({
      baseCurrency: filters.baseCurrency !== 'ALL' ? normalizeCurrency(filters.baseCurrency) : undefined,
      quoteCurrency: filters.quoteCurrency !== 'ALL' ? normalizeCurrency(filters.quoteCurrency, DEFAULT_QUOTE_CURRENCY) : undefined,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      limit: 250,
    }).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export function buildExchangeRatePayload(form = {}) {
  return {
    baseCurrency: normalizeCurrency(form.baseCurrency),
    quoteCurrency: normalizeCurrency(form.quoteCurrency, DEFAULT_QUOTE_CURRENCY),
    rate: Number(form.rate),
    rateDate: form.rateDate,
    source: normalizeSource(form.source),
    note: form.note || '',
  };
}

export function buildConversionPayload(form = {}) {
  return {
    amount: Number(form.amount),
    fromCurrency: normalizeCurrency(form.fromCurrency),
    toCurrency: normalizeCurrency(form.toCurrency, DEFAULT_QUOTE_CURRENCY),
    asOfDate: form.asOfDate,
  };
}

export function buildFxRevaluationPayload(form = {}) {
  return {
    baseCurrency: normalizeCurrency(form.baseCurrency),
    revaluationDate: form.revaluationDate,
    sourceTypes: form.sourceTypes?.length ? form.sourceTypes : ['AR_INVOICE', 'AP_BILL'],
  };
}

export function isExchangeRateFormValid(form = {}) {
  return Boolean(
    form.rateDate &&
    Number(form.rate) > 0 &&
    normalizeCurrency(form.baseCurrency) !== normalizeCurrency(form.quoteCurrency, DEFAULT_QUOTE_CURRENCY),
  );
}

export function isConversionFormValid(form = {}) {
  return Boolean(
    form.asOfDate &&
    Number(form.amount) >= 0 &&
    normalizeCurrency(form.fromCurrency) !== normalizeCurrency(form.toCurrency, DEFAULT_QUOTE_CURRENCY),
  );
}

export function isFxRevaluationFormValid(form = {}) {
  return Boolean(form.revaluationDate && form.baseCurrency && form.sourceTypes?.length);
}

export function formatExchangeRate(rate) {
  return Number(rate || 0).toLocaleString('de-CH', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 10,
  });
}
