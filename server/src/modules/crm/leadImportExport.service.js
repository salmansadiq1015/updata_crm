import { parse as parseCsvSync } from 'csv-parse/sync';
import { Parser as Json2CsvParser } from '@json2csv/plainjs';
import PDFDocument from 'pdfkit';
import leadService from './lead.service.js';
import leadRepository from './lead.repository.js';
import counterService from './counter.service.js';
import auditService from '../auth/audit.service.js';
import { leadImportsTotal } from '../../metrics/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';
import {
  LEAD_TYPE, LEAD_STATUS, LEAD_SOURCE,
} from './lead.model.js';
import { SWISS_CANTONS } from './crm.constants.js';

/**
 * Lead import / export service (§33-34 import-mapping, §83 bulkWrite of
 * LEAD_GENERATION_DESIGN.md).
 *
 * Imports CSV / Excel (.xlsx) / PDF files into the shared `leads` collection and
 * exports matching leads as CSV / Excel / PDF. It owns parsing + column mapping
 * only — deduplication and persistence are delegated to leadService
 * (findDuplicates / bulkCreate) and paging to leadRepository.list, so no
 * dedup / create logic is duplicated here.
 *
 * bulkCreate does NOT allocate the L-##### number (the model requires it), so a
 * number is reserved per valid row via counterService before the bulk insert.
 *
 * PDF import is best-effort text extraction (pdf-parse): it can miss or mis-read
 * columns and never fabricates data — CSV / Excel are the recommended formats.
 */

// Guards (§33 — bounded + observable).
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ROWS = 10000;
const EXPORT_CAP = 50000; // mirrors customer/sparePart exportCsv
const EXPORT_PAGE_SIZE = 1000;
const ERROR_CAP = 100; // per-row errors returned to the caller
// Bulk import dedup runs the per-row ladder concurrently (bounded) so a large
// file does not serialize hundreds of lookups into a request timeout. Kept well
// under the Mongo connection pool since each lookup fans out to a few queries.
const DEDUP_CONCURRENCY = 12;

const CSV_MIME = 'text/csv; charset=utf-8';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PDF_MIME = 'application/pdf';

const IMPORT_MODES = Object.freeze(['new', 'skip', 'update']);
const LEAD_TYPE_VALUES = Object.values(LEAD_TYPE);
const LEAD_STATUS_VALUES = Object.values(LEAD_STATUS);

/**
 * Columns a user may fill in an import file. The header → field mapping below is
 * case- / space- / separator-insensitive, so "Postal Code", "postal_code" and
 * "PLZ" all map to the same field.
 */
const TEMPLATE_COLUMNS = Object.freeze([
  'name', 'type', 'status', 'street', 'addressSupplement', 'postalCode',
  'city', 'canton', 'country', 'phone', 'mobile', 'email', 'website',
  'notes', 'tags',
]);

const TEMPLATE_EXAMPLE = Object.freeze({
  name: 'Muster AG',
  type: 'business',
  status: 'new',
  street: 'Bahnhofstrasse 1',
  addressSupplement: '',
  postalCode: '8001',
  city: 'Zürich',
  canton: 'ZH',
  country: 'CH',
  phone: '+41 44 123 45 67',
  mobile: '',
  email: 'info@muster.ch',
  website: 'https://muster.ch',
  notes: 'Example row — edit or delete before importing',
  tags: 'prospect,heating',
});

// Stable export column set (§34). Read-only provenance columns (LeadNumber,
// Source, AssignedTo, DiscoveredAt, CreatedAt) sit alongside the editable set.
const EXPORT_COLUMNS = Object.freeze([
  { label: 'LeadNumber', value: (l) => l.leadNumber || '' },
  { label: 'Name', value: (l) => l.name || '' },
  { label: 'Type', value: (l) => l.type || '' },
  { label: 'Status', value: (l) => l.status || '' },
  { label: 'Street', value: (l) => l.address?.street || '' },
  { label: 'AddressSupplement', value: (l) => l.address?.addressSupplement || '' },
  { label: 'PostalCode', value: (l) => l.address?.postalCode || '' },
  { label: 'City', value: (l) => l.address?.city || '' },
  { label: 'Canton', value: (l) => l.address?.canton || '' },
  { label: 'Country', value: (l) => l.address?.country || '' },
  { label: 'Phone', value: (l) => l.phone || '' },
  { label: 'Mobile', value: (l) => l.mobile || '' },
  { label: 'Email', value: (l) => l.email || '' },
  { label: 'Website', value: (l) => l.website || '' },
  { label: 'Source', value: (l) => l.source || '' },
  // Listed leads carry assignedTo as a populated user; the export keeps the plain id.
  { label: 'AssignedTo', value: (l) => (l.assignedTo ? String(l.assignedTo._id ?? l.assignedTo) : '') },
  // createdBy is populated on the list query — export the creator's display name.
  {
    label: 'CreatedBy',
    value: (l) => {
      const u = l.createdBy;
      if (!u) return '';
      if (typeof u === 'string') return u;
      return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || String(u._id ?? '');
    },
  },
  { label: 'DiscoveredAt', value: (l) => isoOrEmpty(l.sourceMetadata?.discoveredAt) },
  { label: 'CreatedAt', value: (l) => isoOrEmpty(l.createdAt) },
]);

