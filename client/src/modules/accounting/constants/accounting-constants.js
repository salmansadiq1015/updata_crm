import { CURRENCY_CODES } from '@/shared/data/currencies';
export const RECONCILIATION_STATUSES = ['UNMATCHED', 'AUTO_MATCHED', 'MANUALLY_MATCHED', 'CATEGORIZED'];

export const ACCOUNTING_CURRENCIES = CURRENCY_CODES;
export const DEFAULT_ACCOUNTING_CURRENCY = 'CHF';
export const ACCOUNTING_ENTITY_TYPES = ['COMPANY', 'BRANCH'];
export const ACCOUNTING_ENTITY_STATUSES = ['ACTIVE', 'INACTIVE'];
export const EXCHANGE_RATE_SOURCES = ['MANUAL', 'SNB', 'ECB', 'OPEN_BANKING', 'IMPORT', 'API'];
export const TAX_TYPES = ['VAT', 'GST', 'WITHHOLDING'];
export const TAX_DIRECTIONS = ['BOTH', 'INPUT', 'OUTPUT', 'WITHHOLDING'];
export const TAX_SCOPES = ['STANDARD', 'REDUCED', 'ZERO', 'EXEMPT', 'REVERSE_CHARGE', 'WITHHOLDING'];
export const FIXED_ASSET_STATUSES = ['DRAFT', 'ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED'];
export const FIXED_ASSET_METHODS = ['STRAIGHT_LINE'];
export const BUDGET_STATUSES = ['DRAFT', 'APPROVED', 'LOCKED', 'ARCHIVED'];
export const RECURRING_TRANSACTION_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];
export const RECURRING_TRANSACTION_TYPES = ['JOURNAL', 'AP_BILL', 'AR_INVOICE'];
export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
export const INVENTORY_COSTING_METHODS = ['WEIGHTED_AVERAGE', 'FIFO', 'LIFO'];

export const RECONCILIATION_STATUS_CONFIG = {
  UNMATCHED:       { label: 'Nicht abgeglichen', labelEn: 'Unmatched',       badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-500' },
  AUTO_MATCHED:    { label: 'Auto abgeglichen',  labelEn: 'Auto Matched',    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  MANUALLY_MATCHED:{ label: 'Manuell abgeglichen', labelEn: 'Manually Matched', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
  CATEGORIZED:     { label: 'Kategorisiert',    labelEn: 'Categorized',      badge: 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400', dot: 'bg-brand-500' },
};
