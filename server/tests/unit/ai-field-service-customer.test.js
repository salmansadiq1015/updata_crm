import { jest, describe, expect, test, beforeAll, beforeEach } from '@jest/globals';

const mockCreateCustomer = jest.fn();
const mockCreateReport = jest.fn();
const mockRemoveTask = jest.fn();
const mockPushStep = jest.fn();
const mockFindAssignmentById = jest.fn();
const mockFindAssignments = jest.fn();
const mockFindUsers = jest.fn();
const mockFindCustomerById = jest.fn();
const mockFindCustomers = jest.fn();
const mockFindProjectById = jest.fn();
const mockFindProjects = jest.fn();
const mockFindOrderById = jest.fn();
const mockFindOrders = jest.fn();
const mockFindInstallationById = jest.fn();
const mockFindTaskById = jest.fn();
const mockFindTasks = jest.fn();

function mockSelectLean(value) {
  return {
    select: jest.fn(() => ({
      lean: jest.fn(() => Promise.resolve(value)),
    })),
  };
}

function mockSelectLimitLean(value) {
  return {
    select: jest.fn(() => ({
      limit: jest.fn(() => ({
        lean: jest.fn(() => Promise.resolve(value)),
      })),
    })),
  };
}

jest.unstable_mockModule('../../src/modules/crm/customer.service.js', () => ({
  default: {
    create: mockCreateCustomer,
  },
}));

jest.unstable_mockModule('../../src/modules/mobile/report.service.js', () => ({
  default: {
    create: mockCreateReport,
  },
}));

jest.unstable_mockModule('../../src/modules/tasks/task.service.js', () => ({
  default: {
    remove: mockRemoveTask,
  },
}));

jest.unstable_mockModule('../../src/modules/deploy/assignment.model.js', () => ({
  default: {
    findById: mockFindAssignmentById,
    find: mockFindAssignments,
  },
}));

jest.unstable_mockModule('../../src/modules/auth/user.model.js', () => ({
  default: {
    find: mockFindUsers,
    findById: jest.fn(() => mockSelectLean(null)),
  },
}));

jest.unstable_mockModule('../../src/modules/crm/customer.model.js', () => ({
  default: {
    find: mockFindCustomers,
    findById: mockFindCustomerById,
  },
}));

jest.unstable_mockModule('../../src/modules/pm/project.model.js', () => ({
  default: {
    find: mockFindProjects,
    findById: mockFindProjectById,
  },
}));

jest.unstable_mockModule('../../src/modules/qop/order.model.js', () => ({
  default: {
    find: mockFindOrders,
    findById: mockFindOrderById,
  },
}));

jest.unstable_mockModule('../../src/modules/crm/installation.model.js', () => ({
  default: {
    findById: mockFindInstallationById,
  },
}));

jest.unstable_mockModule('../../src/modules/tasks/task.model.js', () => ({
  default: {
    findById: mockFindTaskById,
    find: mockFindTasks,
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
  const assignmentId = '64f000000000000000000010';
  const projectId = '64f000000000000000000020';
  const taskId = '64f000000000000000000050';

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
    mockCreateReport.mockResolvedValue({
      _id: '64f000000000000000000030',
      reportNumber: 'RPT-10001',
      status: 'DRAFT',
    });
    mockRemoveTask.mockResolvedValue({ deleted: true });
    mockFindAssignmentById.mockImplementation((id) => (
      mockSelectLean(String(id) === assignmentId
        ? {
          _id: assignmentId,
          assignmentNumber: 'ASN-10001',
          status: 'IN_PROGRESS',
          projectId,
          customerId: '64f000000000000000000040',
        }
        : null)
    ));
    mockFindAssignments.mockReturnValue(mockSelectLimitLean([]));
    mockFindUsers.mockReturnValue(mockSelectLimitLean([]));
    mockFindCustomerById.mockReturnValue(mockSelectLean(null));
    mockFindCustomers.mockReturnValue(mockSelectLimitLean([]));
    mockFindProjectById.mockReturnValue(mockSelectLean(null));
    mockFindProjects.mockReturnValue(mockSelectLimitLean([]));
    mockFindOrderById.mockReturnValue(mockSelectLean(null));
    mockFindOrders.mockReturnValue(mockSelectLimitLean([]));
    mockFindInstallationById.mockReturnValue(mockSelectLean(null));
    mockFindTaskById.mockImplementation((id) => (
      mockSelectLean(String(id) === taskId
        ? {
          _id: taskId,
          title: 'Check boiler pressure',
          status: 'OPEN',
          priority: 'MEDIUM',
        }
        : null)
    ));
    mockFindTasks.mockReturnValue(mockSelectLimitLean([]));
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

  test('creates a draft report against the current field assignment context', async () => {
    const result = await fieldServiceAgentWorkflow.invoke({
      agentRunId: 'run-3',
      userId,
      stepCount: 0,
      input: 'Create a draft service report for the current order: boiler inspected, burner cleaned, ignition electrode replaced, system running again.',
      entities: {
        requestContext: {
          source: 'route',
          contextModule: 'field-ops',
          recordType: 'assignment',
          recordId: assignmentId,
          orderId: assignmentId,
        },
      },
    });

    expect(mockCreateReport).toHaveBeenCalledWith(
      assignmentId,
      expect.objectContaining({
        projectId,
        status: 'DRAFT',
        // Rapport AI rewrites the dictation into report prose, so the exact
        // wording is no longer the raw input.
        workPerformed: expect.any(String),
      }),
      userId,
      { source: 'ai-agent' },
    );
    expect(result.output).toMatchObject({
      action: 'CREATE_REPORT',
      status: 'completed',
      recordType: 'workReport',
      recordId: '64f000000000000000000030',
    });
  });

  test('pauses destructive task deletion until confirmation', async () => {
    const result = await fieldServiceAgentWorkflow.invoke({
      agentRunId: 'run-4',
      userId,
      permissions: ['tasks:write'],
      stepCount: 0,
      input: `delete task ${taskId}`,
      entities: {},
    });

    expect(mockRemoveTask).not.toHaveBeenCalled();
    expect(result.status).toBe('awaiting_confirmation');
    expect(result.output).toMatchObject({
      action: 'DELETE_TASK',
      status: 'awaiting_confirmation',
      confirmation: {
        recordType: 'task',
        recordId: taskId,
      },
    });
  });

  test('executes confirmed task deletion through the task service', async () => {
    const result = await fieldServiceAgentWorkflow.invoke({
      agentRunId: 'run-5',
      userId,
      permissions: ['tasks:write'],
      confirmed: true,
      stepCount: 0,
      input: `delete task ${taskId}`,
      entities: {},
    });

    expect(mockRemoveTask).toHaveBeenCalledWith(taskId, userId, { source: 'ai-agent' });
    expect(result.output).toMatchObject({
      action: 'DELETE_TASK',
      status: 'completed',
      recordType: 'task',
      recordId: taskId,
    });
  });
});