// Compact column subset for the PDF (a wide 18-column grid is unreadable). The
// full set is always available via CSV / Excel.
const PDF_COLUMNS = Object.freeze([
  { label: 'Lead #', width: 62, value: (l) => l.leadNumber || '' },
  { label: 'Name', width: 150, value: (l) => l.name || '' },
  { label: 'Type', width: 58, value: (l) => l.type || '' },
  { label: 'Status', width: 70, value: (l) => l.status || '' },
  { label: 'City', width: 110, value: (l) => l.address?.city || '' },
  { label: 'Phone', width: 110, value: (l) => l.phone || l.mobile || '' },
  { label: 'Email', width: 160, value: (l) => l.email || '' },
]);

// --- Header mapping ---------------------------------------------------------

const FIELD_ALIASES = {
  name: ['name', 'leadname', 'companyname', 'company', 'firma', 'firmenname'],
  type: ['type', 'leadtype', 'typ', 'kind'],
  status: ['status', 'leadstatus', 'stage'],
  street: ['street', 'strasse', 'address', 'adresse', 'addressline1', 'streetaddress'],
  addressSupplement: ['addresssupplement', 'supplement', 'addresszusatz', 'zusatz', 'addition', 'addressextra'],
  postalCode: ['postalcode', 'zip', 'zipcode', 'plz', 'postcode', 'postleitzahl'],
  city: ['city', 'ort', 'town', 'stadt'],
  canton: ['canton', 'kanton', 'state', 'province'],
  country: ['country', 'land', 'countrycode'],
  phone: ['phone', 'telephone', 'tel', 'phonenumber', 'telefon', 'festnetz'],
  mobile: ['mobile', 'mobilephone', 'cell', 'cellphone', 'handy', 'natel'],
  email: ['email', 'mail', 'emailaddress', 'mailaddress'],
  website: ['website', 'url', 'web', 'homepage', 'webseite', 'site'],
  notes: ['notes', 'note', 'comment', 'comments', 'remark', 'remarks', 'bemerkung', 'bemerkungen', 'description'],
  tags: ['tags', 'tag', 'labels', 'label', 'keywords'],
  assignedTo: ['assignedto', 'owner', 'assignee', 'zugewiesen'],
};

const HEADER_ALIASES = {};
for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) HEADER_ALIASES[alias] = canonical;
}

// --- Pure helpers -----------------------------------------------------------

