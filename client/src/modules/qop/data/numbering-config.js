import {
  ClipboardList,
  FileText,
  ReceiptText,
} from 'lucide-react';

export const NUMBERING_LIMITS = Object.freeze({
  prefixMaxLength: 10,
  separatorMaxLength: 3,
  paddingMin: 1,
  paddingMax: 8,
  defaultPadding: 4,
  defaultSeparator: '-',
  defaultYearFormat: 'YYYY',
});

export const NUMBERING_TYPES = Object.freeze([
  {
    id: 'quotation',
    icon: FileText,
    labelKey: 'numbering.type.quotation',
    fallback: 'Quotations',
    descriptionKey: 'numbering.type.quotationDesc',
    description: 'Quote numbers used before an order is accepted.',
    accent: 'violet',
  },
  {
    id: 'order',
    icon: ClipboardList,
    labelKey: 'numbering.type.order',
    fallback: 'Orders',
    descriptionKey: 'numbering.type.orderDesc',
    description: 'Operational order numbers for confirmed work.',
    accent: 'cyan',
  },
  {
    id: 'invoice',
    icon: ReceiptText,
    labelKey: 'numbering.type.invoice',
    fallback: 'Invoices',
    descriptionKey: 'numbering.type.invoiceDesc',
    description: 'Invoice numbers issued to customers and accounting.',
    accent: 'emerald',
  },
]);

export const YEAR_FORMAT_OPTIONS = Object.freeze([
  {
    value: 'YYYY',
    labelKey: 'numbering.year.yyyy',
    fallback: 'YYYY (2026)',
  },
  {
    value: 'YY',
    labelKey: 'numbering.year.yy',
    fallback: 'YY (26)',
  },
  {
    value: 'none',
    labelKey: 'numbering.year.none',
    fallback: 'No year',
  },
]);

export const NUMBERING_ACCENTS = Object.freeze({
  violet: {
    icon: 'border-violet-300/25 bg-violet-300/12 text-violet-100 shadow-[0_0_34px_rgba(167,139,250,0.16)]',
    line: 'from-violet-300/80 via-violet-300/20 to-transparent',
    chip: 'border-violet-300/25 bg-violet-300/10 text-violet-100',
    glow: 'group-hover:shadow-[0_22px_70px_rgba(139,92,246,0.22)]',
  },
  cyan: {
    icon: 'border-cyan-300/25 bg-cyan-300/12 text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,0.16)]',
    line: 'from-cyan-300/80 via-cyan-300/20 to-transparent',
    chip: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
    glow: 'group-hover:shadow-[0_22px_70px_rgba(34,211,238,0.18)]',
  },
  emerald: {
    icon: 'border-emerald-300/25 bg-emerald-300/12 text-emerald-100 shadow-[0_0_34px_rgba(52,211,153,0.14)]',
    line: 'from-emerald-300/80 via-emerald-300/20 to-transparent',
    chip: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
    glow: 'group-hover:shadow-[0_22px_70px_rgba(52,211,153,0.16)]',
  },
});
