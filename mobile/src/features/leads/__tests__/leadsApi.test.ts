import type { z } from 'zod';

import { api } from '@/services/api/apiClient';

import { leadsApi } from '../api/leadsApi';

jest.mock('@/services/api/apiClient', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

type Responder = { data: unknown; pagination?: unknown };
const respond = (fixture: Responder) =>
  jest.fn(async (_url: string, ...rest: unknown[]) => {
    const schema = rest.find((arg) => arg && typeof (arg as z.ZodType).parse === 'function') as
      | z.ZodType
      | undefined;
    return { data: schema ? schema.parse(fixture.data) : fixture.data, pagination: fixture.pagination };
  });

beforeEach(() => jest.restoreAllMocks());

describe('leadsApi bulk operations', () => {
  it('maps the audited server bulk-delete result without hiding failed ids', async () => {
    jest.mocked(api.post).mockImplementation(
      respond({
        data: {
          requested: 3,
          deleted: 2,
          deletedIds: ['lead-1', 'lead-2'],
          notDeletedIds: ['lead-3'],
        },
      }) as never,
    );

    await expect(leadsApi.bulkDelete(['lead-1', 'lead-2', 'lead-3'])).resolves.toEqual({
      requested: 3,
      succeededIds: ['lead-1', 'lead-2'],
      failedIds: ['lead-3'],
    });
    expect(api.post).toHaveBeenCalledWith(
      '/crm/leads/bulk-delete',
      { leadIds: ['lead-1', 'lead-2', 'lead-3'] },
      expect.anything(),
    );
  });

  it('uses the server bulk-assignment route and supports unassigning', async () => {
    jest
      .mocked(api.post)
      .mockImplementation(
        respond({ data: { requested: 2, updated: 2, updatedIds: ['lead-1', 'lead-2'] } }) as never,
      );

    await expect(leadsApi.bulkAssign(['lead-1', 'lead-2'], null)).resolves.toEqual({
      requested: 2,
      succeededIds: ['lead-1', 'lead-2'],
      failedIds: [],
    });
    expect(api.post).toHaveBeenCalledWith(
      '/crm/leads/bulk-assign',
      { leadIds: ['lead-1', 'lead-2'], assignedTo: null },
      expect.anything(),
    );
  });

  it('accounts for every per-lead status result when only some updates succeed', async () => {
    const update = jest
      .spyOn(leadsApi, 'updateStatus')
      .mockResolvedValueOnce({ id: 'lead-1' } as never)
      .mockRejectedValueOnce(new Error('forbidden'))
      .mockResolvedValueOnce({ id: 'lead-3' } as never);

    await expect(leadsApi.bulkUpdateStatus(['lead-1', 'lead-2', 'lead-3'], 'contacted')).resolves.toEqual({
      requested: 3,
      succeededIds: ['lead-1', 'lead-3'],
      failedIds: ['lead-2'],
    });
    expect(update).toHaveBeenCalledTimes(3);
  });
});
