import mongoose from 'mongoose';

export function compactString(value, maxLength = 255) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

export function normalizeEmail(value) {
  const email = compactString(value, 255);
  return email ? email.toLowerCase() : null;
}

export function normalizePhone(value) {
  const phone = compactString(value, 30);
  if (!phone) return null;
  const normalized = phone.replace(/[^\d+]/g, '');
  return normalized || null;
}

export function normalizePostalCode(value) {
  const postalCode = compactString(value, 10);
  return postalCode ? postalCode.replace(/\s+/g, '') : null;
}

export function normalizeCountry(value) {
  const country = compactString(value, 2);
  return country ? country.toUpperCase() : 'CH';
}

export function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(value)) return new mongoose.Types.ObjectId(value);
  return null;
}

export function getSourceId(payload, domain, index = 0) {
  return String(
    payload.source_id ||
    payload.sourceId ||
    payload.id ||
    payload._id ||
    payload.adr_id ||
    payload.kunden_id ||
    payload.anlage_id ||
    payload.offerte_id ||
    payload.rechnung_id ||
    `${domain}-${index + 1}`,
  );
}

export function splitName(value) {
  const text = compactString(value, 255);
  if (!text) return { firstName: null, lastName: null };
  const parts = text.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '-' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export function buildAddress(payload = {}) {
  return {
    street: compactString(payload.street || payload.strasse || payload.address || payload.adresse, 255),
    postalCode: normalizePostalCode(payload.postalCode || payload.plz || payload.zip),
    city: compactString(payload.city || payload.ort, 100),
    canton: compactString(payload.canton || payload.kanton, 2)?.toUpperCase() || null,
    country: normalizeCountry(payload.country || payload.land),
  };
}

export function migrationStamp(run, sourceSystem, sourceId) {
  return {
    sourceSystem,
    sourceId: String(sourceId),
    runId: run._id,
    migratedAt: new Date(),
    isMigrated: true,
    isReadOnly: run.runType === 'production',
  };
}

export function assertRunMutable(run) {
  return ['pending', 'paused'].includes(run.status);
}

export function calculateRate(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 10000) / 100;
}

export function normalizeLineItems(items = [], fallbackDescription = 'Migrated line item') {
  const sourceItems = Array.isArray(items) && items.length ? items : [{ description: fallbackDescription }];
  return sourceItems.map((item, index) => ({
    position: Number(item.position || item.pos || index + 1),
    type: item.type || 'service',
    articleNumber: compactString(item.articleNumber || item.article_number || item.artikel_nr, 50) || '',
    description: compactString(item.description || item.bezeichnung || item.text, 1000) || fallbackDescription,
    unit: compactString(item.unit || item.einheit, 20) || 'pcs',
    quantity: toNumber(item.quantity || item.qty || item.menge, 1),
    unitPrice: toNumber(item.unitPrice || item.price || item.preis, 0),
    discountPercent: toNumber(item.discountPercent || item.rabatt, 0),
    vatRate: toNumber(item.vatRate || item.mwst || item.vat, 8.1),
  }));
}
