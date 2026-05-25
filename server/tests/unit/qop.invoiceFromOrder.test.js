import { jest, describe, expect, test } from '@jest/globals';

const order = {
  _id: '64f000000000000000000101',
  orderNumber: 'AU-2026-00001',
  sourceQuotationId: '64f000000000000000000201',
  customerId: '64f000000000000000000301',
  customerName: 'Customer AG',
  contactId: null,
  projectId: '64f000000000000000000401',
  departmentId: '64f000000000000000000501',
  language: 'de',
  title: 'Boiler installation',
  currency: 'CHF',
  globalDiscountPercent: 0,
  paymentTerms: '30 days net',
  status: 'CONFIRMED',
  grandTotalRounded: 1351.25,
  lineItems: [
    {
      position: 1,
      articleNumber: 'A-100',
      description: 'Boiler service',
      unit: 'pcs',
      quantity: 10,
      unitPrice: 100,
      discountPercent: 0,
      vatRate: 8.1,
    },
    {
      position: 2,
      articleNumber: 'A-200',
      description: 'Travel',
      unit: 'pcs',
      quantity: 5,
      unitPrice: 50,
      discountPercent: 0,
      vatRate: 8.1,
    },
  ],
};

async function loadInvoiceService({
  orderDoc = order,
  existingInvoices = [],
  advances = [],
} = {}) {
  jest.resetModules();

  const invoiceRepository = {
    create: jest.fn(async (data) => ({ _id: 'invoice-new', ...data })),
    findById: jest.fn(async (id) => ({ _id: id, hydrated: true })),
    findByOrderId: jest.fn(async () => existingInvoices),
    findAdvancesByProject: jest.fn(async () => advances),
    updateById: jest.fn(),
  };
  const orderRepository = {
    findById: jest.fn(async () => orderDoc),
    addInvoiceId: jest.fn(async () => ({ ...orderDoc, invoiceIds: ['invoice-new'] })),
  };
  const counterService = {
    getNextInvoiceNumber: jest.fn(async () => 'RE-2026-00100'),
  };
  const cacheManager = {
    del: jest.fn(async () => undefined),
    invalidatePattern: jest.fn(async () => undefined),
    getOrSet: jest.fn(async (_key, fn) => fn()),
  };
  const eventBus = { publish: jest.fn() };
  const auditService = { logEvent: jest.fn() };

  jest.unstable_mockModule('../../src/modules/qop/invoice.repository.js', () => ({
    default: invoiceRepository,
  }));
  jest.unstable_mockModule('../../src/modules/qop/order.repository.js', () => ({
    default: orderRepository,
  }));
  jest.unstable_mockModule('../../src/modules/qop/invoicePdf.service.js', () => ({
    default: { generateAndStore: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/qop/counter.service.js', () => ({
    default: counterService,
  }));
  jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
    default: cacheManager,
  }));
  jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
    default: eventBus,
  }));
  jest.unstable_mockModule('../../src/shared/events/eventTypes.js', () => ({
    default: {
      INVOICE_CREATED: 'invoice.created',
      INVOICE_FINALIZED: 'invoice.finalized',
      INVOICE_SENT: 'invoice.sent',
      INVOICE_PAYMENT_RECORDED: 'invoice.payment_recorded',
      INVOICE_PAID: 'invoice.paid',
    },
  }));
  jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
    default: { addJob: jest.fn() },
  }));
  jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
    default: auditService,
  }));
  jest.unstable_mockModule('../../src/config/index.js', () => ({
    default: { redis: { keyPrefix: 'test:' } },
  }));
  jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  }));

  const service = (await import('../../src/modules/qop/invoice.service.js')).default;
  return { service, invoiceRepository, orderRepository, counterService, eventBus, auditService };
}

describe('QOP invoice order prefill and partial invoicing', () => {
  test('creates a draft invoice from selected remaining order quantities', async () => {
    const existingInvoices = [{
      _id: 'invoice-existing',
      invoiceType: 'STANDARD',
      status: 'DRAFT',
      sourceOrderId: order._id,
      lineItems: [{ sourceOrderLinePosition: 1, quantity: 4 }],
    }];
    const { service, invoiceRepository, orderRepository } = await loadInvoiceService({ existingInvoices });

    await service.createFromOrder({
      sourceOrderId: order._id,
      dueDate: new Date('2026-06-30T00:00:00.000Z'),
      lineSelections: [
        { sourceOrderLinePosition: 1, quantity: 3 },
        { sourceOrderLinePosition: 2 },
      ],
    }, 'user-1');

    expect(invoiceRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      invoiceNumber: 'RE-2026-00100',
      invoiceType: 'STANDARD',
      sourceOrderId: order._id,
      sourceQuotationId: order.sourceQuotationId,
      customerId: order.customerId,
      amountDue: 594.55,
      paymentTermsText: '30 days net',
      lineItems: [
        expect.objectContaining({
          position: 1,
          sourceOrderLinePosition: 1,
          sourceOrderLineQuantity: 10,
          quantity: 3,
          lineTotal: 300,
        }),
        expect.objectContaining({
          position: 2,
          sourceOrderLinePosition: 2,
          sourceOrderLineQuantity: 5,
          quantity: 5,
          lineTotal: 250,
        }),
      ],
    }));
    expect(orderRepository.addInvoiceId).toHaveBeenCalledWith(order._id, 'invoice-new');
  });

  test('rejects order invoice quantities above remaining uninvoiced quantity', async () => {
    const existingInvoices = [{
      _id: 'invoice-existing',
      invoiceType: 'STANDARD',
      status: 'DRAFT',
      sourceOrderId: order._id,
      lineItems: [{ sourceOrderLinePosition: 1, quantity: 9 }],
    }];
    const { service, invoiceRepository } = await loadInvoiceService({ existingInvoices });

    await expect(service.createFromOrder({
      sourceOrderId: order._id,
      dueDate: new Date('2026-06-30T00:00:00.000Z'),
      lineSelections: [{ sourceOrderLinePosition: 1, quantity: 2 }],
    }, 'user-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(invoiceRepository.create).not.toHaveBeenCalled();
  });

  test('billing plan reports remaining quantities per order line', async () => {
    const existingInvoices = [
      {
        _id: 'invoice-standard',
        invoiceType: 'STANDARD',
        status: 'SENT',
        sourceOrderId: order._id,
        lineItems: [{ sourceOrderLinePosition: 1, quantity: 7 }],
      },
      {
        _id: 'credit-note',
        invoiceType: 'CREDIT_NOTE',
        status: 'SENT',
        sourceOrderId: order._id,
        lineItems: [{ sourceOrderLinePosition: 1, quantity: 2 }],
      },
      {
        _id: 'invoice-final',
        invoiceType: 'FINAL',
        status: 'DRAFT',
        sourceOrderId: order._id,
        lineItems: [{ position: 2, quantity: 5 }],
      },
    ];
    const { service } = await loadInvoiceService({ existingInvoices });

    const plan = await service.getBillingPlan(order._id);

    expect(plan.lineItems).toEqual([
      expect.objectContaining({
        sourceOrderLinePosition: 1,
        orderedQuantity: 10,
        invoicedQuantity: 5,
        remainingQuantity: 5,
        isFullyInvoiced: false,
      }),
      expect.objectContaining({
        sourceOrderLinePosition: 2,
        orderedQuantity: 5,
        invoicedQuantity: 5,
        remainingQuantity: 0,
        isFullyInvoiced: true,
      }),
    ]);
    expect(plan.remainingLineCount).toBe(1);
    expect(plan.isFullyInvoiced).toBe(false);
  });
});
