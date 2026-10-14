const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

/**
 * Prevent spreadsheet applications from interpreting exported, untrusted text
 * as a formula. Numeric values remain numeric; only strings with a dangerous
 * first non-space character receive the conventional leading apostrophe.
 */
export function sanitizeCsvCell(value) {
  if (typeof value !== 'string' || !FORMULA_PREFIX.test(value)) return value;
  return `'${value}`;
}

export function sanitizeCsvRows(rows) {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sanitizeCsvCell(value)]),
  ));
}

export default sanitizeCsvRows;
