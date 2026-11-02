import { businessCategory } from '../shared/business-category';
import { CSV_HEADERS } from '../shared/constants';
import type { ExportSummary, Lead, SearchRecord } from '../shared/types';
import { slugify } from '../shared/utils';

// User-facing "Download" columns \u2014 the full normalized business record (type,
// area/city/state/country, rating + reviews, hours, status, coordinates, Maps
// link). This is NOT the CRM import payload: the CRM import contract lives in
// crm-api (bulk-import JSON, with a separate CSV fallback), so enriching this
// export cannot break imports.
const valueFor = (lead: Lead, header: string): string | number => {
  const num = (value: number | null | undefined): string | number => (typeof value === 'number' && Number.isFinite(value) ? value : '');
  const values: Record<string, string | number | null> = {
    'Business Name': lead.businessName,
    'Search Categories': (lead.discoveryCategories ?? []).join('; '),
    Category: businessCategory(lead),
    Phone: lead.phone,
    'International Phone': lead.internationalPhone,
    Email: lead.emails.join('; '),
    Website: lead.website,
    Address: lead.address,
    Street: lead.street,
    Area: lead.area,
    City: lead.city,
    State: lead.state,
    'Postal Code': lead.postalCode,
    Country: lead.country,
    Latitude: num(lead.latitude),
    Longitude: num(lead.longitude),
    'Distance KM': num(lead.distanceKm),
    Rating: num(lead.rating),
    'Review Count': num(lead.reviewCount),
    'Business Status': lead.businessStatus,
    'Opening Hours': (lead.openingHours ?? []).join(' | '),
    'Google Maps URL': lead.googleMapsUrl,
    Source: lead.source,
    'Email Source': lead.emailSource,
    'Email Confidence': lead.emailConfidence,
    'Discovered At': lead.discoveredAt
  };
  return values[header] ?? '';
};

export function toCsv(leads: Lead[]): string {
  const rows = [CSV_HEADERS.join(',')];
  for (const lead of leads) rows.push(CSV_HEADERS.map((header) => escapeCsv(valueFor(lead, header))).join(','));
  return `\uFEFF${rows.join('\r\n')}`;
}

export function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createXlsx(leads: Lead[], search: SearchRecord | null): ArrayBuffer {
  const rows = leads.map((lead) => CSV_HEADERS.map((header) => valueFor(lead, header)));
  const summary = summaryFor(leads, search);
  const sheets = [
    { name: 'Leads', rows: [CSV_HEADERS as readonly (string | number)[], ...rows] },
    { name: 'Summary', rows: [['Metric', 'Value'], ['Total discovered', summary.totalDiscovered], ['Unique leads', summary.uniqueLeads], ['Phone available', summary.phoneAvailable], ['Website available', summary.websiteAvailable], ['Email available', summary.emailAvailable], ['Average rating', summary.averageRating ?? '']] },
    { name: 'Search Details', rows: search ? [['Business types', search.businessTypes?.join(' | ') || search.campaign?.selectedBusinessTypes.join(' | ') || search.businessType], ['Location', search.location], ['Radius', search.radiusKm ? `${search.radiusKm} km` : 'Not specified'], ['Maximum per business type', search.campaign?.perTypeMaxResults ?? 'Previous shared limit'], ['Campaign maximum', search.campaign?.globalMaxResults ?? search.config?.maxResults ?? ''], ['Search query', search.query], ['Started', search.startedAt], ['Completed', search.completedAt ?? '']] : [] },
    { name: 'Campaign Types', rows: search?.campaign ? [['Order', 'Business type', 'Status', 'Discovered', 'New unique', 'Duplicates', 'Invalid', 'Enriched', 'Enrichment failed', 'Error'], ...search.campaign.tasks.map((task) => [task.order + 1, task.businessType, task.status, task.resultCount, task.newCount, task.duplicateCount, task.invalidCount, task.enrichmentCompleted, task.enrichmentFailed, task.error ?? ''])] : [['Order', 'Business type', 'Status']] }
  ];
  return buildXlsx(sheets);
}

type Sheet = { name: string; rows: readonly (readonly (string | number)[])[] };

function buildXlsx(sheets: Sheet[]): ArrayBuffer {
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: '[Content_Types].xml', data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_sheet, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`) },
    { name: '_rels/.rels', data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_sheet, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`) }
  ];
  sheets.forEach((sheet, index) => files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: xml(worksheetXml(sheet.rows)) }));
  return zipStore(files);
}

function worksheetXml(rows: readonly (readonly (string | number)[])[]): string {
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, colIndex) => cellXml(value, rowIndex + 1, colIndex + 1)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function cellXml(value: string | number, row: number, column: number): string {
  const reference = `${columnName(column)}${row}`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"><v>${value}</v></c>`;
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value ?? ''))}</t></is></c>`;
}

function columnName(column: number): string {
  let result = '';
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function xml(value: string): Uint8Array { return new TextEncoder().encode(value); }

function zipStore(files: Array<{ name: string; data: Uint8Array }>): ArrayBuffer {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0, true); view.setUint16(8, 0, true); view.setUint32(14, crc32(file.data), true); view.setUint32(18, file.data.length, true); view.setUint32(22, file.data.length, true); view.setUint16(26, name.length, true); view.setUint16(28, 0, true); header.set(name, 30);
    chunks.push(header, file.data);
    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true); directoryView.setUint16(4, 20, true); directoryView.setUint16(6, 20, true); directoryView.setUint16(8, 0, true); directoryView.setUint16(10, 0, true); directoryView.setUint32(16, crc32(file.data), true); directoryView.setUint32(20, file.data.length, true); directoryView.setUint32(24, file.data.length, true); directoryView.setUint16(28, name.length, true); directoryView.setUint32(42, offset, true); directory.set(name, 46); central.push(directory);
    offset += header.length + file.data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22); const endView = new DataView(end.buffer); endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
  for (const chunk of [...chunks, ...central, end]) { output.set(chunk, cursor); cursor += chunk.length; }
  return output.buffer;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

export function summaryFor(leads: Lead[], search: SearchRecord | null): ExportSummary {
  const ratings = leads.map((lead) => lead.rating).filter((rating): rating is number => rating !== null);
  return {
    totalDiscovered: search?.discoveredCount ?? leads.length,
    uniqueLeads: leads.length,
    phoneAvailable: leads.filter((lead) => Boolean(lead.phone)).length,
    websiteAvailable: leads.filter((lead) => Boolean(lead.website)).length,
    emailAvailable: leads.filter((lead) => lead.emails.length > 0).length,
    averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null
  };
}

export function downloadBlob(content: BlobPart, mimeType: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const fallback = () => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  };
  if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
    chrome.downloads.download({ url, filename, saveAs: false }, () => {
      if (chrome.runtime.lastError) fallback();
    });
  } else fallback();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function filenameFor(search: SearchRecord | null, extension: 'csv' | 'xlsx'): string {
  const prefix = search ? `${search.businessTypes?.join('-') || search.businessType}-${search.location}` : 'leads';
  return `${slugify(prefix)}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
