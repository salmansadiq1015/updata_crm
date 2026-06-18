import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

const mockFind = jest.fn();
const mockAggregate = jest.fn();
const mockCountDocuments = jest.fn();

jest.unstable_mockModule('../inAppNotification.model.js', () => ({
  default: {
    find: mockFind,
    aggregate: mockAggregate,
    countDocuments: mockCountDocuments,
  },
}));

let repository;

beforeAll(async () => {
  repository = (await import('../inAppNotification.repository.js')).default;
});

afterEach(() => {
  jest.clearAllMocks();
});

function makeFindChain(docs) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(docs),
  };
}

describe('inAppNotificationRepository', () => {
  it('filters feed by unread state, category, and escaped search text', async () => {
    const chain = makeFindChain([]);
    mockFind.mockReturnValue(chain);

    await repository.findByUserId('user-1', {
      category: 'TASK',
      isRead: false,
      search: 'Pump+One',
      limit: 25,
    });

    expect(mockFind).toHaveBeenCalledTimes(1);
    const filter = mockFind.mock.calls[0][0];
    expect(filter).toMatchObject({
      userId: 'user-1',
      isDismissed: false,
      category: 'TASK',
      isRead: false,
    });
    expect(String(filter.$and[0].$or[0].title)).toContain('Pump\\+One');
    expect(chain.limit).toHaveBeenCalledWith(26);
  });

  it('returns summary totals, category counts, and pending actions', async () => {
    const action = { _id: 'n1', title: 'Approve invoice', category: 'FINANCE', priority: 'HIGH', isRead: false };
    mockAggregate.mockResolvedValue([
      {
        totals: [{ total: 4, unread: 2, highPriority: 1, critical: 0 }],
        categories: [
          { _id: 'FINANCE', total: 2, unread: 1 },
          { _id: 'TASK', total: 2, unread: 1 },
        ],
        pendingActions: [action],
      },
    ]);

    const summary = await repository.getSummary('user-1');

    expect(summary).toEqual({
      total: 4,
      unread: 2,
      highPriority: 1,
      critical: 0,
      byCategory: {
        FINANCE: { total: 2, unread: 1 },
        TASK: { total: 2, unread: 1 },
      },
      pendingActions: [action],
    });
  });
});
