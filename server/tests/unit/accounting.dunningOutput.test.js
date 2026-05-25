import { jest, describe, expect, test } from '@jest/globals';

async function loadArReceivablesService({ invoices = [] } = {}) {
  jest.resetModules();

  const dunningTemplateRepository = {
    findByLevel: jest.fn(async () => ({
      level: 1,
      subject: 'Reminder {{invoiceNumber}}',
      bodyHtml: '<p>Hello {{customerName}}, pay {{amountDue}}</p>',
      feeAmount: 5,
      graceDays: 7,
    })),
  };
  const accountingDocumentOutputService = {
    renderTemplate: jest.fn((template, data) => String(template)
      .replace('{{invoiceNumber}}', data.invoiceNumber)
      .replace('{{customerName}}', data.customerName)
      .replace('{{amountDue}}', String(data.amountDue))),
    createDunningOutput: jest.fn(async (letter) => ({ ...letter, documentId: 'doc-1', emailQueued: true })),
  };
  const Invoice = {
    find: jest.fn(() => ({
      lean: jest.fn(async () => invoices),
    })),
  };
  const Customer = {
    findById: jest.fn(() => ({
      select: jest.fn(() => ({
        lean: jest.fn(async () => ({ email: 'customer@example.test', companyName: 'Customer AG' })),
      })),
    })),
  };
  const eventBus = { publish: jest.fn() };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/accounting/dunningTemplate.repository.js', () => ({
    default: dunningTemplateRepository,
  }));
  jest.unstable_mockModule('../../src/modules/accounting/accountingDocumentOutput.service.js', () => ({
    default: accountingDocumentOutputService,
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoice.model.js', () => ({
    default: Invoice,
  }));
  jest.unstable_mockModule('../../src/modules/crm/customer.model.js', () => ({
    default: Customer,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: {
      ACCOUNTING_AR_PAYMENT_RECORDED: 'ar.payment.recorded',
      ACCOUNTING_AR_PAYMENT_ALLOCATED: 'ar.payment.allocated',
      ACCOUNTING_AR_DUNNING_GENERATED: 'ar.dunning.generated',
    },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/accounting/arReceivables.service.js')).default;
  return {
    service,
    dunningTemplateRepository,
    accountingDocumentOutputService,
    Invoice,
    Customer,
    eventBus,
    auditService,
  };
}

describe('AR dunning output', () => {
  test('renders dunning templates and archives generated PDFs', async () => {
    const invoice = {
      _id: '64f000000000000000000301',
      invoiceNumber: 'RE-301',
      customerId: '64f000000000000000000401',
      customerName: 'Fallback Customer',
      amountDue: 320,
      dueDate: new Date('2026-01-10T00:00:00.000Z'),
      currency: 'CHF',
      status: 'OVERDUE',
    };
    const { service, accountingDocumentOutputService } = await loadArReceivablesService({ invoices: [invoice] });

    const result = await service.generateDunningLettersWithOutput(
      [invoice._id],
      1,
      { format: 'pdf', sendEmail: true },
      '64f000000000000000000999',
    );

    expect(result).toHaveLength(1);
    expect(accountingDocumentOutputService.createDunningOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: invoice._id,
        invoiceNumber: 'RE-301',
        customerName: 'Customer AG',
        recipientEmail: 'customer@example.test',
        subject: 'Reminder RE-301',
        bodyHtml: '<p>Hello Customer AG, pay 320</p>',
      }),
      { format: 'pdf', sendEmail: true },
      '64f000000000000000000999',
      {},
    );
  });
});
