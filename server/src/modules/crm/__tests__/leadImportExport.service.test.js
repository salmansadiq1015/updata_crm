import {
  jest, describe, it, beforeAll, afterEach, expect,
} from '@jest/globals';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

// ── Mock registrations (before importing the service under test) ──────────────

const mockBulkCreate = jest.fn();
const mockFindDuplicates = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
jest.unstable_mockModule('../lead.service.js', () => ({
  default: {
    bulkCreate: mockBulkCreate, findDuplicates: mockFindDuplicates, create: mockCreate, update: mockUpdate,
  },
}));

const mockList = jest.fn();
const mockGetProviderMeta = jest.fn();
jest.unstable_mockModule('../lead.repository.js', () => ({
  default: { list: mockList, getProviderMeta: mockGetProviderMeta },
}));

const mockGetNextLeadNumber = jest.fn();
// The bulk import now reserves a block of numbers in one call; delegate to the
// per-number mock so each test's numbering setup still drives the result.
const mockGetNextLeadNumberBlock = jest.fn(async (count) => {
  const out = [];
  for (let i = 0; i < Number(count || 0); i += 1) out.push(await mockGetNextLeadNumber());
  return out;
});
jest.unstable_mockModule('../counter.service.js', () => ({
  default: {
    getNextLeadNumber: mockGetNextLeadNumber,
    getNextLeadNumberBlock: mockGetNextLeadNumberBlock,
  },
}));

const mockLogEvent = jest.fn();
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: mockLogEvent },
}));

