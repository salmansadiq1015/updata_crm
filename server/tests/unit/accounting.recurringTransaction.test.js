import { jest, describe, expect, test, beforeEach } from '@jest/globals';

async function loadRecurringService() {
  jest.resetModules();

  const recurringRepository = {
    create: jest.fn(),
    updateById: jest.fn(),
    completeExecution: jest.fn(),
    findById: jest.fn(),
    findWithFilters: jest.fn(),
    findDue: jest.fn(),
    summarize: jest.fn(),
    findRun: jest.fn(),
    createRun: jest.fn(),
    updateRun: jest.fn(),
    recentRuns: jest.fn(),
  };
  const counterService = {
    getNextRecurringTransactionNumber: jest.fn(async () => 'REC-2026-00001'),
  };
  const journalEntryService = { createManual: jest.fn() };
  const apInvoiceService = { create: jest.fn() };
  const invoiceService = { create: jest.fn() };
  const auditService = { logEvent: jest.fn() };
  const logger = { warn: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/recurringTransaction.repository.js', () => ({
    default: recurringRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accounting.counter.service.js', () => ({
    default: counterService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/journalEntry.service.js', () => ({
    default: journalEntryService,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/apInvoice.service.js', () => ({
    default: apInvoiceService,
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.service.js', () => ({
    default: invoiceService,
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: logger,
  }));

  const service = (await import('../../src/modules/accounting/recurringTransaction.service.js')).default;
  return {
    service,
    recurringRepository,
    counterService,
    journalEntryService,
    apInvoiceService,
    invoiceService,
    auditService,
  };
}

const userId = '507f1f77bcf86cd799439020';
const templateId = '507f1f77bcf86cd799439021';
const debitAccountId = '507f1f77bcf86cd799439022';
const creditAccountId = '507f1f77bcf86cd799439023';

function activeJournalTemplate(overrides = {}) {
  return {
    _id: templateId,
    recurringNumber: 'REC-2026-00001',
    name: 'Monthly rent accrual',
    transactionType: 'JOURNAL',
    status: 'ACTIVE',
    frequency: 'MONTHLY',
    interval: 1,
    startDate: new Date('2026-01-31T00:00:00.000Z'),
    nextRunDate: new Date('2026-01-31T00:00:00.000Z'),
    endDate: null,
    maxRuns: null,
    runCount: 0,
    templatePayload: {
      description: 'Rent accrual {period}',
      debitAccountId,
      creditAccountId,
      amount: 1200,
      currency: 'CHF',
    },
    ...overrides,
  };
}

