export const BUILT_IN_TEMPLATE_TYPES = [
  ['quotation', 'doctpl.type.quotation'],
  ['order_confirmation', 'doctpl.type.order_confirmation'],
  ['invoice_standard', 'doctpl.type.invoice_standard'],
  ['invoice_advance', 'doctpl.type.invoice_advance'],
  ['invoice_final', 'doctpl.type.invoice_final'],
  ['cover_letter', 'doctpl.type.cover_letter'],
  ['service_report', 'doctpl.type.service_report'],
  ['inspection_certificate', 'doctpl.type.inspection_certificate'],
  ['project_appointment_confirmation', 'doctpl.type.project_appointment_confirmation'],
  ['project_status_report', 'doctpl.type.project_status_report'],
  ['project_completion_certificate', 'doctpl.type.project_completion_certificate'],
];

export const TEMPLATE_TYPE_PATTERN = /^[a-z][a-z0-9_-]{1,79}$/;

const LANGUAGES = ['de', 'fr', 'it', 'en'];

const DEFAULT_FOOTERS = {
  de: 'MB Boiler & Heizung AG | CHE-000.000.000 MWST',
  fr: 'MB Boiler & Heizung AG | CHE-000.000.000 TVA',
  it: 'MB Boiler & Heizung AG | CHE-000.000.000 IVA',
  en: 'MB Boiler & Heizung AG | CHE-000.000.000 VAT',
};

const DEFAULT_LABELS = {
  position: { de: 'Pos.', fr: 'Pos.', it: 'Pos.', en: 'Pos.' },
  description: { de: 'Beschreibung', fr: 'Description', it: 'Descrizione', en: 'Description' },
  quantity: { de: 'Menge', fr: 'Quantite', it: 'Quantita', en: 'Qty' },
  unitPrice: { de: 'Einzelpreis', fr: 'Prix unitaire', it: 'Prezzo unitario', en: 'Unit Price' },
  discount: { de: 'Rabatt', fr: 'Remise', it: 'Sconto', en: 'Discount' },
  total: { de: 'Total', fr: 'Total', it: 'Totale', en: 'Total' },
};

const LINE_ITEM_TEMPLATE_TYPES = new Set([
  'quotation',
  'order_confirmation',
  'service_report',
  'inspection_certificate',
]);

export function normalizeTemplateType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function textBlocks() {
  return LANGUAGES.reduce((blocks, lang) => ({
    ...blocks,
    [lang]: {
      introduction: '',
      terms: '',
      footer: DEFAULT_FOOTERS[lang],
      emailSubject: '',
      emailBody: '',
    },
  }), {});
}

function lineItemColumns() {
  return [
    { field: 'position', label: DEFAULT_LABELS.position, widthPercent: 5, alignment: 'left', format: 'text' },
    { field: 'description', label: DEFAULT_LABELS.description, widthPercent: 40, alignment: 'left', format: 'text' },
    { field: 'quantity', label: DEFAULT_LABELS.quantity, widthPercent: 10, alignment: 'right', format: 'number' },
    { field: 'unitPrice', label: DEFAULT_LABELS.unitPrice, widthPercent: 15, alignment: 'right', format: 'currency' },
    { field: 'discount', label: DEFAULT_LABELS.discount, widthPercent: 10, alignment: 'right', format: 'percent' },
    { field: 'total', label: DEFAULT_LABELS.total, widthPercent: 20, alignment: 'right', format: 'currency' },
  ];
}

function sections({ table = false, qrBill = false, deductions = false } = {}) {
  return [
    { id: 'header', name: 'Header', type: 'header', position: 0, isVisible: true, isConditional: false, config: {} },
    { id: 'body', name: 'Body', type: 'body', position: 1, isVisible: true, isConditional: false, config: {} },
    ...(table ? [{ id: 'table', name: 'Line Items', type: 'table', position: 2, isVisible: true, isConditional: false, config: {} }] : []),
    ...(deductions ? [{ id: 'deductions', name: 'Advance Deductions', type: 'deductions', position: 3, isVisible: true, isConditional: true, conditionField: 'advanceDeductions', config: {} }] : []),
    ...(table ? [{ id: 'totals', name: 'Totals', type: 'totals', position: 4, isVisible: true, isConditional: false, config: {} }] : []),
    ...(qrBill ? [{ id: 'qr_bill', name: 'QR Bill', type: 'qr_bill', position: 5, isVisible: true, isConditional: true, conditionField: 'qrBill', config: {} }] : []),
    { id: 'footer', name: 'Footer', type: 'footer', position: 99, isVisible: true, isConditional: false, config: {} },
  ];
}

function profile(templateType) {
  if (templateType === 'invoice_advance') return { table: false, qrBill: true, deductions: false };
  if (templateType === 'invoice_final') return { table: true, qrBill: true, deductions: true };
  if (templateType === 'invoice_standard') return { table: true, qrBill: true, deductions: false };
  if (LINE_ITEM_TEMPLATE_TYPES.has(templateType)) {
    return { table: true, qrBill: false, deductions: false };
  }
  return { table: false, qrBill: false, deductions: false };
}

export function buildTemplateCreatePayload({ name, description, templateType }) {
  const normalizedType = normalizeTemplateType(templateType);
  const typeProfile = profile(normalizedType);
  return {
    templateType: normalizedType,
    name: String(name || '').trim(),
    description: String(description || '').trim(),
    isActive: true,
    layout: {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 25, bottom: 20, left: 20, right: 15 },
      headerHeight: 45,
      footerHeight: 30,
    },
    sections: sections(typeProfile),
    textBlocks: textBlocks(),
    tableColumns: typeProfile.table ? lineItemColumns() : [],
  };
}