function normalizeKey(key) {
  return String(key ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanString(value) {
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str === '' ? undefined : str;
}

// --- Extension-import field normalisers ------------------------------------
// Maps-sourced rows are messy. These never throw: they return a clean value or
// null, so a junk field degrades the single row to a usable lead (or drops the
// field) instead of failing. The Lead model caps phone/email/website lengths;
// returning model-safe values keeps good rows importable. Never trust the
// client for data quality.

/** A plausible phone, trimmed to the model's 50-char cap, or null. Rejects
 *  non-phone text such as "Café X · Visited link" (letters dominate). */
function normalizeLeadPhone(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const digits = (raw.match(/\d/g) || []).length;
  const letters = (raw.match(/\p{L}/gu) || []).length;
  // A real phone is mostly dialling characters: enough digits, few letters.
  if (digits < 5 || letters > 3) return null;
  const cleaned = raw.replace(/[^\d+()\-.\s/]/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.replace(/\D/g, '').length < 5) return null;
  return cleaned.slice(0, 50);
}

/** An absolute http(s) URL (scheme added if missing), capped, or null. */
function normalizeLeadWebsite(value) {
  let raw = cleanString(value);
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A valid, lower-cased email within the model's cap, or null. */
function normalizeLeadEmail(value) {
  const raw = cleanString(value)?.toLowerCase();
  if (!raw || raw.length > 255 || !EMAIL_RE.test(raw)) return null;
  return raw;
}

/** Finite number within [min, max], else null. Out-of-range values are dropped
 *  (not clamped) so we never fabricate a location/rating from bad input. */
function inRangeOrNull(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Non-negative integer review count, or null. */
function normalizeReviewCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

const COUNTRY_NAME_TO_CODE = new Map([
  ['switzerland', 'CH'], ['schweiz', 'CH'], ['suisse', 'CH'], ['svizzera', 'CH'],
  ['france', 'FR'], ['germany', 'DE'], ['deutschland', 'DE'], ['austria', 'AT'],
  ['österreich', 'AT'], ['italy', 'IT'], ['italia', 'IT'], ['pakistan', 'PK'],
  ['india', 'IN'], ['united kingdom', 'GB'], ['uk', 'GB'], ['united states', 'US'],
  ['united states of america', 'US'], ['usa', 'US'], ['canada', 'CA'],
  ['australia', 'AU'], ['united arab emirates', 'AE'], ['uae', 'AE'],
]);

function normalizeCountryCode(value) {
  const country = cleanString(value);
  if (!country) return null;
  if (/^[a-z]{2}$/i.test(country)) return country.toUpperCase();
  return COUNTRY_NAME_TO_CODE.get(country.toLocaleLowerCase('en')) || null;
}

function normalizeSwissCanton(value, countryCode) {
  if (countryCode && countryCode !== 'CH') return null;
  const canton = cleanString(value)?.toUpperCase();
  return canton && SWISS_CANTONS.includes(canton) ? canton : null;
}

function isoOrEmpty(date) {
  return date ? new Date(date).toISOString() : '';
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/"/g, '""');
  return /[",\n;]/.test(str) ? `"${str}"` : str;
}

/** Coerce an ExcelJS cell value (which may be rich text / hyperlink / formula /
 * date / number) to a plain string. */
function coerceCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text; // hyperlink label
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if (value.result !== undefined && value.result !== null) return String(value.result); // formula
    if (value.hyperlink) return String(value.hyperlink);
    return '';
  }
  return String(value);
}

/** Split a PDF text line into columns using a best-effort delimiter heuristic. */
function splitPdfLine(line) {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes(';')) return line.split(';');
  if (line.includes(',')) return line.split(',');
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/);
  return [line];
}

function detectFormat(mimetype, originalname) {
  const name = String(originalname ?? '').toLowerCase();
  const mime = String(mimetype ?? '').toLowerCase();
  if (mime.includes('csv') || name.endsWith('.csv')) return 'csv';
  if (
    mime.includes('spreadsheetml')
    || mime.includes('ms-excel')
    || mime.includes('excel')
    || name.endsWith('.xlsx')
    || name.endsWith('.xls')
  ) return 'xlsx';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  // Browsers sometimes send CSV as text/plain.
  if (mime.includes('text/plain') || name.endsWith('.txt')) return 'csv';
  return null;
}

class LeadImportExportService {
  /**
   * Parse an uploaded file into raw header→value row objects.
   * @returns {Promise<{ rows: object[], format: 'csv'|'xlsx'|'pdf', warnings: string[] }>}
   */
  async parseFile({ buffer, mimetype, originalname } = {}) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new AppError('Import file is empty or missing', 400, ERROR_CODES.LEAD_IMPORT_FAILED);
    }
    if (buffer.length > MAX_FILE_SIZE) {
      throw new AppError(
        `Import file exceeds the ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB limit`,
        413,
        ERROR_CODES.LEAD_IMPORT_FAILED,
      );
    }

    const format = detectFormat(mimetype, originalname);
    if (!format) {
      throw new AppError(
        'Unsupported import file type — use CSV, Excel (.xlsx) or PDF',
        400,
        ERROR_CODES.LEAD_IMPORT_FAILED,
      );
    }

    const warnings = [];
    let rows;
    if (format === 'csv') rows = this._parseCsv(buffer);
    else if (format === 'xlsx') rows = await this._parseXlsx(buffer, warnings);
    else rows = await this._parsePdf(buffer, warnings);

    if (rows.length > MAX_ROWS) {
      throw new AppError(
        `Import exceeds the ${MAX_ROWS}-row limit (${rows.length} rows found)`,
        400,
        ERROR_CODES.LEAD_IMPORT_FAILED,
      );
    }

    return { rows, format, warnings };
  }

  _parseCsv(buffer) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (!text.trim()) return [];
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delimiter = firstLine.includes(';') ? ';' : ',';
    try {
      return parseCsvSync(text, {
        bom: true,
        columns: true,
        delimiter,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (err) {
      throw new AppError(`Could not parse CSV: ${err.message}`, 400, ERROR_CODES.LEAD_IMPORT_FAILED);
    }
  }

  async _parseXlsx(buffer, warnings) {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
    } catch (err) {
      throw new AppError(`Could not read Excel file: ${err.message}`, 400, ERROR_CODES.LEAD_IMPORT_FAILED);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      warnings.push('The Excel file has no worksheets.');
      return [];
    }

    const headers = [];
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col] = coerceCell(cell.value).trim();
    });
    if (!headers.filter(Boolean).length) {
      warnings.push('No header row found in the first worksheet.');
      return [];
    }

    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj = {};
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const key = headers[col];
        if (!key) return;
        const val = coerceCell(cell.value).trim();
        if (val !== '') obj[key] = val;
      });
      if (Object.keys(obj).length) rows.push(obj);
    });
    return rows;
  }

  async _parsePdf(buffer, warnings) {
    warnings.push(
      'PDF import is best-effort: columns may be mis-read or missed. '
      + 'CSV or Excel is strongly recommended for reliable imports.',
    );

    let PDFParse;
    try {
      ({ PDFParse } = await import('pdf-parse'));
    } catch {
      warnings.push('PDF parser is unavailable; no rows were extracted.');
      return [];
    }

    let text = '';
    let parser = null;
    try {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result?.text || '';
    } catch (err) {
      warnings.push(`Could not extract text from the PDF: ${err.message}`);
      return [];
    } finally {
      if (parser && typeof parser.destroy === 'function') {
        try { await parser.destroy(); } catch { /* best-effort cleanup */ }
      }
    }

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^-{2,}\s*\d+\s+of\s+\d+\s*-{2,}$/i.test(line));

    if (!lines.length) {
      warnings.push('No text content found in the PDF.');
      return [];
    }

    // Locate a header line that looks tabular and contains a "name" column.
    let headers = null;
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i += 1) {
      const cols = splitPdfLine(lines[i]).map((col) => col.trim()).filter(Boolean);
      if (cols.length >= 2 && cols.some((col) => HEADER_ALIASES[normalizeKey(col)] === 'name')) {
        headers = cols;
        headerIdx = i;
        break;
      }
    }

    if (!headers) {
      warnings.push(
        'No table-like header row (with a recognizable "name" column) was detected in the PDF; '
        + 'no rows were imported. Re-export the source as CSV or Excel.',
      );
      return [];
    }

    const rows = [];
    for (let i = headerIdx + 1; i < lines.length; i += 1) {
      const cols = splitPdfLine(lines[i]).map((col) => col.trim());
      if (!cols.filter(Boolean).length) continue;
      const obj = {};
      headers.forEach((header, idx) => {
        if (header && cols[idx] !== undefined && cols[idx] !== '') obj[header] = cols[idx];
      });
      if (Object.keys(obj).length) rows.push(obj);
    }

    if (!rows.length) {
      warnings.push('A header row was detected but no data rows could be parsed from the PDF.');
    }
    return rows;
  }

  /**
   * Map a raw header→value row to a lead DTO. Case- / space- / separator-
   * insensitive. `source` defaults to 'import'. An optional explicit `mapping`
   * ({ rawHeader: canonicalField }) overrides the default aliases per column.
   * `assignedTo` is intentionally NOT mapped (see importLeads warning).
   */
  mapRowToLead(row = {}, mapping = null) {
    const byField = {};
    for (const [rawKey, rawVal] of Object.entries(row)) {
      const field = (mapping && mapping[rawKey]) || HEADER_ALIASES[normalizeKey(rawKey)];
      if (!field) continue;
      const val = cleanString(rawVal);
      if (val === undefined) continue;
      if (byField[field] === undefined) byField[field] = val; // first non-empty wins
    }

    const dto = { source: LEAD_SOURCE.IMPORT };

    if (byField.name) dto.name = byField.name;

    if (byField.type) {
      const type = byField.type.toLowerCase();
      if (LEAD_TYPE_VALUES.includes(type)) dto.type = type;
    }
    if (byField.status) {
      const status = byField.status.toLowerCase();
      if (LEAD_STATUS_VALUES.includes(status)) dto.status = status;
    }

    const address = {};
    if (byField.street) address.street = byField.street;
    if (byField.addressSupplement) address.addressSupplement = byField.addressSupplement;
    if (byField.postalCode) address.postalCode = byField.postalCode;
    if (byField.city) address.city = byField.city;
    if (byField.canton) address.canton = byField.canton.toUpperCase();
    if (byField.country) address.country = byField.country.toUpperCase();
    if (Object.keys(address).length) dto.address = address;

    if (byField.phone) dto.phone = byField.phone;
    if (byField.mobile) dto.mobile = byField.mobile;
    if (byField.email) dto.email = byField.email.toLowerCase();
    if (byField.website) dto.website = byField.website;
    if (byField.notes) dto.notes = byField.notes;
    if (byField.tags) {
      const tags = byField.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
      if (tags.length) dto.tags = tags;
    }

    return dto;
  }

  /**
   * Parse + map + validate + dedupe + bulk-create an uploaded file.
   *
   * Modes: 'new' / 'skip' both dedupe (name+postal / phone / website) and skip
   * matches. 'update' is out of scope for file import and is treated like 'new'
   * (a warning is added). Every parsed row lands in exactly one bucket so the
   * counts always sum to `total`.
   *
   * @returns {Promise<{ summary:{total,created,skipped,duplicates,failed},
   *   errors:{row,message}[], format:string, warnings:string[] }>}
   */
  async importLeads({
    buffer, mimetype, originalname, mode = 'new',
  } = {}, createdBy, meta = {}) {
    const normalizedMode = IMPORT_MODES.includes(mode) ? mode : 'new';
    const { rows, format, warnings } = await this.parseFile({ buffer, mimetype, originalname });

    if (normalizedMode === 'update') {
      warnings.push('Update mode is not supported for file import — rows were treated as new (existing matches skipped).');
    }

    if (rows.some((row) => Object.keys(row).some(
      (key) => HEADER_ALIASES[normalizeKey(key)] === 'assignedTo' && cleanString(row[key]) !== undefined,
    ))) {
      warnings.push('An "assignedTo" column was present but is ignored by file import — assign leads after importing.');
    }

    const summary = {
      total: rows.length, created: 0, skipped: 0, duplicates: 0, failed: 0,
    };
    const errors = [];

    const pushError = (row, message) => {
      if (errors.length < ERROR_CAP) errors.push({ row, message });
    };

    // Phase 1 — map + validate (pure, fast). Rows that map to nothing are
    // skipped; rows without a name fail; the rest become dedup candidates.
    const candidates = [];
    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = i + 2; // +1 for the header row, +1 for 1-based indexing
      const dto = this.mapRowToLead(rows[i]);

      // Drop rows that mapped to nothing meaningful (only the default source).
      const meaningfulKeys = Object.keys(dto).filter((key) => key !== 'source');
      if (meaningfulKeys.length === 0) {
        summary.skipped += 1;
        continue;
      }

      if (!dto.name) {
        summary.failed += 1;
        pushError(rowNumber, 'name is required');
        continue;
      }

      candidates.push({ dto, rowNumber, isDuplicate: false });
    }

    // Phase 2 — dedup with bounded concurrency. The ladder (name+postal / phone /
    // website) is unchanged per row; only the scheduling changes: a 300+ row file
    // previously ran these lookups strictly one-after-another and timed out.
    await this._runBounded(candidates, DEDUP_CONCURRENCY, async (candidate) => {
      candidate.isDuplicate = await this._isDuplicate(candidate.dto);
    });

    const toCreate = [];
    for (const candidate of candidates) {
      if (candidate.isDuplicate) summary.duplicates += 1;
      else toCreate.push(candidate);
    }

    if (toCreate.length) {
      // bulkCreate does not number leads; reserve the whole L-##### block in ONE
      // atomic $inc instead of one round-trip per row (the old per-row loop
      // contended on the single counter doc and dominated the import time).
      const numbers = await counterService.getNextLeadNumberBlock(toCreate.length);
      const numbered = toCreate.map((candidate, index) => ({
        ...candidate.dto,
        leadNumber: numbers[index],
        createdBy,
      }));

      const result = await leadService.bulkCreate(numbered);
      summary.created = result.insertedCount || 0;
      for (const writeError of result.errors || []) {
        summary.failed += 1;
        const rowNumber = toCreate[writeError.index]?.rowNumber ?? null;
        pushError(rowNumber, writeError.message || 'Insert failed');
      }
    }

    this._recordMetrics(summary);

    auditService.logEvent({
      eventType: 'lead.file_import',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: summary.failed > 0 ? 'partial' : 'success',
      details: { format, ...summary },
      module: 'lead',
    });

    logger.info('Lead file import complete', {
      module: 'crm', action: 'lead.file_import', format, ...summary,
    });

    return {
      summary, errors, format, warnings,
    };
  }

  /**
   * Import normalized Google Maps records from the extension. This endpoint is
   * intentionally separate from file import: the stable place identifier is
   * preserved for idempotency, and every createdBy value comes from the
   * authenticated controller argument rather than the browser payload.
   */
  async importExtensionLeads(records = [], createdBy, meta = {}) {
    const summary = { total: records.length, created: 0, existing: 0, failed: 0 };
    const results = [];
    for (const record of records) {
      const clientId = String(record.clientId ?? '');
      try {
        const placeId = cleanString(record.placeIdentifier);
        const name = cleanString(record.businessName)?.slice(0, 255);
        if (!name) throw new Error('Business name is required');
        // Normalise messy Maps fields; junk degrades to null, not a failed row.
        const phoneValue = normalizeLeadPhone(record.phone);
        const websiteValue = normalizeLeadWebsite(record.website);
        const postalCode = cleanString(record.postalCode);
        const country = normalizeCountryCode(record.country);
        const address = {
          street: cleanString(record.street) || cleanString(record.address),
          addressSupplement: null,
          postalCode: postalCode || null,
          city: cleanString(record.city) || null,
          canton: normalizeSwissCanton(record.state, country),
          country,
        };
        const matches = await leadService.findDuplicates({
          name,
          postalCode: address.postalCode,
          phone: phoneValue,
          website: websiteValue,
          placeId,
        });
        if (matches.length) {
          const existing = matches[0].lead;
          summary.existing += 1;
          results.push({ clientId, status: 'existing', leadId: String(existing._id), leadNumber: existing.leadNumber });
          continue;
        }
        const latitude = inRangeOrNull(record.latitude, -90, 90);
        const longitude = inRangeOrNull(record.longitude, -180, 180);
        const email = Array.isArray(record.emails)
          ? (record.emails.map(normalizeLeadEmail).find(Boolean) || null)
          : normalizeLeadEmail(record.emails);
        const lead = await leadService.create({
          name,
          type: LEAD_TYPE.BUSINESS,
          status: LEAD_STATUS.NEW,
          address,
          phone: phoneValue,
          email,
          website: websiteValue,
          location: latitude !== null && longitude !== null ? { type: 'Point', coordinates: [longitude, latitude] } : null,
          providerMeta: { rating: inRangeOrNull(record.rating, 0, 5), reviewCount: normalizeReviewCount(record.reviewCount), priceLevel: cleanString(record.priceLevel) || null },
          source: placeId ? LEAD_SOURCE.GOOGLE_PLACES : LEAD_SOURCE.IMPORT,
          sourceMetadata: { googlePlaceId: placeId || null, businessType: cleanString(record.category) || null, discoveredAt: record.discoveredAt || null },
          tags: Array.isArray(record.categories) ? record.categories.slice(0, 50) : [],
          notes: cleanString(record.address) ? `Google Maps address: ${record.address}` : null,
        }, createdBy, meta);
        summary.created += 1;
        results.push({ clientId, status: 'created', leadId: String(lead._id), leadNumber: lead.leadNumber });
      } catch (error) {
        // A concurrent request can win the unique place-id race. Report it as
        // existing when possible; never turn the remaining batch into failure.
        if (error?.code === 11000 && record.placeIdentifier) {
          const matches = await leadService.findDuplicates({ placeId: record.placeIdentifier }).catch(() => []);
          if (matches.length) {
            summary.existing += 1;
            results.push({ clientId, status: 'existing', leadId: String(matches[0].lead._id), leadNumber: matches[0].lead.leadNumber });
            continue;
          }
        }
        summary.failed += 1;
        results.push({ clientId, status: 'failed', message: error instanceof Error ? error.message : 'Lead could not be imported' });
      }
    }
    // Observability is never allowed to change a completed import into a 500.
    // The caller needs the per-row result even if metrics/audit infrastructure
    // is temporarily unavailable.
    this._recordMetrics({ ...summary, skipped: 0, duplicates: summary.existing });
    void Promise.resolve().then(() => auditService.logEvent({
      eventType: 'lead.extension_import', userId: createdBy,
      ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent,
      result: summary.failed ? 'partial' : 'success', details: { ...summary, requestId: meta.requestId }, module: 'lead',
    })).catch((error) => logger.warn('Lead extension-import audit failed (non-blocking)', {
      module: 'crm', action: 'lead.extension_import', requestId: meta.requestId,
      error: { message: error.message },
    }));
    return { ...summary, results };
  }

  /**
   * Run `worker(item, index)` over `items` with at most `limit` in flight,
   * resolving once all have completed. `worker` must be non-throwing (ours
   * swallow lookup errors), so one bad row never rejects the whole run.
   */
  async _runBounded(items, limit, worker) {
    if (!items.length) return;
    const size = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length));
    let next = 0;
    const runNext = async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index], index);
      }
    };
    await Promise.all(Array.from({ length: size }, () => runNext()));
  }

  /** Global dedup ladder (name+postal / phone / website). Non-blocking: a lookup
   * failure never aborts the import — the row is simply treated as non-duplicate. */
  async _isDuplicate(dto) {
    try {
      const matches = await leadService.findDuplicates({
        name: dto.name,
        postalCode: dto.address?.postalCode,
        phone: dto.phone || dto.mobile,
        website: dto.website,
      });
      return Array.isArray(matches) && matches.length > 0;
    } catch (err) {
      logger.warn('Lead import dedup lookup failed (non-blocking)', {
        module: 'crm', action: 'lead.file_import', error: { message: err.message },
      });
      return false;
    }
  }

  _recordMetrics(summary) {
    try {
      if (summary.created > 0) leadImportsTotal.inc({ result: 'imported' }, summary.created);
      const skipped = Number(summary.skipped || 0) + Number(summary.duplicates || 0);
      if (skipped > 0) leadImportsTotal.inc({ result: 'skipped' }, skipped);
      if (summary.failed > 0) leadImportsTotal.inc({ result: 'failed' }, summary.failed);
    } catch (error) {
      logger.warn('Lead import metrics failed (non-blocking)', {
        module: 'crm', action: 'lead.import.metrics', error: { message: error.message },
      });
    }
  }

  /**
   * Export matching leads to CSV / Excel / PDF.
   * @returns {Promise<{ filename:string, contentType:string, buffer:Buffer }>}
   */
  async exportLeads({ format = 'csv', filters = {} } = {}, createdBy) {
    const fmt = ['csv', 'xlsx', 'pdf'].includes(format) ? format : 'csv';
    const { search, ...listFilters } = filters;
    const leads = await this._collectForExport(listFilters, search);

    logger.info('Lead export generated', {
      module: 'crm', action: 'lead.export', format: fmt, count: leads.length, userId: createdBy,
    });

    const date = new Date().toISOString().slice(0, 10);
    if (fmt === 'xlsx') {
      return { filename: `leads-${date}.xlsx`, contentType: XLSX_MIME, buffer: await this._toXlsx(leads) };
    }
    if (fmt === 'pdf') {
      return { filename: `leads-${date}.pdf`, contentType: PDF_MIME, buffer: await this._toPdf(leads) };
    }
    return { filename: `leads-${date}.csv`, contentType: CSV_MIME, buffer: this._toCsv(leads) };
  }

  async _collectForExport(listFilters, search) {
    const out = [];
    let cursor = null;
    // Cursor paging is inherently sequential — each page needs the previous cursor.
    for (;;) {
      const { data, pagination } = await leadRepository.list({
        cursor,
        limit: EXPORT_PAGE_SIZE,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        filters: listFilters,
        search,
      });
      out.push(...(data || []));
      if (out.length >= EXPORT_CAP) return out.slice(0, EXPORT_CAP);
      if (!pagination?.hasNext || !pagination?.nextCursor) break;
      cursor = pagination.nextCursor;
    }
    return out;
  }

  _toCsv(leads) {
    const labels = EXPORT_COLUMNS.map((col) => col.label);
    const flat = leads.map((lead) => {
      const obj = {};
      for (const col of EXPORT_COLUMNS) obj[col.label] = col.value(lead);
      return obj;
    });
    const parser = new Json2CsvParser({ fields: labels, delimiter: ';', withBOM: true });
    // json2csv emits just the header row for an empty dataset.
    const csv = parser.parse(flat);
    return Buffer.from(csv, 'utf8');
  }

  async _toXlsx(leads) {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Updata CRM';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Leads');

    worksheet.columns = EXPORT_COLUMNS.map((col) => ({
      header: col.label,
      key: col.label,
      width: Math.min(40, Math.max(12, col.label.length + 6)),
    }));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 20;

    for (const lead of leads) {
      const rowData = {};
      for (const col of EXPORT_COLUMNS) rowData[col.label] = col.value(lead);
      worksheet.addRow(rowData);
    }
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async _toPdf(leads) {
    const pdf = new PDFDocument({
      size: 'A4', layout: 'landscape', margin: 40, autoFirstPage: true,
    });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve, reject) => {
      pdf.on('end', resolve);
      pdf.on('error', reject);
    });

    const margin = 40;
    const usableWidth = pdf.page.width - margin * 2;

    pdf.fontSize(18).font('Helvetica-Bold').fillColor('#111827').text('Leads Export', margin, margin);
    pdf.fontSize(9).font('Helvetica').fillColor('#6b7280')
      .text(`Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} — ${leads.length} lead(s)`, margin, margin + 24);

    const drawHeader = (y) => {
      pdf.rect(margin, y, usableWidth, 20).fill('#f3f4f6');
      pdf.fillColor('#374151').font('Helvetica-Bold').fontSize(8);
      let x = margin + 4;
      for (const col of PDF_COLUMNS) {
        pdf.text(col.label, x, y + 6, { width: col.width - 6, ellipsis: true });
        x += col.width;
      }
      return y + 24;
    };

    let y = drawHeader(margin + 48);
    for (const lead of leads) {
      if (y > pdf.page.height - margin - 18) {
        pdf.addPage();
        y = drawHeader(margin);
      }
      pdf.fillColor('#111827').font('Helvetica').fontSize(8);
      let x = margin + 4;
      for (const col of PDF_COLUMNS) {
        pdf.text(String(col.value(lead) || ''), x, y, { width: col.width - 6, ellipsis: true });
        x += col.width;
      }
      y += 16;
    }

    pdf.fontSize(7).fillColor('#9ca3af').font('Helvetica')
      .text('This PDF is a summary view. Export as CSV or Excel for the complete column set.', margin, Math.min(y + 8, pdf.page.height - margin));

    pdf.end();
    await finished;
    return Buffer.concat(chunks);
  }

  /**
   * Build an import template (header columns + one example row) so users know the
   * expected shape. CSV or Excel only.
   * @returns {Promise<{ filename:string, contentType:string, buffer:Buffer }>}
   */
  async buildTemplate(format = 'csv') {
    const fmt = ['csv', 'xlsx'].includes(format) ? format : 'csv';
    if (fmt === 'xlsx') {
      return {
        filename: 'leads-import-template.xlsx',
        contentType: XLSX_MIME,
        buffer: await this._templateXlsx(),
      };
    }
    return {
      filename: 'leads-import-template.csv',
      contentType: CSV_MIME,
      buffer: this._templateCsv(),
    };
  }

  _templateCsv() {
    const header = TEMPLATE_COLUMNS.join(';');
    const example = TEMPLATE_COLUMNS.map((col) => csvEscape(TEMPLATE_EXAMPLE[col])).join(';');
    return Buffer.from(`\uFEFF${header}\n${example}\n`, 'utf8');
  }

  async _templateXlsx() {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Updata CRM';
    const worksheet = workbook.addWorksheet('Leads');

    worksheet.columns = TEMPLATE_COLUMNS.map((col) => ({
      header: col,
      key: col,
      width: Math.min(32, Math.max(12, col.length + 6)),
    }));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
    headerRow.height = 20;

    worksheet.addRow(TEMPLATE_EXAMPLE);
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // A short instructions sheet keeps the data sheet clean.
    const info = workbook.addWorksheet('Instructions');
    info.columns = [{ width: 100 }];
    const notes = [
      'Leads import template',
      '',
      'Required column: name',
      `Optional columns: ${TEMPLATE_COLUMNS.filter((c) => c !== 'name').join(', ')}`,
      `type values: ${LEAD_TYPE_VALUES.join(' | ')} (default: ${LEAD_TYPE.BUSINESS})`,
      `status values: ${LEAD_STATUS_VALUES.join(' | ')} (default: ${LEAD_STATUS.NEW})`,
      'tags: comma-separated, e.g. prospect,heating',
      'canton: 2-letter Swiss code (e.g. ZH); country: 2-letter code (default CH)',
      'Headers are case- and spacing-insensitive (e.g. "Postal Code", "PLZ" and "zip" all map to postalCode).',
      'Delete the example row on the Leads sheet before importing.',
    ];
    notes.forEach((line) => info.addRow([line]));
    info.getRow(1).font = { bold: true, size: 14 };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}

const leadImportExportService = new LeadImportExportService();
export default leadImportExportService;