describe('recurring transaction service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates draft recurring templates with generated numbers and normalized payloads', async () => {
    const { service, recurringRepository, counterService, auditService } = await loadRecurringService();
    recurringRepository.create.mockResolvedValue({ _id: templateId, recurringNumber: 'REC-2026-00001' });
    recurringRepository.findById.mockResolvedValue({ _id: templateId, recurringNumber: 'REC-2026-00001' });

    const result = await service.create({
      name: 'Monthly accrual',
      transactionType: 'journal',
      frequency: 'monthly',
      startDate: '2026-01-31',
      templatePayload: {
        description: 'Accrual',
        debitAccountId,
        creditAccountId,
        amount: 100,
        currency: 'eur',
      },
    }, userId);

    expect(counterService.getNextRecurringTransactionNumber).toHaveBeenCalled();
    expect(recurringRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      recurringNumber: 'REC-2026-00001',
      transactionType: 'JOURNAL',
      status: 'DRAFT',
      frequency: 'MONTHLY',
      nextRunDate: '2026-01-31',
      templatePayload: expect.objectContaining({ currency: 'EUR' }),
      createdBy: userId,
    }));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'accounting.recurring.created',
    }));
    expect(result.recurringNumber).toBe('REC-2026-00001');
  });

  test('rejects recurring AP bills without invoice line items', async () => {
    const { service, recurringRepository } = await loadRecurringService();

    await expect(service.create({
      name: 'Subscription',
      transactionType: 'AP_BILL',
      frequency: 'MONTHLY',
      startDate: '2026-01-01',
      templatePayload: {
        supplierId: '507f1f77bcf86cd799439024',
        supplierName: 'Supplier AG',
        supplierInvoiceNumber: 'SUBSCRIPTION',
      },
    }, userId)).rejects.toMatchObject({
      statusCode: 400,
      code: 'ACCT_RECURRING_PAYLOAD_INVALID',
    });

    expect(recurringRepository.create).not.toHaveBeenCalled();
  });

  test('executes recurring journals once per period and advances month-end dates safely', async () => {
    const { service, recurringRepository, journalEntryService } = await loadRecurringService();
    const transaction = activeJournalTemplate();
    recurringRepository.findById.mockResolvedValue(transaction);
    recurringRepository.findRun.mockResolvedValue(null);
    recurringRepository.createRun.mockResolvedValue({ _id: 'run-1' });
    recurringRepository.updateRun.mockResolvedValue({
      _id: 'run-1',
      status: 'COMPLETED',
      generatedEntityType: 'JournalEntry',
      generatedEntityId: 'journal-1',
    });
    recurringRepository.completeExecution.mockResolvedValue({ _id: templateId });
    journalEntryService.createManual.mockResolvedValue({ _id: 'journal-1' });

    const result = await service.runOne(templateId, {}, userId);

    expect(journalEntryService.createManual).toHaveBeenCalledWith(expect.objectContaining({
      entryDate: transaction.nextRunDate,
      description: 'Rent accrual 2026-01-31',
      referenceType: 'RECURRING_TRANSACTION',
      referenceId: templateId,
    }), userId, {});
    expect(recurringRepository.completeExecution).toHaveBeenCalledWith(templateId, expect.objectContaining({
      status: 'ACTIVE',
      lastRunDate: transaction.nextRunDate,
      nextRunDate: new Date('2026-02-28T00:00:00.000Z'),
      updatedBy: userId,
    }));
    expect(result).toEqual(expect.objectContaining({
      status: 'COMPLETED',
      generatedEntityType: 'JournalEntry',
      generatedEntityId: 'journal-1',
    }));
  });

  test('skips recurring runs already completed for the same period', async () => {
    const { service, recurringRepository, journalEntryService } = await loadRecurringService();
    recurringRepository.findById.mockResolvedValue(activeJournalTemplate());
    recurringRepository.findRun.mockResolvedValue({
      _id: 'run-1',
      status: 'COMPLETED',
      generatedEntityType: 'JournalEntry',
      generatedEntityId: 'journal-1',
    });

    const result = await service.runOne(templateId, {}, userId);

    expect(journalEntryService.createManual).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      status: 'SKIPPED',
      periodKey: '2026-01-31',
      generatedEntityId: 'journal-1',
    }));
  });

  test('generates AP bills with period-specific supplier invoice references', async () => {
    const { service, recurringRepository, apInvoiceService } = await loadRecurringService();
    const transaction = {
      ...activeJournalTemplate(),
      transactionType: 'AP_BILL',
      frequency: 'MONTHLY',
      nextRunDate: new Date('2026-03-01T00:00:00.000Z'),
      templatePayload: {
        supplierId: '507f1f77bcf86cd799439024',
        supplierName: 'Supplier AG',
        supplierInvoiceNumber: 'SUBSCRIPTION',
        paymentTermsDays: 15,
        lineItems: [{ description: 'Subscription', quantity: 1, unitPrice: 50, vatRate: 8.1 }],
        currency: 'CHF',
      },
    };
    recurringRepository.findById.mockResolvedValue(transaction);
    recurringRepository.findRun.mockResolvedValue(null);
    recurringRepository.createRun.mockResolvedValue({ _id: 'run-1' });
    recurringRepository.updateRun.mockResolvedValue({
      _id: 'run-1',
      status: 'COMPLETED',
      generatedEntityType: 'ApInvoice',
      generatedEntityId: 'ap-1',
    });
    recurringRepository.completeExecution.mockResolvedValue({ _id: templateId });
    apInvoiceService.create.mockResolvedValue({ _id: 'ap-1' });

    await service.runOne(templateId, {}, userId);

    expect(apInvoiceService.create).toHaveBeenCalledWith(expect.objectContaining({
      invoiceDate: transaction.nextRunDate,
      dueDate: new Date('2026-03-16T00:00:00.000Z'),
      supplierInvoiceNumber: 'SUBSCRIPTION-2026-03-01',
    }), userId, {});
  });

  test('continues due batch execution when one recurring item fails', async () => {
    const { service, recurringRepository, journalEntryService } = await loadRecurringService();
    recurringRepository.findDue.mockResolvedValue([
      activeJournalTemplate({ _id: 'template-success', recurringNumber: 'REC-1' }),
      activeJournalTemplate({ _id: 'template-fail', recurringNumber: 'REC-2' }),
    ]);
    recurringRepository.findRun.mockResolvedValue(null);
    recurringRepository.createRun
      .mockResolvedValueOnce({ _id: 'run-1' })
      .mockResolvedValueOnce({ _id: 'run-2' });
    recurringRepository.updateRun
      .mockResolvedValueOnce({
        _id: 'run-1',
        status: 'COMPLETED',
        generatedEntityType: 'JournalEntry',
        generatedEntityId: 'journal-1',
      })
      .mockResolvedValueOnce({
        _id: 'run-2',
        status: 'FAILED',
        errorMessage: 'Closed period',
      });
    recurringRepository.completeExecution.mockResolvedValue({ _id: 'template-success' });
    journalEntryService.createManual
      .mockResolvedValueOnce({ _id: 'journal-1' })
      .mockRejectedValueOnce(new Error('Closed period'));

    const result = await service.runDue({ asOfDate: '2026-01-31' }, userId);

    expect(result).toEqual(expect.objectContaining({
      processed: 2,
      succeeded: 1,
      failed: 1,
    }));
    expect(result.results[1]).toEqual(expect.objectContaining({
      recurringTransactionId: 'template-fail',
      status: 'FAILED',
      errorMessage: 'Closed period',
    }));
  });
});
