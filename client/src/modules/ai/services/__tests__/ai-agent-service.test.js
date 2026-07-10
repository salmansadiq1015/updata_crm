import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import apiClient from '@/lib/api/client';
import { aiAgentService } from '../ai-agent-service';

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.post.mockResolvedValue({ data: { agentRunId: 'run-1' } });
});

describe('aiAgentService', () => {
  it('omits null context when dispatching from the global assistant', async () => {
    await aiAgentService.dispatch('Create an urgent order', 'thread-1', 'corr-1', null);

    expect(apiClient.post).toHaveBeenCalledWith('/ai/agent/run', {
      input: 'Create an urgent order',
      threadId: 'thread-1',
      correlationId: 'corr-1',
    });
  });

  it('omits malformed context values before they reach validation', async () => {
    await aiAgentService.dispatch('Create an urgent order', 'thread-1', 'corr-1', ['bad-context']);

    expect(apiClient.post).toHaveBeenCalledWith('/ai/agent/run', {
      input: 'Create an urgent order',
      threadId: 'thread-1',
      correlationId: 'corr-1',
    });
  });

  it('preserves valid route context objects', async () => {
    const context = {
      source: 'route',
      contextModule: 'crm',
      contextRecordType: 'customer',
      contextRecordId: 'customer-1',
    };

    await aiAgentService.dispatch('Update the current customer', 'thread-1', 'corr-1', context);

    expect(apiClient.post).toHaveBeenCalledWith('/ai/agent/run', {
      input: 'Update the current customer',
      threadId: 'thread-1',
      correlationId: 'corr-1',
      context,
    });
  });
});
