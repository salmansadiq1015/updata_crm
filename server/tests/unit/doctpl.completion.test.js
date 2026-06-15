import crypto from 'crypto';
import mongoose from 'mongoose';
import { describe, expect, test, beforeAll, afterEach, afterAll } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import documentGenerationBatchRepository from '../../src/modules/doctpl/documentGenerationBatch.repository.js';
import documentTemplateRepository from '../../src/modules/doctpl/documentTemplate.repository.js';
import ciService from '../../src/modules/doctpl/ci.service.js';
import emailWebhookSecurityService from '../../src/modules/doctpl/emailWebhookSecurity.service.js';
import templateService from '../../src/modules/doctpl/template.service.js';
import qopDocumentPayloadService from '../../src/modules/qop/documentPayload.service.js';
import { ConflictError, ValidationError } from '../../src/shared/errors/AppError.js';
import { satisfiesPermission } from '../../src/shared/middleware/authenticate.js';

beforeAll(() => connectTestDb());
afterEach(() => clearTestDb());
afterAll(() => disconnectTestDb());

const userId = new mongoose.Types.ObjectId();

function validTemplate(overrides = {}) {
  return {
    templateType: 'invoice_final',
    name: 'Final Invoice',
    isActive: true,
    layout: { pageSize: 'A4', margins: { top: 25, bottom: 20, left: 20, right: 15 } },
    sections: [
      { id: 'header', name: 'Header', type: 'header', position: 1, isVisible: true },
      { id: 'body', name: 'Body', type: 'body', position: 2, isVisible: true },
      { id: 'table', name: 'Table', type: 'table', position: 3, isVisible: true },
      { id: 'deductions', name: 'Deductions', type: 'deductions', position: 4, isVisible: true },
      { id: 'totals', name: 'Totals', type: 'totals', position: 5, isVisible: true },
      { id: 'qr', name: 'QR', type: 'qr_bill', position: 6, isVisible: true },
      { id: 'footer', name: 'Footer', type: 'footer', position: 7, isVisible: true },
    ],
    textBlocks: {
      de: { footer: 'DE Footer' },
      fr: { footer: 'FR Footer' },
      it: { footer: 'IT Footer' },
      en: { footer: 'EN Footer' },
    },
    tableColumns: [
      { field: 'description', widthPercent: 70, label: { de: 'Text', fr: 'Texte', it: 'Testo', en: 'Text' } },
      { field: 'total', widthPercent: 30, label: { de: 'Total', fr: 'Total', it: 'Totale', en: 'Total' } },
    ],
    ...overrides,
  };
}

