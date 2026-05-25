import { jest, describe, expect, test } from '@jest/globals';

async function loadDocumentService({
  document = null,
  ocrResult = null,
  queueFails = false,
} = {}) {
  jest.resetModules();

  const accountingDocumentRepository = {
    create: jest.fn(async (data) => ({ _id: 'doc-1', ...data })),
    findById: jest.fn(async () => document),
    findByHash: jest.fn(async () => null),
    findWithCursor: jest.fn(),
    updateById: jest.fn(async (id, data) => ({ _id: id, ...document, ...data })),
  };
  const ocrResultRepository = {
    findByDocumentId: jest.fn(async () => ocrResult),
    updateStatus: jest.fn(async (documentId, status, data) => ({ documentId, status, ...data })),
  };
  const fileService = {
    upload: jest.fn(async () => ({ key: 'accounting/document/uploaded.pdf' })),
  };
  const storageService = {
    getPresignedUrl: jest.fn(async () => 'https://download.example/doc.pdf'),
  };
  const queueManager = {
    addJob: jest.fn(async () => {
      if (queueFails) throw new Error('queue unavailable');
      return { id: 'job-1' };
    }),
  };
  const auditService = { logEvent: jest.fn() };
  const autoAllocationRuleRepository = {
    findMatchingRule: jest.fn(async () => null),
  };

  jest.unstable_mockModule('../../src/modules/accounting/accountingDocument.repository.js', () => ({
    default: accountingDocumentRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/ocrResult.repository.js', () => ({
    default: ocrResultRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountingDocumentAutoAllocationRule.repository.js', () => ({
    default: autoAllocationRuleRepository,
  }));
  jest.unstable_mockModule('../../src/modules/files/file.service.js', () => ({
    default: fileService,
  }));
  jest.unstable_mockModule('../../src/shared/storage/StorageService.js', () => ({
    default: storageService,
  }));
  jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
    default: queueManager,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: { publish: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: {
      ACCOUNTING_DOCUMENT_UPLOADED: 'accounting.document.uploaded',
      ACCOUNTING_DOCUMENT_ASSIGNED: 'accounting.document.assigned',
    },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/accounting/accountingDocument.service.js')).default;
  return {
    service,
    accountingDocumentRepository,
    ocrResultRepository,
    fileService,
    queueManager,
    auditService,
  };
}

async function loadProvider() {
  jest.resetModules();

  jest.unstable_mockModule('../../src/config/index.js', () => ({
    default: {
      ocr: {
        provider: 'text',
        lowConfidenceThreshold: 0.8,
      },
    },
  }));

  return (await import('../../src/modules/accounting/ocrProvider.service.js')).default;
}

describe('accounting OCR workflow', () => {
  test('extracts supplier invoice fields with text OCR provider and flags low confidence fields', async () => {
    const provider = await loadProvider();
    const extracted = await provider.extract({
      document: { _id: 'doc-1', fileName: 'invoice.txt', mimeType: 'text/plain' },
      buffer: Buffer.from([
        'Supplier: Heiztechnik AG',
        'Invoice No: SUP-2026-100',
        'Invoice Date: 2026-05-12',
        'Due Date: 2026-06-11',
        'VAT: CHF 21.90',
        'Total: CHF 291.90',
      ].join('\n')),
    });

    expect(extracted.fields).toMatchObject({
      supplierName: 'Heiztechnik AG',
      invoiceNumber: 'SUP-2026-100',
      total: 291.9,
      vat: 21.9,
    });
    expect(extracted.lowConfidenceFields).toEqual(expect.arrayContaining(['supplierName', 'total']));
  });

  test('uploads supplier invoice document and queues OCR processing without blocking upload', async () => {
    const { service, fileService, accountingDocumentRepository, queueManager } = await loadDocumentService();

    await service.upload(
      {
        buffer: Buffer.from('invoice'),
        originalname: 'supplier.pdf',
        mimetype: 'application/pdf',
        size: 7,
      },
      { documentType: 'SUPPLIER_INVOICE' },
      'user-1',
    );

    expect(fileService.upload).toHaveBeenCalledWith(expect.objectContaining({
      originalName: 'supplier.pdf',
      mimeType: 'application/pdf',
      module: 'accounting',
      entityType: 'document',
      uploadedBy: 'user-1',
      bucket: 'documents',
    }));
    expect(accountingDocumentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      filePath: 'accounting/document/uploaded.pdf',
      documentType: 'SUPPLIER_INVOICE',
      ocrStatus: 'PENDING',
    }));
    expect(queueManager.addJob).toHaveBeenCalledWith('ocr-processing', 'extract', {
      documentId: 'doc-1',
      userId: 'user-1',
    });
  });

  test('explicit OCR trigger fails loudly when queue is unavailable', async () => {
    const { service, accountingDocumentRepository } = await loadDocumentService({
      queueFails: true,
      document: {
        _id: 'doc-1',
        documentType: 'SUPPLIER_INVOICE',
        ocrStatus: 'PENDING',
      },
    });

    await expect(service.triggerOcr('doc-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 503, code: 'QUEUE_ERROR' });

    expect(accountingDocumentRepository.updateById).toHaveBeenCalledWith('doc-1', { ocrStatus: 'PENDING' });
  });

  test('confirms extracted OCR result and marks document processed', async () => {
    const { service, ocrResultRepository, accountingDocumentRepository } = await loadDocumentService({
      ocrResult: {
        documentId: 'doc-1',
        status: 'EXTRACTED',
      },
    });

    await service.confirmOcrResult(
      'doc-1',
      {
        supplierName: 'Heiztechnik AG',
        invoiceNumber: 'SUP-2026-100',
        total: 291.9,
        vat: 21.9,
      },
      'user-1',
    );

    expect(ocrResultRepository.updateStatus).toHaveBeenCalledWith('doc-1', 'CONFIRMED', expect.objectContaining({
      extractedSupplierName: 'Heiztechnik AG',
      extractedInvoiceNumber: 'SUP-2026-100',
      extractedTotal: 291.9,
      extractedVat: 21.9,
      confirmedBy: 'user-1',
    }));
    expect(accountingDocumentRepository.updateById).toHaveBeenCalledWith('doc-1', expect.objectContaining({
      processingStatus: 'PROCESSED',
      ocrStatus: 'COMPLETED',
    }));
  });
});