const mockMetricInc = jest.fn();
jest.unstable_mockModule('../../../metrics/index.js', () => ({
  leadImportsTotal: { inc: mockMetricInc },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let service;

beforeAll(async () => {
  service = (await import('../leadImportExport.service.js')).default;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Test helpers ──────────────────────────────────────────────────────────────

async function makeXlsx(headers, dataRows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  for (const row of dataRows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function makePdf(lines) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 40 });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    pdf.fontSize(11).font('Helvetica');
    for (const line of lines) pdf.text(line);
    pdf.end();
  });
}

const SAMPLE_LEADS = [
  {
    leadNumber: 'L-00001',
    name: 'Alpha AG',
    type: 'business',
    status: 'new',
    address: {
      street: 'Bahnhofstrasse 1', postalCode: '8001', city: 'Zürich', canton: 'ZH', country: 'CH',
    },
    phone: '+41 44 111 11 11',
    mobile: null,
    email: 'a@alpha.ch',
    website: 'https://alpha.ch',
    source: 'manual',
    assignedTo: '5f1111111111111111111111',
    sourceMetadata: { discoveredAt: new Date('2024-01-01T00:00:00Z') },
    createdAt: new Date('2024-02-02T00:00:00Z'),
  },
  {
    leadNumber: 'L-00002',
    name: 'Gamma AG',
    type: 'private',
    status: 'qualified',
    address: { city: 'Basel', country: 'CH' },
    email: 'g@gamma.ch',
    source: 'import',
    createdAt: new Date('2024-03-03T00:00:00Z'),
  },
];

// ── Import: CSV parse + map + per-row counts ──────────────────────────────────

describe('leadImportExportService.importLeads (CSV)', () => {
  it('maps rows, dedupes, and returns created/skipped/duplicates/failed counts', async () => {
    const csv = [
      'name;type;city;postalCode;phone;email;tags',
      'Alpha AG;business;Zürich;8001;+41 44 111 11 11;a@alpha.ch;prospect,heating', // created
      'Beta GmbH;business;Bern;3000;;b@beta.ch;', // duplicate (mocked)
      ';;;;;;', // skipped (empty row)
      ';business;Luzern;6000;;;', // failed (no name)
      'Gamma AG;business;Basel;4000;;g@gamma.ch;', // created
    ].join('\n');

    mockFindDuplicates.mockImplementation(async ({ name }) => (
      name === 'Beta GmbH' ? [{ method: 'NAME_ADDRESS', confidence: 0.75, lead: { _id: 'x' } }] : []
    ));
    let seq = 0;
    mockGetNextLeadNumber.mockImplementation(async () => {
      seq += 1;
      return `L-${String(seq).padStart(5, '0')}`;
    });
    mockBulkCreate.mockImplementation(async (docs) => ({
      created: docs, errors: [], insertedCount: docs.length, failedCount: 0,
    }));

    const result = await service.importLeads(
      {
        buffer: Buffer.from(csv, 'utf8'), mimetype: 'text/csv', originalname: 'leads.csv', mode: 'new',
      },
      'user-1',
      { ipAddress: '1.2.3.4' },
    );

    expect(result.format).toBe('csv');
    expect(result.summary).toEqual({
      total: 5, created: 2, skipped: 1, duplicates: 1, failed: 1,
    });
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: 'name is required' })]),
    );

    // Only the 2 valid, non-duplicate rows were bulk-created, each numbered + owned.
    const docs = mockBulkCreate.mock.calls[0][0];
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({
      name: 'Alpha AG', source: 'import', createdBy: 'user-1', leadNumber: expect.stringMatching(/^L-\d{5}$/),
    });
    expect(docs[0].address).toMatchObject({ city: 'Zürich', postalCode: '8001' });
    expect(docs[0].tags).toEqual(['prospect', 'heating']);

    // Metrics + audit recorded.
    expect(mockMetricInc).toHaveBeenCalledWith({ result: 'imported' }, 2);
    expect(mockMetricInc).toHaveBeenCalledWith({ result: 'skipped' }, 2); // skipped + duplicates
    expect(mockMetricInc).toHaveBeenCalledWith({ result: 'failed' }, 1);
    expect(mockLogEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'lead.file_import', module: 'lead',
    }));
  });

  it('reserves all lead numbers in a single block call and preserves row order (no per-row round-trip)', async () => {
    const header = 'name;city;postalCode';
    const dataRows = Array.from({ length: 50 }, (_, i) => `Biz ${i};Zürich;800${i % 10}`);
    const csv = [header, ...dataRows].join('\n');

    mockFindDuplicates.mockResolvedValue([]); // none are duplicates
    let seq = 0;
    mockGetNextLeadNumber.mockImplementation(async () => {
      seq += 1;
      return `L-${String(seq).padStart(5, '0')}`;
    });
    mockBulkCreate.mockImplementation(async (docs) => ({
      created: docs, errors: [], insertedCount: docs.length, failedCount: 0,
    }));

    const result = await service.importLeads(
      {
        buffer: Buffer.from(csv, 'utf8'), mimetype: 'text/csv', originalname: 'leads.csv', mode: 'new',
      },
      'user-1',
      {},
    );

    expect(result.summary).toEqual({
      total: 50, created: 50, skipped: 0, duplicates: 0, failed: 0,
    });
    // The whole block is reserved in ONE call — not one counter $inc per row.
    expect(mockGetNextLeadNumberBlock).toHaveBeenCalledTimes(1);
    expect(mockGetNextLeadNumberBlock).toHaveBeenCalledWith(50);
    // Dedup runs concurrently but input order is preserved for numbering.
    const docs = mockBulkCreate.mock.calls[0][0];
    expect(docs).toHaveLength(50);
    expect(docs[0].name).toBe('Biz 0');
    expect(docs[49].name).toBe('Biz 49');
  });

  it('stamps the importing user as createdBy on every row sent to bulkCreate', async () => {
    const csv = ['name;city', 'Alpha AG;Zürich', 'Beta GmbH;Bern', 'Gamma SA;Genève'].join('\n');
    mockFindDuplicates.mockResolvedValue([]);
    let seq = 0;
    mockGetNextLeadNumber.mockImplementation(async () => {
      seq += 1;
      return `L-${String(seq).padStart(5, '0')}`;
    });
    mockBulkCreate.mockImplementation(async (docs) => ({
      created: docs, errors: [], insertedCount: docs.length, failedCount: 0,
    }));

    await service.importLeads(
      { buffer: Buffer.from(csv, 'utf8'), mimetype: 'text/csv', originalname: 'leads.csv' },
      'user-9',
      {},
    );

    const docs = mockBulkCreate.mock.calls[0][0];
    expect(docs).toHaveLength(3);
    expect(docs.map((doc) => doc.createdBy)).toEqual(['user-9', 'user-9', 'user-9']);
  });

  it('counts a bulkCreate write error as failed and maps it back to its row', async () => {
    const csv = ['name', 'Alpha AG', 'Gamma AG'].join('\n');
    mockFindDuplicates.mockResolvedValue([]);
    mockGetNextLeadNumber.mockResolvedValue('L-00001');
    mockBulkCreate.mockResolvedValue({
      created: [{ _id: 'a' }],
      errors: [{ index: 1, code: 121, message: 'Document failed validation' }],
      insertedCount: 1,
      failedCount: 1,
    });

    const result = await service.importLeads(
      { buffer: Buffer.from(csv, 'utf8'), mimetype: 'text/csv', originalname: 'leads.csv' },
      'user-1',
      {},
    );

    expect(result.summary).toMatchObject({ total: 2, created: 1, failed: 1 });
    // row index 1 in the bulk batch → original file row 3 (header + 1-based).
    expect(result.errors).toEqual([{ row: 3, message: 'Document failed validation' }]);
  });

  it('treats update mode like new and warns it is unsupported for file import', async () => {
    mockFindDuplicates.mockResolvedValue([]);
    mockGetNextLeadNumber.mockResolvedValue('L-00001');
    mockBulkCreate.mockImplementation(async (docs) => ({
      created: docs, errors: [], insertedCount: docs.length, failedCount: 0,
    }));

    const result = await service.importLeads(
      {
        buffer: Buffer.from('name\nAlpha AG\n', 'utf8'), mimetype: 'text/csv', originalname: 'l.csv', mode: 'update',
      },
      'user-1',
      {},
    );

    expect(result.summary.created).toBe(1);
    expect(result.warnings.join(' ')).toMatch(/update mode is not supported/i);
  });
});

