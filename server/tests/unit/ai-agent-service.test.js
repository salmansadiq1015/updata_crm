/**
 * AI Agent Service — unit tests for dispatch, confirm, and error paths.
 *
 * All external I/O is mocked. Tests verify that the service orchestrates
 * correctly without real infrastructure.
 */

import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock all dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockAgentRunId = 'run-123';

jest.unstable_mockModule('../../src/modules/ai/agent/agentRun.repository.js', () => ({
  default: {
    create: jest.fn(),
    findById: jest.fn(),
    updateById: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../src/modules/ai/agent/agent.memory.js', () => ({
  default: {
    storeConfirmation: jest.fn().mockResolvedValue(null),
  },
}));

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: {
    addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
  },
}));

jest.unstable_mockModule('../../src/shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));

jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule('../../src/config/index.js', () => ({
  default: {
    ai: { apiKey: 'test-key', model: 'gpt-4o' },
    redis: { url: 'redis://localhost:6379', db: 0, password: null, keyPrefix: 'test:' },
  },
}));

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  default: {},
  getRedisClient: () => ({
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
  }),
}));

jest.unstable_mockModule('../../src/modules/ai/agent/agent.guardrails.js', () => ({
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
  sanitizeUserInput: jest.fn().mockImplementation((s) => s.slice(0, 2000)),
  enforceMaxSteps: jest.fn(),
}));

jest.unstable_mockModule('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: JSON.stringify({ intent: 'send_notification', confidence: 0.95 }),
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentService.run()', () => {
  let agentService;
  let agentRunRepository;
  let queueManager;
  let guardrails;

  const userId = 'user-1';
  const permissions = ['tasks:create', 'notifications:send'];

  beforeAll(async () => {
    agentRunRepository = (await import('../../src/modules/ai/agent/agentRun.repository.js')).default;
    queueManager = (await import('../../src/shared/queue/QueueManager.js')).default;
    guardrails = await import('../../src/modules/ai/agent/agent.guardrails.js');
    const mod = await import('../../src/modules/ai/agent/agent.service.js');
    agentService = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    agentRunRepository.create.mockResolvedValue({
      _id: mockAgentRunId,
      userId,
      status: 'PENDING',
    });
    agentRunRepository.updateById.mockResolvedValue(null);
    queueManager.addJob.mockResolvedValue({ id: 'job-1' });
    guardrails.checkRateLimit.mockResolvedValue(undefined);
    guardrails.sanitizeUserInput.mockImplementation((s) => s.slice(0, 2000));
  });

  test('creates an agent run and enqueues a job for valid input', async () => {
    const result = await agentService.run('Create a task for pump inspection', userId, permissions);

    expect(agentRunRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      status: 'PENDING',
      input: expect.stringContaining('Create a task'),
    }));
    expect(queueManager.addJob).toHaveBeenCalledWith('ai-agent', 'execute', expect.objectContaining({
      userId: userId.toString(),
      permissions,
    }));
    expect(result).toMatchObject({ status: 'pending' });
  });

  test('returns agentRunId in the response', async () => {
    const result = await agentService.run('Send a notification to the team', userId, permissions);
    expect(result.agentRunId).toBe(mockAgentRunId);
  });

  test('sanitizes input before storing (truncates long strings)', async () => {
    const longInput = 'a'.repeat(3000);
    await agentService.run(longInput, userId, permissions);
    const createCall = agentRunRepository.create.mock.calls[0][0];
    expect(createCall.input.length).toBeLessThanOrEqual(2000);
  });

  test('marks run FAILED and throws 503 when queue is unavailable', async () => {
    queueManager.addJob.mockRejectedValueOnce(new Error('Redis connection refused'));

    await expect(
      agentService.run('Create a task for boiler check', userId, permissions)
    ).rejects.toMatchObject({ statusCode: 503 });

    expect(agentRunRepository.updateById).toHaveBeenCalledWith(
      mockAgentRunId,
      expect.objectContaining({
        status: 'FAILED',
        error: expect.objectContaining({ code: 'QUEUE_UNAVAILABLE' }),
      })
    );
  });

  test('classifies send_notification intent → NOTIFICATION workflow', async () => {
    await agentService.run('Notify the team about the maintenance window', userId, permissions);

    expect(queueManager.addJob).toHaveBeenCalledWith('ai-agent', 'execute', expect.objectContaining({
      workflowType: 'NOTIFICATION',
    }));
  });
  test('routes project automation intents to the field-service workflow', async () => {
    await agentService.run('Create a new project for Muster AG', userId, permissions);

    expect(queueManager.addJob).toHaveBeenCalledWith('ai-agent', 'execute', expect.objectContaining({
      workflowType: 'FIELD_SERVICE_AGENT',
    }));
  });

  test('routes delete commands to the field-service workflow instead of create flows', async () => {
    await agentService.run('Delete task 64f000000000000000000050', userId, permissions);

    expect(queueManager.addJob).toHaveBeenCalledWith('ai-agent', 'execute', expect.objectContaining({
      workflowType: 'FIELD_SERVICE_AGENT',
      input: expect.stringContaining('Delete task'),
    }));
  });

  test('routes report list commands to the field-service workflow', async () => {
    await agentService.run('Show all service reports', userId, permissions);

    expect(queueManager.addJob).toHaveBeenCalledWith('ai-agent', 'execute', expect.objectContaining({
      workflowType: 'FIELD_SERVICE_AGENT',
    }));
  });
});

