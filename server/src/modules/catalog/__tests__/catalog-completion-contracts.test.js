import { jest, describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import { buildArticleSearchTokens, buildSearchTokens, normalizeSearchText } from '../catalogNormalization.js';

const mockArticleFind = jest.fn();
const mockArticleBulkWrite = jest.fn();
const mockHistoryBulkCreate = jest.fn();
const mockBatchCreate = jest.fn();
const mockBatchFindById = jest.fn();
const mockBatchUpdateStatus = jest.fn();
const mockCategoryFindById = jest.fn();
const mockCategoryUpdateById = jest.fn();
const mockCategoryFindSubtree = jest.fn();

function articleFindChain(rows) {
  const chain = {
    select: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

jest.unstable_mockModule('../article.model.js', () => ({
  default: {
    find: mockArticleFind,
    bulkWrite: mockArticleBulkWrite,
  },
}));

jest.unstable_mockModule('../priceHistory.repository.js', () => ({
  default: {
    bulkCreate: mockHistoryBulkCreate,
    findByArticleId: jest.fn(),
    findRollbackData: jest.fn(),
  },
}));

jest.unstable_mockModule('../priceUpdateBatch.repository.js', () => ({
  default: {
    create: mockBatchCreate,
    findById: mockBatchFindById,
    updateStatus: mockBatchUpdateStatus,
    findWithCursor: jest.fn(),
  },
}));

jest.unstable_mockModule('../catalogCategory.repository.js', () => ({
  default: {
    findById: mockCategoryFindById,
    updateById: mockCategoryUpdateById,
    findSubtree: mockCategoryFindSubtree,
  },
}));

jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: {
    del: jest.fn(),
    invalidatePattern: jest.fn(),
    getOrSet: jest.fn((_key, factory) => factory()),
  },
}));

jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));

jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn() },
}));

jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

let priceService;
let catalogCategoryService;

beforeAll(async () => {
  priceService = (await import('../price.service.js')).default;
  catalogCategoryService = (await import('../catalogCategory.service.js')).default;
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('catalog completion contracts', () => {
  it('builds price preview rows with two-decimal deltas', async () => {
    mockArticleFind.mockReturnValueOnce(articleFindChain([
      { _id: 'a1', articleNumber: 'A-001', name: 'Pump', basePrice: 10 },
    ]));

    const preview = await priceService.preview({
      type: 'bulk',
      updates: [{ articleId: 'a1', newPrice: 12.345 }],
    });

    expect(preview.articleCount).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      articleId: 'a1',
      oldPrice: 10,
      newPrice: 12.35,
      delta: 2.35,
    });
    expect(preview.totals).toMatchObject({ oldPrice: 10, newPrice: 12.35, delta: 2.35 });
  });

  it('stores resolved updates and preview rows for scheduled batches', async () => {
    mockArticleFind.mockReturnValueOnce(articleFindChain([
      { _id: 'a1', articleNumber: 'A-001', name: 'Pump', basePrice: 10 },
    ]));
    mockBatchCreate.mockImplementation((payload) => Promise.resolve({ _id: 'batch1', ...payload }));

    const scheduled = await priceService.scheduleUpdate({
      type: 'bulk',
      updates: [{ articleId: 'a1', newPrice: 11 }],
      scheduledDate: '2030-01-01T00:00:00.000Z',
      description: 'Future update',
    }, 'user1');

    expect(scheduled.type).toBe('SCHEDULED');
    expect(scheduled.updates).toEqual([{ articleId: 'a1', newPrice: 11 }]);
    expect(scheduled.previewRows[0]).toMatchObject({ articleNumber: 'A-001', oldPrice: 10, newPrice: 11 });
  });

  it('applies scheduled batches through price history and article bulk update', async () => {
    mockBatchFindById.mockResolvedValue({
      _id: 'batch1',
      status: 'PENDING',
      type: 'SCHEDULED',
      createdBy: 'user1',
      updates: [{ articleId: 'a1', newPrice: 15 }],
    });
    mockArticleFind.mockReturnValueOnce(articleFindChain([
      { _id: 'a1', articleNumber: 'A-001', name: 'Pump', basePrice: 10 },
    ]));
    mockHistoryBulkCreate.mockResolvedValue([]);
    mockArticleBulkWrite.mockResolvedValue({ modifiedCount: 1 });
    mockBatchUpdateStatus.mockResolvedValue({ _id: 'batch1', status: 'APPLIED' });

    const result = await priceService.applyScheduledBatch('batch1');

    expect(mockHistoryBulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ articleId: 'a1', oldPrice: 10, newPrice: 15, batchId: 'batch1' }),
    ]);
    expect(mockArticleBulkWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: { _id: 'a1', isDeleted: false },
          update: { $set: { basePrice: 15, updatedBy: 'user1' }, $inc: { version: 1 } },
        }),
      }),
    ], { ordered: false });
    expect(result).toMatchObject({ status: 'APPLIED' });
  });

  it('rejects moving a category under one of its descendants', async () => {
    mockCategoryFindById
      .mockResolvedValueOnce({ _id: 'cat1', ancestors: [] })
      .mockResolvedValueOnce({ _id: 'child1', ancestors: ['root', 'cat1'] });

    await expect(catalogCategoryService.move('cat1', 'child1', 'user1')).rejects.toThrow(
      'Category cannot be moved under one of its descendants',
    );
    expect(mockCategoryUpdateById).not.toHaveBeenCalled();
  });

  it('builds accent-insensitive article search tokens for fuzzy lookup', () => {
    expect(normalizeSearchText('Heizk\u00f6rper \u00dcberdruck')).toBe('heizkorper uberdruck');
    expect(buildSearchTokens('Heizk\u00f6rper')).toEqual(expect.arrayContaining(['hei', 'eiz', 'izk', 'zko', 'kor', 'orp', 'rpe', 'per']));
    expect(buildArticleSearchTokens({
      articleNumber: 'HK001',
      name: 'Heizk\u00f6rper',
      description: '\u00dcberdruck Ventil',
      supplierReference: 'M10X',
    })).toEqual(expect.arrayContaining(['hk001', 'hk0', 'k00', '001', 'hei', 'eiz', 'ube', 'ber', 'm10x', 'm10', '10x']));
  });
});