describe('leadImportExportService.importExtensionLeads', () => {
  it('imports non-Swiss Maps addresses without inventing an invalid Swiss canton', async () => {
    mockFindDuplicates.mockResolvedValue([]);
    mockCreate.mockImplementation(async (doc) => ({
      ...doc, _id: '507f1f77bcf86cd799439011', leadNumber: 'L-00042',
    }));

    const result = await service.importExtensionLeads([{
      clientId: 'local-paris-1',
      businessName: 'Paris Example Hotel',
      category: 'Hotel',
      country: 'France',
      state: 'Île-de-France',
      city: 'Paris',
      address: '1 Rue Exemple, Paris, France',
      phone: '+33 1 23 45 67 89',
      website: 'https://example.fr',
      emails: ['bonjour@example.fr'],
    }], 'user-1', { requestId: 'request-paris' });

    expect(result).toMatchObject({ total: 1, created: 1, existing: 0, failed: 0 });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      address: expect.objectContaining({ city: 'Paris', country: 'FR', canton: null }),
    }), 'user-1', expect.objectContaining({ requestId: 'request-paris' }));
  });

  it('returns row outcomes even when metrics collection throws', async () => {
    mockFindDuplicates.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ _id: '507f1f77bcf86cd799439012', leadNumber: 'L-00043' });
    mockMetricInc.mockImplementationOnce(() => { throw new Error('metrics unavailable'); });

    await expect(service.importExtensionLeads([{
      clientId: 'local-1', businessName: 'Resilient Lead',
    }], 'user-1', { requestId: 'request-metrics' })).resolves.toMatchObject({
      total: 1, created: 1, existing: 0, failed: 0,
    });
  });

  it('normalises messy Maps fields and never fails a row on junk data', async () => {
    mockFindDuplicates.mockResolvedValue([]);
    mockCreate.mockImplementation(async (doc) => ({ ...doc, _id: '507f1f77bcf86cd799439099', leadNumber: 'L-00099' }));

    const longName = 'A'.repeat(400);
    const result = await service.importExtensionLeads([
      {
        clientId: 'junk-phone',
        businessName: longName,
        // The extension sometimes stuffs non-phone text here. Must NOT fail the
        // row (the real regression: one bad phone 400'd the whole batch).
        phone: 'Hôtel Clarisse · Visited link in your Google Maps session',
        website: 'example.fr', // no scheme → normalised
        emails: ['not-an-email', 'ok@example.fr'],
        rating: '4.6', // string → coerced
        reviewCount: 1284.9, // → 1284
        latitude: 999, // out of range → dropped (no fabricated geo)
        longitude: 2.35,
      },
      { clientId: 'good-phone', businessName: 'Valid Business', phone: '+33 1 23 45 67 89' },
    ], 'user-1', { requestId: 'r-normalise' });

    // Both rows import; the junk phone never fails the batch.
    expect(result).toMatchObject({ total: 2, created: 2, existing: 0, failed: 0 });

    const junk = mockCreate.mock.calls.find((c) => c[0].name.startsWith('A'))[0];
    expect(junk.phone).toBeNull(); // junk text dropped, row still created
    expect(junk.name).toHaveLength(255); // over-long name truncated
    expect(junk.website).toBe('https://example.fr/'); // scheme added
    expect(junk.email).toBe('ok@example.fr'); // invalid email skipped, valid kept
    expect(junk.providerMeta.rating).toBe(4.6);
    expect(junk.providerMeta.reviewCount).toBe(1284);
    expect(junk.location).toBeNull(); // out-of-range latitude → no geo point

    const good = mockCreate.mock.calls.find((c) => c[0].name === 'Valid Business')[0];
    expect(good.phone).toBe('+33 1 23 45 67 89'); // valid phone preserved
  });

  // ── Enrich-on-reimport: backfill an existing lead's empty provider snapshot ──
  it('backfills an existing lead\'s missing rating breakdown on re-import without overwriting', async () => {
    mockFindDuplicates.mockResolvedValue([{ lead: { _id: 'lead-existing-1', leadNumber: 'L-00477' } }]);
    // The lead was first added from the Maps feed: it has an overall rating but
    // no per-star breakdown, no photos and no hours.
    mockGetProviderMeta.mockResolvedValue({
      _id: 'lead-existing-1',
      providerMeta: {
        rating: 4.3, reviewCount: 891, ratingDistribution: null, photos: [], openingHours: null, businessStatus: 'Open', priceLevel: null, mapsUrl: null,
      },
    });
    mockUpdate.mockResolvedValue({ _id: 'lead-existing-1' });

    const result = await service.importExtensionLeads([{
      clientId: 'reimport-1',
      businessName: 'Singapore Kitchen',
      // Re-added from the detail view, which DOES carry the histogram + photos.
      rating: 4.3,
      reviewCount: 891,
      ratingDistribution: {
        5: 600, 4: 180, 3: 60, 2: 20, 1: 31,
      },
      photos: ['https://maps.example/p1.jpg'],
      openingHours: ['Mon 09:00–18:00'],
    }], 'user-1', { requestId: 'r-reimport' });

    expect(result).toMatchObject({ total: 1, created: 0, existing: 1, failed: 0 });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const [id, set] = mockUpdate.mock.calls[0];
    expect(id).toBe('lead-existing-1');
    // Only the empty fields are filled; the already-present rating/reviewCount/
    // businessStatus are NOT in the update.
    expect(set).toEqual({
      'providerMeta.ratingDistribution': {
        one: 31, two: 20, three: 60, four: 180, five: 600,
      },
      'providerMeta.photos': [{ url: 'https://maps.example/p1.jpg', source: 'google_maps' }],
      'providerMeta.openingHours': ['Mon 09:00–18:00'],
    });
    expect(set).not.toHaveProperty('providerMeta.rating');
    expect(set).not.toHaveProperty('providerMeta.reviewCount');
    expect(set).not.toHaveProperty('providerMeta.businessStatus');
  });

  it('does not update an existing lead when the breakdown is already present', async () => {
    mockFindDuplicates.mockResolvedValue([{ lead: { _id: 'lead-existing-2', leadNumber: 'L-00500' } }]);
    mockGetProviderMeta.mockResolvedValue({
      _id: 'lead-existing-2',
      providerMeta: {
        rating: 4.2, reviewCount: 518, ratingDistribution: { one: 50, two: 16, three: 43, four: 94, five: 315 }, photos: [{ url: 'https://maps.example/old.jpg', source: 'google_maps' }], openingHours: ['Daily'], businessStatus: 'Open',
      },
    });

    const result = await service.importExtensionLeads([{
      clientId: 'reimport-2',
      businessName: 'Jawa Restaurant',
      ratingDistribution: { 5: 999, 4: 1, 3: 1, 2: 1, 1: 1 }, // would overwrite — must be ignored
      photos: ['https://maps.example/new.jpg'],
    }], 'user-1', { requestId: 'r-noop' });

    expect(result).toMatchObject({ total: 1, created: 0, existing: 1, failed: 0 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('reports an honest "existing" even when the enrichment update fails', async () => {
    mockFindDuplicates.mockResolvedValue([{ lead: { _id: 'lead-existing-3', leadNumber: 'L-00600' } }]);
    mockGetProviderMeta.mockResolvedValue({ _id: 'lead-existing-3', providerMeta: { ratingDistribution: null } });
    mockUpdate.mockRejectedValue(new Error('db unavailable'));

    const result = await service.importExtensionLeads([{
      clientId: 'reimport-3',
      businessName: 'Resilient Re-add',
      ratingDistribution: { 5: 10, 4: 1, 3: 1, 2: 1, 1: 1 },
    }], 'user-1', { requestId: 'r-enrich-fail' });

    expect(result).toMatchObject({ total: 1, created: 0, existing: 1, failed: 0 });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});

// ── Import: XLSX round-trip ───────────────────────────────────────────────────

describe('leadImportExportService.parseFile (XLSX)', () => {
  it('parses an xlsx written with exceljs back into header→value rows', async () => {
    const buffer = await makeXlsx(
      ['name', 'city', 'email', 'tags'],
      [['Delta AG', 'Zug', 'd@delta.ch', 'vip,lead']],
    );

    const parsed = await service.parseFile({ buffer, mimetype: XLSX_MIME, originalname: 'leads.xlsx' });
    expect(parsed.format).toBe('xlsx');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ name: 'Delta AG', city: 'Zug', email: 'd@delta.ch' });

    const dto = service.mapRowToLead(parsed.rows[0]);
    expect(dto).toMatchObject({ name: 'Delta AG', source: 'import', email: 'd@delta.ch' });
    expect(dto.address).toMatchObject({ city: 'Zug' });
    expect(dto.tags).toEqual(['vip', 'lead']);
  });
});

// ── Export: CSV / XLSX / PDF ──────────────────────────────────────────────────

describe('leadImportExportService.exportLeads', () => {
  it('exports CSV with a header and rows, paging the repository by filters', async () => {
    mockList.mockResolvedValueOnce({ data: SAMPLE_LEADS, pagination: { hasNext: false, nextCursor: null } });

    const out = await service.exportLeads({ format: 'csv', filters: { status: 'new', search: 'alpha' } }, 'user-1');

    expect(out.filename).toMatch(/^leads-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(out.contentType).toContain('text/csv');
    const text = out.buffer.toString('utf8');
    expect(text).toContain('LeadNumber');
    expect(text).toContain('Alpha AG');
    expect(text).toContain('Gamma AG');
    // search is lifted out of the filter set and passed separately.
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({
      filters: { status: 'new' }, search: 'alpha',
    }));
  });

  it('still exports the assignee id now that listed leads carry populated users', async () => {
    const assignee = {
      _id: '5f1111111111111111111111', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.ch',
    };
    const creator = {
      _id: '5f2222222222222222222222', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.ch',
    };
    mockList.mockResolvedValueOnce({
      data: [{ ...SAMPLE_LEADS[0], assignedTo: assignee, createdBy: creator }],
      pagination: { hasNext: false, nextCursor: null },
    });

    const out = await service.exportLeads({ format: 'csv', filters: {} }, 'user-1');

    const text = out.buffer.toString('utf8');
    expect(text).toContain('5f1111111111111111111111');
    expect(text).not.toContain('[object Object]');
  });

  it('exports a valid XLSX workbook with a header row and data', async () => {
    mockList.mockResolvedValueOnce({ data: SAMPLE_LEADS, pagination: { hasNext: false } });

    const out = await service.exportLeads({ format: 'xlsx', filters: {} }, 'user-1');
    expect(out.contentType).toBe(XLSX_MIME);
    expect(out.buffer.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out.buffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).getCell(1).value).toBe('LeadNumber');
    expect(ws.getRow(1).getCell(2).value).toBe('Name');
    expect(ws.getRow(2).getCell(2).value).toBe('Alpha AG');
  });

  it('exports a PDF buffer', async () => {
    mockList.mockResolvedValueOnce({ data: SAMPLE_LEADS, pagination: { hasNext: false } });

    const out = await service.exportLeads({ format: 'pdf', filters: {} }, 'user-1');
    expect(out.contentType).toBe('application/pdf');
    expect(out.buffer.length).toBeGreaterThan(0);
    expect(out.buffer.slice(0, 4).toString('latin1')).toBe('%PDF');
  });

  it('pages through multiple cursor pages until hasNext is false', async () => {
    mockList
      .mockResolvedValueOnce({ data: [SAMPLE_LEADS[0]], pagination: { hasNext: true, nextCursor: 'c1' } })
      .mockResolvedValueOnce({ data: [SAMPLE_LEADS[1]], pagination: { hasNext: false, nextCursor: null } });

    const out = await service.exportLeads({ format: 'csv', filters: {} }, 'user-1');
    const text = out.buffer.toString('utf8');
    expect(text).toContain('Alpha AG');
    expect(text).toContain('Gamma AG');
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(mockList.mock.calls[1][0]).toMatchObject({ cursor: 'c1' });
  });
});

// ── Template ──────────────────────────────────────────────────────────────────

describe('leadImportExportService.buildTemplate', () => {
  it('builds a CSV template with the documented headers', async () => {
    const out = await service.buildTemplate('csv');
    expect(out.filename).toBe('leads-import-template.csv');
    const text = out.buffer.toString('utf8');
    expect(text).toContain('name');
    expect(text).toContain('postalCode');
    expect(text).toContain('tags');
  });

  it('builds an XLSX template with headers on the Leads sheet', async () => {
    const out = await service.buildTemplate('xlsx');
    expect(out.filename).toBe('leads-import-template.xlsx');
    expect(out.buffer.length).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(out.buffer);
    expect(wb.getWorksheet('Leads').getRow(1).getCell(1).value).toBe('name');
  });
});

// ── Guards ────────────────────────────────────────────────────────────────────

describe('leadImportExportService.parseFile guards', () => {
  it('rejects a file larger than the 10 MB limit (413)', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
    await expect(service.parseFile({ buffer: big, mimetype: 'text/csv', originalname: 'big.csv' }))
      .rejects.toMatchObject({ statusCode: 413, code: 'LEAD_IMPORT_FAILED' });
  });

  it('rejects an import with more than 10000 rows (400)', async () => {
    const body = Array.from({ length: 10001 }, (_, i) => `Lead ${i}`).join('\n');
    const buffer = Buffer.from(`name\n${body}\n`, 'utf8');
    await expect(service.parseFile({ buffer, mimetype: 'text/csv', originalname: 'many.csv' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'LEAD_IMPORT_FAILED' });
  });

  it('rejects an unsupported file type (400)', async () => {
    await expect(service.parseFile({ buffer: Buffer.from('x'), mimetype: 'image/png', originalname: 'x.png' }))
      .rejects.toMatchObject({ statusCode: 400, code: 'LEAD_IMPORT_FAILED' });
  });
});

// ── PDF best-effort ───────────────────────────────────────────────────────────

describe('leadImportExportService.parseFile (PDF best-effort)', () => {
  it('returns a clear warning and no rows for a non-table PDF', async () => {
    const buffer = await makePdf([
      'This is a prose paragraph about nothing in particular.',
      'There are no columns or tables anywhere on this page.',
    ]);

    const parsed = await service.parseFile({ buffer, mimetype: 'application/pdf', originalname: 'leads.pdf' });
    expect(parsed.format).toBe('pdf');
    expect(Array.isArray(parsed.rows)).toBe(true);
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings.join(' ')).toMatch(/best-effort/i);
  });

  it('best-effort extracts rows from a delimited table PDF (or warns)', async () => {
    const buffer = await makePdf(['name;city;email', 'Omega AG;Chur;o@omega.ch']);

    const parsed = await service.parseFile({ buffer, mimetype: 'application/pdf', originalname: 'table.pdf' });
    expect(Array.isArray(parsed.rows)).toBe(true);
    expect(parsed.warnings.join(' ')).toMatch(/best-effort/i);
    if (parsed.rows.length) {
      expect(parsed.rows[0].name || parsed.rows[0].Name).toBeTruthy();
    }
  });
});
