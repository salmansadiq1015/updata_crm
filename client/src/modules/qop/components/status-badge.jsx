'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import {
  QUOTATION_STATUS_COLORS,
  QUOTATION_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  INVOICE_STATUS_LABELS,
  INVOICE_TYPE_LABELS,
} from '../constants/qop-constants';
import { cn } from '@/lib/utils';

function StatusBadge({ status, colorMap, labelMap, className }) {
  const { locale: language } = useLanguage();
  const label = labelMap?.[language]?.[status] ?? labelMap?.en?.[status] ?? status;
  const colors = colorMap?.[status] ?? 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        colors,
        className
      )}
    >
      {label}
    </span>
  );
}

export function QuotationStatusBadge({ status, className }) {
  return (
    <StatusBadge
      status={status}
      colorMap={QUOTATION_STATUS_COLORS}
      labelMap={QUOTATION_STATUS_LABELS}
      className={className}
    />
  );
}

export function OrderStatusBadge({ status, className }) {
  return (
    <StatusBadge
      status={status}
      colorMap={ORDER_STATUS_COLORS}
      labelMap={ORDER_STATUS_LABELS}
      className={className}
    />
  );
}

export function InvoiceStatusBadge({ status, className }) {
  return (
    <StatusBadge
      status={status}
      colorMap={INVOICE_STATUS_COLORS}
      labelMap={INVOICE_STATUS_LABELS}
      className={className}
    />
  );
}

export function InvoiceTypeBadge({ type, className }) {
  const { locale: language } = useLanguage();
  const label = INVOICE_TYPE_LABELS?.[language]?.[type] ?? INVOICE_TYPE_LABELS?.en?.[type] ?? type;
  const colorMap = {
    STANDARD: 'bg-slate-100 text-slate-700 border-slate-200',
    ADVANCE: 'bg-orange-50 text-orange-700 border-orange-200',
    FINAL: 'bg-violet-50 text-violet-700 border-violet-200',
    CREDIT_NOTE: 'bg-pink-50 text-pink-700 border-pink-200',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        colorMap[type] ?? 'bg-slate-100 text-slate-600 border-slate-200',
        className
      )}
    >
      {label}
    </span>
  );
}
