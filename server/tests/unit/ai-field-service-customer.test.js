import { jest, describe, expect, test, beforeAll, beforeEach } from '@jest/globals';

const mockCreateCustomer = jest.fn();
const mockPushStep = jest.fn();

jest.unstable_mockModule('../../src/modules/crm/customer.service.js', () => ({
  default: {
    create: mockCreateCustomer,
  },
}));

jest.unstable_mockModule('../../src/modules/ai/agent/agentRun.repository.js', () => ({
  default: {
    pushStep: mockPushStep,
  },
}));

jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('field service agent customer creation', () => {
  let fieldServiceAgentWorkflow;
  const userId = '64f000000000000000000001';

  beforeAll(async () => {
    ({ fieldServiceAgentWorkflow } = await import('../../src/modules/ai/workflows/fieldServiceAgent.workflow.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPushStep.mockResolvedValue(null);
    mockCreateCustomer.mockResolvedValue({
      _id: '64f000000000000000000099',
      customerNumber: 'K-10001',
      name: 'Muster AG',
      type: 'business',
      ownerName: 'Max Muster',
      uidNumber: 'CHE-123.456.789',
    });
  });

  test('creates a company with owner name and UID through the CRM service', async () => {
    const result = await fieldServiceAgentWorkflow.invoke({
      agentRunId: 'run-1',
      userId,
      stepCount: 0,
      input: 'create company Muster AG owner Max Muster uid CHE-123.456.789 at Bahnhofstrasse 1 8001 Zurich',
      entities: {},
    });

    expect(mockCreateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'business',
        name: 'Muster AG',
        ownerName: 'Max Muster',
        uidNumber: 'CHE-123.456.789',
        street: expect.stringContaining('Bahnhofstrasse'),
        postalCode: '8001',
      }),
      userId,
      { source: 'ai-agent' },
    );
    expect(result.output).toMatchObject({
      action: 'CREATE_CUSTOMER',
      status: 'completed',
      recordType: 'customer',
      recordId: '64f000000000000000000099',
    });
  });

  test('asks follow-up questions when company identity fields are missing', async () => {
    const result = await fieldServiceAgentWorkflow.invoke({
      agentRunId: 'run-2',
      userId,
      stepCount: 0,
      input: 'create company Muster AG',
      entities: {},
    });

    expect(mockCreateCustomer).not.toHaveBeenCalled();
    expect(result.output).toMatchObject({
      action: 'CREATE_CUSTOMER',
      status: 'needs_follow_up',
    });
    expect(result.output.missingFields).toEqual(expect.arrayContaining([
      'owner name',
      'UID number',
      'street address with postal code and city',
    ]));
  });
});
