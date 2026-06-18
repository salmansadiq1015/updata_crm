import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

let assignmentRepository;
let encodeCursor;
let originalBuildSearchClauses;

beforeAll(async () => {
  ({ encodeCursor } = await import('../../../shared/utils/pagination.js'));
  ({ default: assignmentRepository } = await import('../assignment.repository.js'));
  originalBuildSearchClauses = assignmentRepository._buildSearchClauses.bind(assignmentRepository);
});

beforeEach(() => {
  assignmentRepository._buildSearchClauses = originalBuildSearchClauses;
});

describe('assignmentRepository list filters', () => {
  it('keeps soft-delete, date, cursor, and search constraints together', async () => {
    const cursor = encodeCursor({
      _id: { toString: () => '665f1d5f0f1d5f0f1d5f0001' },
      startDatetime: new Date('2026-06-01T09:00:00.000Z'),
    }, 'startDatetime');
    const searchClause = { title: /boiler/i };
    assignmentRepository._buildSearchClauses = async () => [searchClause];

    const filter = await assignmentRepository._buildListFilter({
      filters: {
        status: 'IN_PROGRESS',
        priority: 'URGENT',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
      },
      search: 'boiler',
      cursor,
      sortBy: 'startDatetime',
      sortOrder: 'asc',
    });

    expect(filter.isDeleted).toBe(false);
    expect(filter.status).toBe('IN_PROGRESS');
    expect(filter.priority).toBe('URGENT');
    expect(filter.startDatetime.$gte).toBeInstanceOf(Date);
    expect(filter.startDatetime.$lte.getHours()).toBe(23);
    expect(filter.startDatetime.$lte.getMinutes()).toBe(59);
    expect(filter.startDatetime.$lte.getSeconds()).toBe(59);
    expect(filter.$and).toHaveLength(2);
    expect(filter.$and[0].$or).toEqual(expect.any(Array));
    expect(filter.$and[1]).toEqual({ $or: [searchClause] });
  });
});
