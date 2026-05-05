export const QUOTATION_STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CONVERTED'];
export const ORDER_STATUSES = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'];
export const INVOICE_TYPES = ['STANDARD', 'ADVANCE', 'FINAL', 'CREDIT_NOTE'];
export const LINE_ITEM_TYPES = ['service', 'material', 'text', 'subtotal', 'optional'];

export const QUOTATION_STATUS_CONFIG = {
  DRAFT:     { label: 'Entwurf',    labelEn: 'Draft',     badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', dot: 'bg-slate-400' },
  SENT:      { label: 'Versendet',  labelEn: 'Sent',      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
  VIEWED:    { label: 'Angesehen',  labelEn: 'Viewed',    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', dot: 'bg-violet-500' },
  ACCEPTED:  { label: 'Angenommen', labelEn: 'Accepted',  badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  DECLINED:  { label: 'Abgelehnt', labelEn: 'Declined',  badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500' },
  EXPIRED:   { label: 'Abgelaufen', labelEn: 'Expired',   badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-500' },
  CANCELLED: { label: 'Storniert',  labelEn: 'Cancelled', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500', dot: 'bg-slate-400' },
  CONVERTED: { label: 'Auftragserteilung', labelEn: 'Converted', badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400', dot: 'bg-teal-500' },
};

export const ORDER_STATUS_CONFIG = {
  CONFIRMED:   { label: 'Bestätigt',    labelEn: 'Confirmed',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
  IN_PROGRESS: { label: 'In Bearbeitung', labelEn: 'In Progress', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dot: 'bg-amber-500' },
  COMPLETED:   { label: 'Abgeschlossen', labelEn: 'Completed',  badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  CANCELLED:   { label: 'Storniert',    labelEn: 'Cancelled',   badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500', dot: 'bg-slate-400' },
};

export const INVOICE_STATUS_CONFIG = {
  DRAFT:          { label: 'Entwurf',         labelEn: 'Draft',          badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', dot: 'bg-slate-400' },
  SENT:           { label: 'Versendet',        labelEn: 'Sent',           badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
  PARTIALLY_PAID: { label: 'Teilzahlung',      labelEn: 'Partially Paid', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', dot: 'bg-violet-500' },
  PAID:           { label: 'Bezahlt',          labelEn: 'Paid',           badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  OVERDUE:        { label: 'Überfällig',       labelEn: 'Overdue',        badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500' },
  CANCELLED:      { label: 'Storniert',        labelEn: 'Cancelled',      badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500', dot: 'bg-slate-400' },
};
