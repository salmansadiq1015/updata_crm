import request from 'supertest';
import express from 'express';
import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// End-to-end at the HTTP boundary: the real `validate(bulkImport)` gate + the
// real `importExtensionLeads` service, with only the persistence layer mocked.
// This proves the production regression is fixed through the full request path:
// one bad row (junk/over-long phone) must NOT 400 the batch, and genuine
// per-row failures must stay isolated.

const mockFindDuplicates = jest.fn();
const mockCreate = jest.fn();
jest.unstable_mockModule('../lead.service.js', () => ({
  default: { bulkCreate: jest.fn(), findDuplicates: mockFindDuplicates, create: mockCreate },
}));
jest.unstable_mockModule('../lead.repository.js', () => ({ default: { list: jest.fn() } }));
jest.unstable_mockModule('../counter.service.js', () => ({ default: { getNextLeadNumber: jest.fn() } }));
jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../../metrics/index.js', () => ({ leadImportsTotal: { inc: jest.fn() } }));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let app;

beforeAll(async () => {
  const { validate } = await import('../../../shared/validation/validate.js');
  const { bulkImport } = await import('../lead.validation.js');
  const service = (await import('../leadImportExport.service.js')).default;

  app = express();
  app.use(express.json());
  app.post('/api/v1/crm/leads/bulk-import', validate(bulkImport), async (req, res, next) => {
    try {
      const data = await service.importExtensionLeads(req.body.leads, 'user-1', {});
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({
    success: false, error: { code: err.code, message: err.message, details: err.details || [] },
  }));
});

afterEach(() => {
  mockFindDuplicates.mockReset();
  mockCreate.mockReset();
});

describe('POST /crm/leads/bulk-import (end-to-end path)', () => {
  it('imports the batch (200) even when one row has a junk/over-long phone', async () => {
    mockFindDuplicates.mockResolvedValue([]);
    mockCreate.mockImplementation(async (doc) => ({ ...doc, _id: '507f1f77bcf86cd799439011', leadNumber: 'L-00050' }));

    // 9 rows — exactly the failing screenshot — where row 7 holds non-phone text.
    const leads = Array.from({ length: 9 }, (_, i) => ({ clientId: `c${i}`, businessName: `Hotel ${i}` }));
    leads[7].phone = 'Hôtel Clarisse · Visited link in your Google Maps session';

    const res = await request(app).post('/api/v1/crm/leads/bulk-import').send({ leads });

    expect(res.status).toBe(200); // was 400 before the fix
    expect(res.body.data).toMatchObject({ total: 9, created: 9, existing: 0, failed: 0 });
    expect(res.body.data.results).toHaveLength(9);
    const row7 = mockCreate.mock.calls.find((c) => c[0].name === 'Hotel 7')[0];
    expect(row7.phone).toBeNull(); // junk dropped; the row still imports
  });

  it('isolates a genuine per-row failure without failing the whole batch', async () => {
    mockFindDuplicates.mockResolvedValue([]);
    mockCreate.mockImplementation(async (doc) => {
      if (doc.name === 'Bad Row') throw new Error('DB write failed');
      return { ...doc, _id: '507f1f77bcf86cd799439012', leadNumber: 'L-00051' };
    });

    const res = await request(app).post('/api/v1/crm/leads/bulk-import').send({
      leads: [
        { clientId: 'a', businessName: 'Good Row' },
        { clientId: 'b', businessName: 'Bad Row' },
        { clientId: 'c', businessName: 'Another Good' },
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 3, created: 2, failed: 1 });
    const failed = res.body.data.results.find((r) => r.status === 'failed');
    expect(failed.clientId).toBe('b');
  });

  it('still rejects an oversized batch (> 500) at the gate', async () => {
    const leads = Array.from({ length: 501 }, (_, i) => ({ clientId: String(i), businessName: 'X' }));
    const res = await request(app).post('/api/v1/crm/leads/bulk-import').send({ leads });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });
});
