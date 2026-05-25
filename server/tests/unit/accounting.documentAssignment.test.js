import { jest, describe, expect, test } from '@jest/globals';

function mockFindById(result) {
  return jest.fn(() => ({
    select: jest.fn(() => ({
      lean: jest.fn(async () => result),
    })),
  }));
}

async function loadService({
  document = null,
  documents = [],
  user = { _id: 'user-2', status: 'active', isDeleted: false },
  autoRule = null,
  notificationFails = false,
} = {}) {
  jest.resetModules();

  const accountingDocumentRepository = {
    create: jest.fn(async (data) => ({ _id: 'doc-1', ...data })),
    findById: jest.fn(async () => document),
    findByIds: jest.fn(async () => documents),
    findByHash: jest.fn(async () => null),
    assignById: jest.fn(async (id, data) => ({ _id: id, ...document, ...data })),
    bulkAssign: jest.fn(async () => ({ modifiedCount: documents.length })),
    updateById: jest.fn(async (id, data) => ({ _id: id, ...document, ...data })),
  };
  const autoAllocationRuleRepository = {
    create: jest.fn(async (data) => ({ _id: 'rule-1', ...data })),
    findById: jest.fn(async () => autoRule),
    list: jest.fn(async () => (autoRule ? [autoRule] : [])),
    updateById: jest.fn(async (id, data) => ({ _id: id, ...autoRule, ...data })),
    findMatchingRule: jest.fn(async () => autoRule),
  };
  const ocrResultRepository = {
    findByDocumentId: jest.fn(),
    updateStatus: jest.fn(),
  };
  const fileService = {
    upload: jest.fn(async () => ({ key: 'accounting/document/uploaded.pdf' })),
  };
  const queueManager = {
    addJob: jest.fn(async () => ({ id: 'job-1' })),
  };
  const notificationService = {
    sendNotification: jest.fn(async () => {
      if (notificationFails) throw new Error('notification failed');
      return { _id: 'notification-1' };
    }),
  };
  const auditService = { logEvent: jest.fn() };
  const eventBus = { publish: jest.fn() };
  const User = { findById: mockFindById(user) };

  jest.unstable_mockModule('../../src/modules/accounting/accountingDocument.repository.js', () => ({
    default: accountingDocumentRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountingDocumentAutoAllocationRule.repository.js', () => ({
    default: autoAllocationRuleRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/ocrResult.repository.js', () => ({
    default: ocrResultRepository,
  }));
  jest.unstable_mockModule('../../src/modules/files/file.service.js', () => ({
    default: fileService,
  }));
  jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
    default: queueManager,
  }));
  jest.unstable_mockModule('../../src/modules/mobile/notification.service.js', () => ({
    default: notificationService,
  }));
  jest.unstable_mockModule('../../src/modules/auth/user.model.js', () => ({
    default: User,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
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
    autoAllocationRuleRepository,
    notificationService,
    auditService,
    eventBus,
    fileService,
    queueManager,
  };
}

describe('accounting document assignment workflow', () => {
  test('validates assignee, records assignment history, and sends notification', async () => {
    const { service, accountingDocumentRepository, notificationService, eventBus } = await loadService({
      document: {
        _id: 'doc-1',
        fileName: 'supplier.pdf',
        documentType: 'SUPPLIER_INVOICE',
      },
    });

    await service.assignDocument('doc-1', 'user-2', 'user-1', {}, 'Please approve');

    expect(accountingDocumentRepository.assignById).toHaveBeenCalledWith(
      'doc-1',
      {
        assignedTo: 'user-2',
        assignedBy: 'user-1',
        note: 'Please approve',
        reason: 'MANUAL',
      },
    );
    expect(notificationService.sendNotification).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({
        notificationType: 'ACCOUNTING_DOCUMENT_ASSIGNED',
        priority: 'HIGH',
        relatedEntityType: 'ACCOUNTING_DOCUMENT',
        relatedEntityId: 'doc-1',
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      'accounting.document.assigned',
      expect.objectContaining({ documentId: 'doc-1', assignedTo: 'user-2' }),
      { source: 'accounting:documents' },
    );
  });

  test('rejects assignment to inactive employees', async () => {
    const { service, accountingDocumentRepository } = await loadService({
      user: { _id: 'user-2', status: 'deactivated', isDeleted: false },
      document: { _id: 'doc-1', fileName: 'supplier.pdf', documentType: 'SUPPLIER_INVOICE' },
    });

    await expect(service.assignDocument('doc-1', 'user-2', 'user-1'))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(accountingDocumentRepository.assignById).not.toHaveBeenCalled();
  });

  test('bulk assignment updates all selected documents and notifies assignee per document', async () => {
    const documents = [
      { _id: 'doc-1', fileName: 'one.pdf', documentType: 'RECEIPT' },
      { _id: 'doc-2', fileName: 'two.pdf', documentType: 'RECEIPT' },
    ];
    const { service, accountingDocumentRepository, notificationService } = await loadService({ documents });

    const result = await service.bulkAssign(['doc-1', 'doc-2'], 'user-2', 'user-1', {}, 'Batch review');

    expect(accountingDocumentRepository.bulkAssign).toHaveBeenCalledWith(
      ['doc-1', 'doc-2'],
      {
        assignedTo: 'user-2',
        assignedBy: 'user-1',
        note: 'Batch review',
        reason: 'BULK',
      },
    );
    expect(notificationService.sendNotification).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ modifiedCount: 2 });
  });

  test('auto-allocation rule assigns uploaded document without blocking OCR queueing', async () => {
    const { service, accountingDocumentRepository, autoAllocationRuleRepository, notificationService, queueManager } = await loadService({
      autoRule: {
        _id: 'rule-1',
        name: 'Supplier invoices to finance',
        assignTo: 'user-2',
        createdBy: 'admin-1',
      },
    });

    const uploaded = await service.upload(
      {
        buffer: Buffer.from('invoice'),
        originalname: 'supplier.pdf',
        mimetype: 'application/pdf',
        size: 7,
      },
      { documentType: 'SUPPLIER_INVOICE', projectReference: 'PRJ-1' },
      'user-1',
    );

    expect(autoAllocationRuleRepository.findMatchingRule).toHaveBeenCalledWith({
      documentType: 'SUPPLIER_INVOICE',
      uploaderId: 'user-1',
      projectReference: 'PRJ-1',
    });
    expect(accountingDocumentRepository.assignById).toHaveBeenCalledWith(
      'doc-1',
      expect.objectContaining({
        assignedTo: 'user-2',
        assignedBy: 'admin-1',
        reason: 'AUTO_RULE',
      }),
    );
    expect(notificationService.sendNotification).toHaveBeenCalledWith('user-2', expect.any(Object));
    expect(queueManager.addJob).toHaveBeenCalledWith('ocr-processing', 'extract', {
      documentId: 'doc-1',
      userId: 'user-1',
    });
    expect(uploaded).toMatchObject({ _id: 'doc-1', assignedTo: 'user-2' });
  });

  test('creates and updates auto-allocation rules only for active assignees', async () => {
    const { service, autoAllocationRuleRepository, auditService } = await loadService({
      autoRule: { _id: 'rule-1', name: 'Existing rule', assignTo: 'user-2' },
    });

    await service.createAutoAllocationRule({
      name: 'Receipts to finance',
      documentType: 'RECEIPT',
      assignTo: 'user-2',
      priority: 10,
    }, 'admin-1');
    await service.updateAutoAllocationRule('rule-1', { priority: 5 }, 'admin-1');

    expect(autoAllocationRuleRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Receipts to finance',
      assignTo: 'user-2',
      createdBy: 'admin-1',
    }));
    expect(autoAllocationRuleRepository.updateById).toHaveBeenCalledWith(
      'rule-1',
      expect.objectContaining({ priority: 5, updatedBy: 'admin-1' }),
    );
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.document.auto_allocation_rule.created',
      result: 'success',
    }));
  });
});
