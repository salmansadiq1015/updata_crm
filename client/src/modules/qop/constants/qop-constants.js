export const QUOTATION_STATUSES = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  VIEWED: 'VIEWED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  CONVERTED: 'CONVERTED',
};

export const ORDER_STATUSES = {
  CONFIRMED: 'CONFIRMED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const INVOICE_STATUSES = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  WRITTEN_OFF: 'WRITTEN_OFF',
};

export const INVOICE_TYPES = {
  STANDARD: 'STANDARD',
  ADVANCE: 'ADVANCE',
  FINAL: 'FINAL',
  CREDIT_NOTE: 'CREDIT_NOTE',
};

export const VAT_RATES = [
  { value: 8.1, label: '8.1% (Standard)' },
  { value: 2.6, label: '2.6% (Reduziert)' },
  { value: 0,   label: '0% (Befreit)' },
];

export const CURRENCIES = [
  { value: 'CHF', label: 'CHF' },
  { value: 'EUR', label: 'EUR' },
];

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Banküberweisung' },
  { value: 'cash',          label: 'Bar' },
  { value: 'card',          label: 'Karte' },
  { value: 'other',         label: 'Sonstiges' },
];

export const QUOTATION_STATUS_COLORS = {
  DRAFT:     'bg-slate-100 text-slate-700 border-slate-200',
  SENT:      'bg-blue-50 text-blue-700 border-blue-200',
  VIEWED:    'bg-purple-50 text-purple-700 border-purple-200',
  ACCEPTED:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  DECLINED:  'bg-red-50 text-red-700 border-red-200',
  EXPIRED:   'bg-amber-50 text-amber-700 border-amber-200',
  CANCELLED: 'bg-slate-50 text-slate-500 border-slate-200',
  CONVERTED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

export const ORDER_STATUS_COLORS = {
  CONFIRMED:   'bg-blue-50 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED:   'bg-slate-50 text-slate-500 border-slate-200',
};

export const INVOICE_STATUS_COLORS = {
  DRAFT:          'bg-slate-100 text-slate-700 border-slate-200',
  SENT:           'bg-blue-50 text-blue-700 border-blue-200',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID:           'bg-emerald-50 text-emerald-700 border-emerald-200',
  OVERDUE:        'bg-red-50 text-red-700 border-red-200',
  CANCELLED:      'bg-slate-50 text-slate-500 border-slate-200',
  WRITTEN_OFF:    'bg-zinc-100 text-zinc-700 border-zinc-200',
};

export const QUOTATION_STATUS_LABELS = {
  de: {
    DRAFT: 'Entwurf', SENT: 'Gesendet', VIEWED: 'Gesehen', ACCEPTED: 'Angenommen',
    DECLINED: 'Abgelehnt', EXPIRED: 'Abgelaufen', CANCELLED: 'Storniert', CONVERTED: 'Konvertiert',
  },
  en: {
    DRAFT: 'Draft', SENT: 'Sent', VIEWED: 'Viewed', ACCEPTED: 'Accepted',
    DECLINED: 'Declined', EXPIRED: 'Expired', CANCELLED: 'Cancelled', CONVERTED: 'Converted',
  },
};

export const ORDER_STATUS_LABELS = {
  de: {
    CONFIRMED: 'Bestätigt', IN_PROGRESS: 'In Bearbeitung',
    COMPLETED: 'Abgeschlossen', CANCELLED: 'Storniert',
  },
  en: {
    CONFIRMED: 'Confirmed', IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed', CANCELLED: 'Cancelled',
  },
};

export const INVOICE_STATUS_LABELS = {
  de: {
    DRAFT: 'Entwurf', SENT: 'Gesendet', PARTIALLY_PAID: 'Teilzahlung',
    PAID: 'Bezahlt', OVERDUE: 'Überfällig', CANCELLED: 'Storniert',
  },
  en: {
    DRAFT: 'Draft', SENT: 'Sent', PARTIALLY_PAID: 'Partially Paid',
    PAID: 'Paid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled',
  },
};

INVOICE_STATUS_LABELS.de.WRITTEN_OFF = 'Abgeschrieben';
INVOICE_STATUS_LABELS.en.WRITTEN_OFF = 'Written Off';

export const INVOICE_TYPE_LABELS = {
  de: { STANDARD: 'Rechnung', ADVANCE: 'Akontorechnung', FINAL: 'Schlussrechnung', CREDIT_NOTE: 'Gutschrift' },
  en: { STANDARD: 'Invoice', ADVANCE: 'Advance Invoice', FINAL: 'Final Invoice', CREDIT_NOTE: 'Credit Note' },
};

export const DEFAULT_VALIDITY_DAYS = 30;

export const VALID_QUOTATION_TRANSITIONS = {
  DRAFT:     ['SENT', 'CANCELLED'],
  SENT:      ['VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  VIEWED:    ['ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED:  ['CONVERTED'],
  EXPIRED:   ['SENT'],
  DECLINED:  [],
  CANCELLED: [],
  CONVERTED: [],
};
