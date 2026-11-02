import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callingAgentApi } from '../services/calling-agent-api';

const mock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ default: mock }));
beforeEach(() => vi.clearAllMocks());

describe('all calling agents for lead assignment', () => {
  it('loads all pages so agents and assignments beyond the first page are included', async () => {
    mock.get.mockImplementation(async (_url, { params }) => ({
      data: { agents: [{ _id: `agent-${params.page}`, assignedLeadIds: params.page === 3 ? ['lead-1'] : [] }], summary: {} },
      pagination: { page: params.page, limit: 100, total: 201, pages: 3 },
    }));
    const agents = await callingAgentApi.listAll();
    expect(agents.map(agent => agent._id)).toEqual(['agent-1', 'agent-2', 'agent-3']);
    expect(agents[2].assignedLeadIds).toContain('lead-1');
    expect(mock.get).toHaveBeenCalledTimes(3);
    expect(mock.get).toHaveBeenLastCalledWith('/ai-calling/agents', { params: { page: 3, limit: 100, sort: 'name' } });
  });

  it('rejects partial results if a later page fails', async () => {
    mock.get.mockResolvedValueOnce({ data: { agents: [{ _id: 'first' }] }, pagination: { pages: 2 } }).mockRejectedValueOnce(new Error('Page unavailable'));
    await expect(callingAgentApi.listAll()).rejects.toThrow('Page unavailable');
  });
});