describe('Module 09 completion invariants', () => {
  test('document generation batch repository tracks item-level status', async () => {
    const batchId = crypto.randomUUID();
    const sourceRecordId = new mongoose.Types.ObjectId();
    await documentGenerationBatchRepository.create({
      batchId,
      createdBy: userId,
      items: [{
        templateType: 'quotation',
        sourceModule: 'qop',
        sourceRecordId,
        language: 'de',
        data: {},
      }],
    });

    await documentGenerationBatchRepository.markProcessing(batchId);
    await documentGenerationBatchRepository.markItemProcessing(batchId, 0);
    const documentId = new mongoose.Types.ObjectId();
    await documentGenerationBatchRepository.markItemSuccess(batchId, 0, documentId);
    await documentGenerationBatchRepository.complete(batchId, { succeeded: 1, failed: 0 });

    const batch = await documentGenerationBatchRepository.findByBatchId(batchId);
    expect(batch.status).toBe('COMPLETED');
    expect(batch.succeeded).toBe(1);
    expect(batch.failed).toBe(0);
    expect(batch.items[0]).toEqual(expect.objectContaining({
      status: 'SUCCESS',
      documentId,
    }));
  });

  test('active template validation enforces four-language labels and footer text', () => {
    expect(() => templateService._validateTemplateForSave(validTemplate())).not.toThrow();
    expect(() => templateService._validateTemplateForSave(validTemplate({
      textBlocks: {
        de: { footer: 'DE Footer' },
        fr: { footer: 'FR Footer' },
        it: { footer: '' },
        en: { footer: 'EN Footer' },
      },
    }))).toThrow(ValidationError);
    expect(() => templateService._validateTemplateForSave(validTemplate({
      tableColumns: [
        { field: 'description', widthPercent: 70, label: { de: 'Text', fr: 'Texte', it: '', en: 'Text' } },
        { field: 'total', widthPercent: 30, label: { de: 'Total', fr: 'Total', it: 'Totale', en: 'Total' } },
      ],
    }))).toThrow(ValidationError);
  });

  test('soft-deleted templates are excluded from list and detail reads', async () => {
    const template = await documentTemplateRepository.create({
      ...validTemplate(),
      createdBy: userId,
    });

    await documentTemplateRepository.softDelete(template._id);

    const detail = await documentTemplateRepository.findById(template._id);
    const list = await documentTemplateRepository.findWithCursor({ limit: 25 });

    expect(detail).toBeNull();
    expect(list.data).toHaveLength(0);
  });

  test('email webhook signature verification accepts valid HMAC and rejects invalid signatures', () => {
    const originalSecret = process.env.DOCTPL_EMAIL_WEBHOOK_SECRET;
    const payload = Buffer.from(JSON.stringify({ emailRecordId: 'abc', status: 'delivered' }));
    process.env.DOCTPL_EMAIL_WEBHOOK_SECRET = 'test-secret';
    const signature = crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');
    const req = {
      rawBody: payload,
      body: { emailRecordId: 'abc', status: 'delivered' },
      get: (header) => (header === 'x-doctpl-signature' ? signature : undefined),
      headers: {},
    };

    expect(emailWebhookSecurityService.verify(req)).toBe(true);
    expect(emailWebhookSecurityService.verify({ ...req, get: () => 'bad' })).toBe(false);
    if (originalSecret === undefined) delete process.env.DOCTPL_EMAIL_WEBHOOK_SECRET;
    else process.env.DOCTPL_EMAIL_WEBHOOK_SECRET = originalSecret;
  });

  test('CI asset validation enforces expected logo and font file types', () => {
    expect(() => ciService._validateAssetFile({
      originalname: 'mb_boiler_logo.eps',
      mimetype: 'image/x-eps',
    }, 'logo_cmyk')).not.toThrow();
    expect(() => ciService._validateAssetFile({
      originalname: 'museo-sans-500.otf',
      mimetype: 'application/x-font-opentype',
    }, 'font_500')).not.toThrow();
    expect(() => ciService._validateAssetFile({
      originalname: 'logo.txt',
      mimetype: 'text/plain',
    }, 'logo_png')).toThrow(ValidationError);
  });

  test('invoice payload exposes final deduction net VAT and total values', async () => {
    const payload = await qopDocumentPayloadService.buildInvoicePayload({
      _id: new mongoose.Types.ObjectId(),
      invoiceNumber: 'INV-2026-0042',
      invoiceType: 'FINAL',
      customerId: 'external-customer',
      customerName: 'Muster AG',
      language: 'de',
      currency: 'CHF',
      dueDate: new Date('2026-07-15T00:00:00.000Z'),
      amountDue: 750,
      advanceDeductions: [{
        advanceInvoiceNumber: 'INV-2026-0001',
        advanceInvoiceDate: new Date('2026-06-01T00:00:00.000Z'),
        netAmount: 925,
        vatAmount: 75,
        totalAmount: 1000,
      }],
    });

    expect(payload.templateType).toBe('invoice_final');
    expect(payload.data.advanceDeductions[0]).toEqual(expect.objectContaining({
      invoiceNumber: 'INV-2026-0001',
      netAmount: 925,
      vatAmount: 75,
      totalAmount: 1000,
      amount: 1000,
    }));
  });

  test('source permissions imply generated document repository read access', () => {
    expect(satisfiesPermission(['quotations:read'], 'documents:read')).toBe(true);
    expect(satisfiesPermission(['invoicing:read'], 'documents:read')).toBe(true);
    expect(satisfiesPermission(['project:documents:read'], 'documents:read')).toBe(true);
    expect(satisfiesPermission(['templates:delete'], 'documents:delete')).toBe(true);
  });
});

describe('Template conflict helper', () => {
  test('throws ConflictError when expected version does not match current version', () => {
    const expectedVersion = 2;
    const currentVersion = 3;
    const err = new ConflictError('Template has changed since it was loaded', { expectedVersion, currentVersion });
    expect(err.statusCode).toBe(409);
    expect(err.data).toEqual({ expectedVersion, currentVersion });
  });
});
