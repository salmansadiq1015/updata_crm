export function getEntityId(value) {
  if (!value) return '';
  if (typeof value === 'object') return value._id ?? value.id ?? '';
  return value;
}

export function toDateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export function mapLineItemsForPayload(lineItems = []) {
  return lineItems.map((item, index) => ({
    position: Number(item.position) || index + 1,
    articleNumber: item.articleNumber || item.catalogSnapshot?.articleNumber || '',
    catalogItemId: item.catalogItemId || item.catalogSnapshot?.catalogArticleId || undefined,
    catalogSnapshot: item.catalogSnapshot || undefined,
    description: item.description,
    unit: item.unit || 'Stk',
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    discountPercent: Number(item.discountPercent) || 0,
    vatRate: Number(item.vatRate) || 0,
    sourceOrderLinePosition: item.sourceOrderLinePosition || undefined,
    sourceOrderLineQuantity: item.sourceOrderLineQuantity || undefined,
  }));
}

export function withEditableLineIds(lineItems = []) {
  return lineItems.map((item, index) => ({ ...item, _uid: item._uid ?? `${index}-${item.position ?? index}` }));
}

// ---- Combobox option builders ---------------------------------------------
// Native document-language names (not translated — they label their own locale).
export const LANGUAGE_OPTIONS = [
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
];

export function buildDepartmentOptions(departments = []) {
  return departments.map((d) => ({
    value: d._id ?? d.id,
    label: d.name,
    badge: d.code || undefined,
  }));
}

export function buildProjectOptions(projects = []) {
  return projects.map((p) => ({
    value: p._id ?? p.id,
    label: p.name,
    badge: p.projectNumber || undefined,
  }));
}

export function buildCustomerOptions(customers = []) {
  return customers.map((c) => ({
    value: c._id ?? c.id,
    label: c.name,
    description: c.city || undefined,
  }));
}

export function buildOrderOptions(orders = []) {
  return orders.map((o) => {
    const id = String(o._id ?? o.id);
    const customerName = o.customerName ?? o.customerId?.name;
    const title = o.title || undefined;
    return {
      value: id,
      label: o.orderNumber || id,
      description: [customerName, title].filter(Boolean).join(' - ') || undefined,
      badge: o.status || undefined,
      keywords: [o.orderNumber, customerName, title].filter(Boolean).join(' '),
    };
  });
}

export function buildPaymentTermOptions(days = [], suffix = 'days net') {
  return days.map((d) => ({ value: String(d), label: `${d} ${suffix}` }));
}
