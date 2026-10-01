/**
 * Shared document filename builder.
 *
 * Convention: JJJJ_MM_TT_Objektadresse_Updata_Dokumenttyp_Version.ext
 * Example:    2026_08_10_Hohestrasse 199, Oberwil_Updata_Offerte O_V1.pdf
 */

const TEMPLATE_TYPE_LABELS = {
  quotation: 'Offerte O',
  order_confirmation: 'Auftragsbestätigung AB',
  invoice_standard: 'Rechnung RG',
  invoice_advance: 'Akontorechnung AR',
  invoice_final: 'Schlussrechnung SR',
  service_report: 'Servicebericht SB',
  inspection_certificate: 'Inspektionszertifikat IZ',
  cover_letter: 'Begleitschreiben BS',
};

/**
 * Sanitise a filename segment — replace characters that are problematic
 * on Windows/Mac/Linux file systems but keep spaces and commas (part of
 * the requested address format).
 */
function sanitizeSegment(value = '') {
  return String(value)
    .trim()
    .replace(/[/\\:*?"<>|]+/g, '-')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 120);
}

/**
 * Build a document filename following the client convention.
 *
 * @param {object} options
 * @param {string} options.templateType  - e.g. 'quotation', 'invoice_standard'
 * @param {string} [options.objectAddress] - "Street Nr, City" (without PLZ)
 * @param {number|string} [options.version] - version number (default 1)
 * @param {Date|string} [options.date] - document date (default now)
 * @param {string} [options.ext] - file extension (default 'pdf')
 * @returns {string} filename
 */
export function buildDocumentFilename({ templateType, objectAddress, version, date, ext = 'pdf' }) {
  const d = date ? new Date(date) : new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const datePart = `${yyyy}_${mm}_${dd}`;

  const addressPart = sanitizeSegment(objectAddress || '');
  const typeLabel = TEMPLATE_TYPE_LABELS[templateType] || templateType;
  const versionPart = `V${version || 1}`;

  const segments = [datePart];
  if (addressPart) segments.push(addressPart);
  segments.push('Updata');
  segments.push(typeLabel);
  segments.push(versionPart);

  return `${segments.join('_')}.${ext}`;
}
