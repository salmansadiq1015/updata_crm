import { getAccountingCurrency } from '../state/accounting-currency';
import { DEFAULT_ACCOUNTING_CURRENCY } from '../constants/accounting-constants';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function yearStart() {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

function yearEnd() {
  const now = new Date();
  return `${now.getFullYear()}-12-31`;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function defaultBudgetFilters() {
  return {
    status: 'ALL',
    currency: getAccountingCurrency(),
    search: '',
  };
}

export function defaultBudgetForm() {
  return {
    name: `Budget ${new Date().getFullYear()}`,
    description: '',
    startDate: yearStart(),
    endDate: yearEnd(),
    currency: getAccountingCurrency(),
    lines: [defaultBudgetLine()],
  };
}

export function defaultBudgetLine() {
  return {
    accountId: '',
    periodStart: todayInput(),
    periodEnd: todayInput(),
    amount: '0',
    notes: '',
  };
}

export function buildBudgetFilters(filters = {}) {
  return {
    status: filters.status && filters.status !== 'ALL' ? filters.status : undefined,
    currency: filters.currency || undefined,
    search: String(filters.search || '').trim() || undefined,
  };
}

export function buildBudgetPayload(form = {}) {
  return {
    name: String(form.name || '').trim(),
    description: String(form.description || '').trim(),
    startDate: form.startDate,
    endDate: form.endDate,
    currency: String(form.currency || DEFAULT_ACCOUNTING_CURRENCY).trim().toUpperCase(),
    lines: (form.lines || [])
      .filter((line) => line.accountId && Number(line.amount) >= 0)
      .map((line) => ({
        accountId: line.accountId,
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        amount: numberOrZero(line.amount),
        notes: String(line.notes || '').trim(),
      })),
  };
}

export function isBudgetFormValid(form = {}) {
  return Boolean(
    String(form.name || '').trim() &&
    form.startDate &&
    form.endDate &&
    (form.lines || []).some((line) => line.accountId && Number(line.amount) >= 0 && line.periodStart && line.periodEnd),
  );
}

export function budgetStatusClass(status) {
  const classes = {
    DRAFT: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    LOCKED: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    ARCHIVED: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  };
  return classes[status] || classes.DRAFT;
}
