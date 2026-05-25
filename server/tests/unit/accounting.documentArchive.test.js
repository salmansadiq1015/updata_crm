import { jest, describe, expect, test } from '@jest/globals';
import { createStoredZip } from '../../src/shared/utils/zipStore.js';

async function loadService({ documents = [], document = null } = {}) {
  jest.resetModules();

  const accountingDocumentRepository = {
    findById: jest.fn(async () => document),
    findByIds: jest.fn(async () => documents),
    softDelete: jest.fn(async (id, userId) => ({ _id: id, isDeleted: true, deletedBy: userId })),
  };
  const ocrResultRepository = {
    findByDocumentId: jest.fn(),
    updateStatus: jest.fn(),
  };
  const storageService = {
    download: jest.fn(async (key) => Buffer.from(`content:${key}`)),
    getPresignedUrl: jest.fn(),
  };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/accountingDocument.repository.js', () => ({
    default: accountingDocumentRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/ocrResult.repository.js', () => ({
    default: ocrResultRepository,
  }));
  jest.unstable_mockModule('../../src/shared/storage/StorageService.js', () => ({
    default: storageService,
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
  return { service, accountingDocumentRepository, storageService, auditService };
}

describe('accounting document archive controls', () => {
  test('creates a valid stored ZIP archive buffer', () => {
    const archive = createStoredZip([
      { name: 'a.txt', data: Buffer.from('alpha') },
      { name: 'b.txt', data: Buffer.from('beta') },
    ]);

    expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(archive.includes(Buffer.from('a.txt'))).toBe(true);
    expect(archive.includes(Buffer.from('b.txt'))).toBe(true);
    expect(archive.subarray(-22, -18).toString('hex')).toBe('504b0506');
  });

  test('bulk downloads selected documents into a ZIP and audits access', async () => {
    const documents = [
      { _id: 'doc-1', fileName: 'invoice one.pdf', filePath: 'docs/one.pdf', createdAt: new Date() },
      { _id: 'doc-2', fileName: 'invoice two.pdf', filePath: 'docs/two.pdf', createdAt: new Date() },
    ];
    const { service, storageService, auditService } = await loadService({ documents });

    const result = await service.bulkDownload(['doc-1', 'doc-2'], 'user-1');

    expect(storageService.download).toHaveBeenCalledWith('docs/one.pdf');
    expect(storageService.download).toHaveBeenCalledWith('docs/two.pdf');
    expect(result).toMatchObject({
      contentType: 'application/zip',
      fileName: expect.stringMatching(/^accounting-documents-\d{4}-\d{2}-\d{2}\.zip$/),
    });
    expect(result.buffer.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.document.bulk_downloaded',
      result: 'success',
    }));
  });

  test('prevents deletion before retention period expires', async () => {
    const { service, accountingDocumentRepository } = await loadService({
      document: {
        _id: 'doc-1',
        retentionUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    await expect(service.deleteDocument('doc-1', 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(accountingDocumentRepository.softDelete).not.toHaveBeenCalled();
  });

  test('soft deletes only after retention period expires', async () => {
    const { service, accountingDocumentRepository } = await loadService({
      document: {
        _id: 'doc-1',
        retentionUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const deleted = await service.deleteDocument('doc-1', 'user-1');

    expect(accountingDocumentRepository.softDelete).toHaveBeenCalledWith('doc-1', 'user-1');
    expect(deleted).toMatchObject({ _id: 'doc-1', isDeleted: true, deletedBy: 'user-1' });
  });
});