describe('AgentService.confirmRun()', () => {
  let agentService;
  let agentRunRepository;
  let queueManager;
  let agentMemory;

  beforeAll(async () => {
    agentRunRepository = (await import('../../src/modules/ai/agent/agentRun.repository.js')).default;
    queueManager = (await import('../../src/shared/queue/QueueManager.js')).default;
    agentMemory = (await import('../../src/modules/ai/agent/agent.memory.js')).default;
    agentService = (await import('../../src/modules/ai/agent/agent.service.js')).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queueManager.addJob.mockResolvedValue({ id: 'job-1' });
    agentMemory.storeConfirmation.mockResolvedValue(null);
    agentRunRepository.updateById.mockResolvedValue(null);
  });

  function awaitingRun(userId = 'user-1') {
    return {
      _id: 'run-1',
      userId: { toString: () => userId },
      status: 'AWAITING_CONFIRMATION',
    };
  }

  test('throws 404 when run not found', async () => {
    agentRunRepository.findById.mockResolvedValueOnce(null);
    await expect(agentService.confirmRun('nonexistent', 'user-1', true)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('throws 404 when run belongs to another user', async () => {
    agentRunRepository.findById.mockResolvedValueOnce(awaitingRun('other-user'));
    await expect(agentService.confirmRun('run-1', 'user-1', true)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('throws 409 when run status is not AWAITING_CONFIRMATION', async () => {
    agentRunRepository.findById.mockResolvedValueOnce({ ...awaitingRun(), status: 'COMPLETED' });
    await expect(agentService.confirmRun('run-1', 'user-1', true)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test('enqueues resume job when decision is true', async () => {
    agentRunRepository.findById.mockResolvedValueOnce(awaitingRun());
    const result = await agentService.confirmRun('run-1', 'user-1', true);
    expect(queueManager.addJob).toHaveBeenCalledWith('ai-agent', 'resume', { agentRunId: 'run-1', userId: 'user-1' });
    expect(result).toMatchObject({ agentRunId: 'run-1', decision: true });
  });

  test('cancels run without enqueuing when decision is false', async () => {
    agentRunRepository.findById.mockResolvedValueOnce(awaitingRun());
    const result = await agentService.confirmRun('run-1', 'user-1', false);
    expect(queueManager.addJob).not.toHaveBeenCalled();
    expect(agentRunRepository.updateById).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'CANCELLED' }));
    expect(result).toMatchObject({ decision: false });
  });

  test('marks run FAILED and throws 503 when resume queue is unavailable', async () => {
    agentRunRepository.findById.mockResolvedValueOnce(awaitingRun());
    queueManager.addJob.mockRejectedValueOnce(new Error('Redis down'));
    await expect(agentService.confirmRun('run-1', 'user-1', true)).rejects.toMatchObject({ statusCode: 503 });
    expect(agentRunRepository.updateById).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'FAILED' }));
  });
});

// Guardrail behavior is covered in ai.agent.test.js which imports the real module.
// These tests verify sanitizeUserInput is called with the input string by AgentService.
describe('AgentService — sanitizeUserInput integration', () => {
  let agentService;
  let agentRunRepository;
  let queueManager;
  let guardrails;

  const userId = 'user-1';
  const permissions = ['tasks:create'];

  beforeAll(async () => {
    agentRunRepository = (await import('../../src/modules/ai/agent/agentRun.repository.js')).default;
    queueManager = (await import('../../src/shared/queue/QueueManager.js')).default;
    guardrails = await import('../../src/modules/ai/agent/agent.guardrails.js');
    agentService = (await import('../../src/modules/ai/agent/agent.service.js')).default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    agentRunRepository.create.mockResolvedValue({ _id: { toString: () => 'run-1' }, userId, status: 'PENDING' });
    agentRunRepository.updateById.mockResolvedValue(null);
    queueManager.addJob.mockResolvedValue({ id: 'job-1' });
    guardrails.checkRateLimit.mockResolvedValue(undefined);
    guardrails.sanitizeUserInput.mockImplementation((s) => s.slice(0, 2000));
  });

  test('sanitizeUserInput is called with the raw input before storing', async () => {
    const input = 'Create a task for boiler inspection';
    await agentService.run(input, userId, permissions);
    expect(guardrails.sanitizeUserInput).toHaveBeenCalledWith(input);
  });

  test('input longer than 2000 chars is truncated before storing', async () => {
    const longInput = 'x'.repeat(2500);
    await agentService.run(longInput, userId, permissions);
    const storedInput = agentRunRepository.create.mock.calls[0][0].input;
    expect(storedInput.length).toBeLessThanOrEqual(2000);
  });
});
