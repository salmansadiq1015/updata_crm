import { jest, describe, it, afterEach, expect, beforeAll } from '@jest/globals';

const mockAggregate = jest.fn();

jest.unstable_mockModule('../article.model.js', () => ({
  default: { aggregate: mockAggregate },
}));

let articleRepository;

beforeAll(async () => {
  const mod = await import('../article.repository.js');
  articleRepository = mod.default;
});

describe('articleRepository.getFacets()', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns shaped facets from aggregation result', async () => {
    mockAggregate.mockResolvedValue([{
      types: [{ _id: 'MATERIAL', count: 10 }, { _id: 'SERVICE', count: 3 }],
      statuses: [{ _id: 'ACTIVE', count: 12 }, { _id: 'INACTIVE', count: 1 }],
      sources: [{ _id: 'INTERNAL', count: 8 }, { _id: 'IGH', count: 5 }],
      priceRange: [{ _id: null, min: 5, max: 9999 }],
      total: [{ count: 13 }],
    }]);

    const result = await articleRepository.getFacets({});

    expect(result.types).toEqual([
      { value: 'MATERIAL', count: 10 },
      { value: 'SERVICE', count: 3 },
    ]);
    expect(result.statuses).toEqual([
      { value: 'ACTIVE', count: 12 },
      { value: 'INACTIVE', count: 1 },
    ]);
    expect(result.sources).toEqual([
      { value: 'INTERNAL', count: 8 },
      { value: 'IGH', count: 5 },
    ]);
    expect(result.priceRange).toEqual({ min: 5, max: 9999 });
    expect(result.total).toBe(13);
  });

  it('handles empty catalog gracefully', async () => {
    mockAggregate.mockResolvedValue([{
      types: [],
      statuses: [],
      sources: [],
      priceRange: [],
      total: [],
    }]);

    const result = await articleRepository.getFacets({});

    expect(result.types).toEqual([]);
    expect(result.priceRange).toEqual({ min: 0, max: 0 });
    expect(result.total).toBe(0);
  });

  it('applies categoryId filter to match stage', async () => {
    mockAggregate.mockResolvedValue([{
      types: [], statuses: [], sources: [], priceRange: [], total: [],
    }]);

    await articleRepository.getFacets({ categoryId: 'cat123' });

    const matchStage = mockAggregate.mock.calls[0][0][0].$match;
    expect(matchStage.categoryId).toBe('cat123');
  });
});
