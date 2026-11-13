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
import { userService } from '../services/user-service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('userService', () => {
  it('updates users with PATCH so partial admin edits match the API route', async () => {
    const payload = { firstName: 'Max', city: 'Bern' };
    apiClient.patch.mockResolvedValue({ data: { _id: 'user-1', ...payload } });

    const result = await userService.updateUser('user-1', payload);

    expect(apiClient.patch).toHaveBeenCalledWith('/users/user-1', payload);
    expect(result).toEqual({ _id: 'user-1', ...payload });
  });

  it('uses status lifecycle endpoints for activation and deactivation', async () => {
    apiClient.patch.mockResolvedValueOnce({ data: { _id: 'user-1', status: 'deactivated' } });
    apiClient.patch.mockResolvedValueOnce({ data: { _id: 'user-1', status: 'active' } });

    await userService.deactivateUser('user-1');
    await userService.activateUser('user-1');

    expect(apiClient.patch).toHaveBeenNthCalledWith(1, '/users/user-1/deactivate');
    expect(apiClient.patch).toHaveBeenNthCalledWith(2, '/users/user-1/activate');
  });

  it('reads and writes direct project assignments through user endpoints', async () => {
    const params = { limit: 25, sortBy: 'projectNumber' };
    const assignment = { projectId: 'project-1', assignmentType: 'manager' };
    const listResponse = { data: [{ _id: 'project-1' }], pagination: { hasNext: false } };
    apiClient.get.mockResolvedValue(listResponse);
    apiClient.post.mockResolvedValue({ data: { _id: 'project-1', projectManagerId: 'user-1' } });

    const projects = await userService.getAssignedProjects('user-1', params);
    const assigned = await userService.assignProject('user-1', assignment);

    expect(apiClient.get).toHaveBeenCalledWith('/users/user-1/projects', { params });
    expect(projects).toBe(listResponse);
    expect(apiClient.post).toHaveBeenCalledWith('/users/user-1/projects', assignment);
    expect(assigned).toEqual({ _id: 'project-1', projectManagerId: 'user-1' });
  });

  it('normalizes assignment targets from the user-management endpoint', async () => {
    apiClient.get.mockResolvedValue({
      data: [{ _id: 'team-1', name: 'Service', code: 'SVC' }],
    });

    const result = await userService.getAssignmentTargets();

    expect(apiClient.get).toHaveBeenCalledWith('/users/assignment-targets');
    expect(result).toEqual([{ _id: 'team-1', id: 'team-1', name: 'Service', code: 'SVC' }]);
  });
});


describe('user deletion, deactivation and invitations', () => {
  it('uses distinct endpoints for deletion and deactivation', async () => {
    apiClient.delete.mockResolvedValue({ data: { deletedCount: 1 } });
    apiClient.post.mockResolvedValue({ data: { deletedCount: 2 } });
    await userService.deleteUser('one');
    await userService.bulkDelete(['one', 'two']);
    await userService.bulkDeactivate(['one', 'two']);
    await userService.resendInvitation('one');
    expect(apiClient.delete).toHaveBeenCalledWith('/users/one');
    expect(apiClient.post).toHaveBeenCalledWith('/users/bulk-delete', { ids: ['one', 'two'] });
    expect(apiClient.post).toHaveBeenCalledWith('/users/bulk-deactivate', { ids: ['one', 'two'] });
    expect(apiClient.post).toHaveBeenCalledWith('/users/one/resend-invitation');
  });
});
