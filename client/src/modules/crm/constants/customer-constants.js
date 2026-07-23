/**
 * Customer-related constants.
 * Mirrors backend enums from server/src/modules/crm/customer.model.js and Swiss-specific value lists.
 */

export const CUSTOMER_TYPES = Object.freeze({
  PRIVATE: 'private',
  BUSINESS: 'business',
  PARTNER: 'partner',
  SUPPLIER: 'supplier',
});

// Types that can be either a person or a company, so the salutation stays available.
export const CUSTOMER_TYPES_WITH_SALUTATION = Object.freeze(['private', 'partner', 'supplier']);

const CUSTOMER_TYPE_LABELS = Object.freeze({
  private:  { key: 'crm.typePrivate',  fallback: 'Privat' },
  business: { key: 'crm.typeBusiness', fallback: 'Firma' },
  partner:  { key: 'crm.typePartner',  fallback: 'Partner' },
  supplier: { key: 'crm.typeSupplier', fallback: 'Lieferant' },
});

export function getCustomerTypeLabel(type, t) {
  const entry = CUSTOMER_TYPE_LABELS[type] || CUSTOMER_TYPE_LABELS.private;
  return t ? t(entry.key, entry.fallback) : entry.fallback;
}

export const CUSTOMER_STATUSES = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
});

export const NEWSLETTER_CHANNELS = Object.freeze({
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
  BOTH: 'both',
});

/**
 * All 26 Swiss cantons (ISO 3166-2:CH). Used in filter + form selects.
 */
export const CH_CANTONS = Object.freeze([
  { code: 'AG', name: 'Aargau' },
  { code: 'AI', name: 'Appenzell Innerrhoden' },
  { code: 'AR', name: 'Appenzell Ausserrhoden' },
  { code: 'BE', name: 'Bern' },
  { code: 'BL', name: 'Basel-Landschaft' },
  { code: 'BS', name: 'Basel-Stadt' },
  { code: 'FR', name: 'Fribourg' },
  { code: 'GE', name: 'Genf' },
  { code: 'GL', name: 'Glarus' },
  { code: 'GR', name: 'Graubünden' },
  { code: 'JU', name: 'Jura' },
  { code: 'LU', name: 'Luzern' },
  { code: 'NE', name: 'Neuenburg' },
  { code: 'NW', name: 'Nidwalden' },
  { code: 'OW', name: 'Obwalden' },
  { code: 'SG', name: 'St. Gallen' },
  { code: 'SH', name: 'Schaffhausen' },
  { code: 'SO', name: 'Solothurn' },
  { code: 'SZ', name: 'Schwyz' },
  { code: 'TG', name: 'Thurgau' },
  { code: 'TI', name: 'Tessin' },
  { code: 'UR', name: 'Uri' },
  { code: 'VD', name: 'Waadt' },
  { code: 'VS', name: 'Wallis' },
  { code: 'ZG', name: 'Zug' },
  { code: 'ZH', name: 'Zürich' },
]);

/**
 * Rotating accent colour palette — customer avatar tile colour is derived from
 * the first character of the customer name, matching the convention used in
 * roles-table for visual distinctiveness.
 */
export const CUSTOMER_ACCENTS = Object.freeze([
  { bg: 'bg-brand-500/10', ring: 'ring-brand-500/20', text: 'text-brand-500', bar: 'from-brand-500 to-transparent' },
  { bg: 'bg-sky-500/10', ring: 'ring-sky-500/20', text: 'text-sky-500', bar: 'from-sky-500 to-transparent' },
  { bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', text: 'text-emerald-500', bar: 'from-emerald-500 to-transparent' },
  { bg: 'bg-amber-500/10', ring: 'ring-amber-500/20', text: 'text-amber-500', bar: 'from-amber-500 to-transparent' },
  { bg: 'bg-rose-500/10', ring: 'ring-rose-500/20', text: 'text-rose-500', bar: 'from-rose-500 to-transparent' },
  { bg: 'bg-indigo-500/10', ring: 'ring-indigo-500/20', text: 'text-indigo-500', bar: 'from-indigo-500 to-transparent' },
  { bg: 'bg-pink-500/10', ring: 'ring-pink-500/20', text: 'text-pink-500', bar: 'from-pink-500 to-transparent' },
  { bg: 'bg-teal-500/10', ring: 'ring-teal-500/20', text: 'text-teal-500', bar: 'from-teal-500 to-transparent' },
]);

export const pickCustomerAccent = (customer) => {
  const name = customer?.name || customer?.customerNumber || '';
  const idx = (name.charCodeAt(0) || 0) % CUSTOMER_ACCENTS.length;
  return CUSTOMER_ACCENTS[idx];
};
