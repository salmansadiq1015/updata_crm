/**
 * Swiss PLZ (4-digit postal code). Trim + validate.
 */
export function formatPLZ(value, { fallback = '' } = {}) {
  if (!value) return fallback;
  const trimmed = String(value).trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : trimmed;
}

/**
 * Compose a Swiss postal address block:
 *   "Bahnhofstrasse 12, 8001 Zurich, ZH, CH"
 */
export function formatSwissAddress(parts = {}, { fallback = '' } = {}) {
  const { street, postalCode, city, canton, country = 'CH' } = parts;
  const line1 = [street].filter(Boolean).join(' ');
  const line2 = [postalCode, city].filter(Boolean).join(' ');
  const line3 = [canton, country].filter(Boolean).join(', ');
  const result = [line1, line2, line3].filter((s) => s && s.trim()).join(', ');
  return result || fallback;
}
