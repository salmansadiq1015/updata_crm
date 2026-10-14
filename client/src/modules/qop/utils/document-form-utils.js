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

/** @param {unknown} payload @returns {any[]} */
export function normalizeReferenceItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const candidates = [
    payload.data,
    payload.items,
    payload.results,
    payload.records,
    payload.departments,
    payload.projects,
  ];

  return candidates.find(Array.isArray) ?? [];
}

/** @param {unknown} [departments] */
export function buildDepartmentOptions(departments = []) {
  return normalizeReferenceItems(departments).map((d) => ({
    value: d._id ?? d.id,
    label: d.name,
    badge: d.code || undefined,
  }));
}

/** @param {unknown} [projects] */
export function buildProjectOptions(projects = []) {
  return normalizeReferenceItems(projects).map((p) => ({
    value: p._id ?? p.id,
    label: p.name,
    badge: p.projectNumber || undefined,
    keywords: [p.projectNumber, p.name, p.customerName, p.customerId?.name].filter(Boolean).join(' '),
  }));
}

/** @param {unknown} [customers] */
export function buildCustomerOptions(customers = []) {
  return normalizeReferenceItems(customers).map((c) => ({
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

export function buildSiteOptions(sites = []) {
  return normalizeReferenceItems(sites).map((s) => ({
    value: s._id ?? s.id,
    label: s.name || s.street || s.siteNumber || '—',
    description: [s.street, s.city].filter(Boolean).join(', ') || undefined,
  }));
}

/**
 * The party of an Objekt a document can be addressed to. Only parties that
 * carry a street are offerable — an empty block must never silently replace
 * the customer address on the printed document.
 */
export function siteBillingParty(site, source) {
  if (!site) return null;
  const bySource = {
    site_billing: site.billingAddress,
    site_ownership: site.ownership,
    site_management: site.management,
  };
  const party = bySource[source];
  return party?.street ? party : null;
}

/** One-line rendering of a site party, for the picker. */
export function formatSiteParty(party) {
  if (!party) return '';
  return [
    party.name,
    party.careOf ? `c/o ${party.careOf}` : null,
    party.street,
    [party.postalCode, party.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
}
