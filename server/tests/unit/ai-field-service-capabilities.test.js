import { jest, describe, expect, test, beforeAll, beforeEach } from '@jest/globals';

const mockCreateProject = jest.fn();
const mockCreateQuotation = jest.fn();
const mockCreateInvoice = jest.fn();
const mockCreateInvoiceFromOrder = jest.fn();
const mockCreateReminder = jest.fn();

jest.unstable_mockModule('../../src/modules/pm/project.service.js', () => ({
  default: {
    create: mockCreateProject,
  },
}));

jest.unstable_mockModule('../../src/modules/qop/quotation.service.js', () => ({
  default: {
    create: mockCreateQuotation,
  },
}));

jest.unstable_mockModule('../../src/modules/qop/invoice.service.js', () => ({
  default: {
    create: mockCreateInvoice,
    createFromOrder: mockCreateInvoiceFromOrder,
  },
}));

jest.unstable_mockModule('../../src/modules/tasks/taskReminder.service.js', () => ({
  default: {
    create: mockCreateReminder,
  },
}));

const helpers = {
  needsFollowUp: (action, missingFields, context = {}) => ({
    action,
    status: 'needs_follow_up',
    missingFields,
    resolvedContext: context,
  }),
  summarizeContext: (context) => context,
  cleanTitle: (input, removeTerms = []) => {
    let title = input;
    for (const term of removeTerms) title = title.replace(new RegExp(term, 'ig'), ' ');
    return title.replace(/\s+/g, ' ').trim();
  },
  extractPriority: () => 'MEDIUM',
  extractDate: () => new Date('2026-07-29T09:00:00.000Z'),
  extractDateTime: () => new Date('2026-07-29T09:00:00.000Z'),
  extractDurationHours: () => 2,
  objectIdValue: (value) => value?._id || value,
  extractSearchTerm: (input) => input.replace(/\b(search|find|project|order|document)\b/gi, '').trim(),
};

describe('field service AI capabilities', () => {
  let executeFieldServiceCapability;

  const userId = '64f000000000000000000001';
  const customer = {
    _id: '64f000000000000000000010',
    name: 'Muster AG',
  };
  const project = {
    _id: '64f000000000000000000020',
    name: 'Heating Upgrade',
  };
  const order = {
    _id: '64f000000000000000000030',
    orderNumber: 'AUF-10001',
  };
  const task = {
    _id: '64f000000000000000000040',
    title: 'Check boiler pressure',
  };

  beforeAll(async () => {
    ({ executeFieldServiceCapability } = await import('../../src/modules/ai/capabilities/fieldService.capabilities.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateProject.mockResolvedValue({
      _id: '64f000000000000000000101',
      projectNumber: 'PRJ-10001',
      name: 'Heating Upgrade',
      status: 'DRAFT',
      customerName: 'Muster AG',
    });
    mockCreateQuotation.mockResolvedValue({
      _id: '64f000000000000000000102',
      quotationNumber: 'OFF-10001',
      customerName: 'Muster AG',
      status: 'DRAFT',
      grandTotalRounded: 500,
    });
    mockCreateInvoice.mockResolvedValue({
      _id: '64f000000000000000000103',
      invoiceNumber: 'RE-10001',
      customerName: 'Muster AG',
      status: 'DRAFT',
      amountDue: 500,
      dueDate: new Date('2026-07-29T09:00:00.000Z'),
    });
    mockCreateInvoiceFromOrder.mockResolvedValue({
      _id: '64f000000000000000000104',
      invoiceNumber: 'RE-10002',
      customerName: 'Muster AG',
      status: 'DRAFT',
      amountDue: 1200,
      dueDate: new Date('2026-07-29T09:00:00.000Z'),
    });
    mockCreateReminder.mockResolvedValue({
      _id: '64f000000000000000000105',
      taskId: task._id,
      fireAt: new Date('2026-07-29T09:00:00.000Z'),
      channels: ['IN_APP'],
      status: 'PENDING',
    });
  });

  function run(action, input, context, permissions) {
    return executeFieldServiceCapability({
      action,
      input,
      context,
      userId,
      state: { permissions },
      helpers,
    });
  }

  test('creates a project through the project service with explicit permission', async () => {
    const result = await run(
      'CREATE_PROJECT',
      'create project Heating Upgrade for Muster AG',
      { customer },
      ['project:create'],
    );

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Heating Upgrade for Muster AG',
        customerId: customer._id,
        projectManagerId: userId,
      }),
      userId,
      { source: 'ai-agent' },
    );
    expect(result).toMatchObject({
      action: 'CREATE_PROJECT',
      status: 'completed',
      recordType: 'project',
    });
  });

  test('creates a draft quotation with parsed pricing details', async () => {
    const result = await run(
      'CREATE_QUOTATION',
      'create quotation boiler service for CHF 500',
      { customer, project },
      ['quotations:write'],
    );

    expect(mockCreateQuotation).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: customer._id,
        customerName: customer.name,
        projectId: project._id,
        lineItems: [expect.objectContaining({ unitPrice: 500, type: 'service' })],
      }),
      userId,
      { source: 'ai-agent' },
    );
    expect(result).toMatchObject({
      action: 'CREATE_QUOTATION',
      status: 'completed',
      recordType: 'quotation',
    });
  });

  test('creates an invoice from an existing order context', async () => {
    const result = await run(
      'CREATE_INVOICE',
      'create invoice for this order',
      { order },
      ['invoicing:write'],
    );

    expect(mockCreateInvoiceFromOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceOrderId: order._id,
      }),
      userId,
      { source: 'ai-agent' },
    );
    expect(mockCreateInvoice).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'CREATE_INVOICE',
      status: 'completed',
      recordType: 'invoice',
    });
  });

  test('creates an absolute in-app reminder for a resolved task', async () => {
    const result = await run(
      'CREATE_TASK_REMINDER',
      'remind me about this task on 2026-07-29 09:00',
      { task },
      ['tasks:write'],
    );

    expect(mockCreateReminder).toHaveBeenCalledWith(
      task._id,
      expect.objectContaining({
        type: 'ABSOLUTE',
        channels: ['IN_APP'],
      }),
      userId,
      { source: 'ai-agent' },
    );
    expect(result).toMatchObject({
      action: 'CREATE_TASK_REMINDER',
      status: 'completed',
      recordType: 'taskReminder',
    });
  });

  test('denies mutation capabilities without the required permission', async () => {
    const result = await run(
      'CREATE_INVOICE',
      'create invoice boiler service for CHF 500',
      { customer },
      [],
    );

    expect(mockCreateInvoice).not.toHaveBeenCalled();
    expect(mockCreateInvoiceFromOrder).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      action: 'CREATE_INVOICE',
      status: 'failed',
      error: { code: 'RBAC_DENIED' },
      requiredPermission: 'invoicing:write',
    });
  });
});
