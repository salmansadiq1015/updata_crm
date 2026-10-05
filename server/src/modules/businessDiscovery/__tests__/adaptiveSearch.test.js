import { describe, expect, jest, test } from '@jest/globals';
import { runAdaptiveSearch } from '../engine/adaptiveSearch.js';

const rootCell = {
  id: '0',
  depth: 0,
  center: { lat: 48.8566, lng: 2.3522 },
  radiusMeters: 1400,
  bounds: { north: 48.8666, south: 48.8466, east: 2.366, west: 2.3384 },
};

const places = (prefix, count) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }));

describe('runAdaptiveSearch', () => {
  test('subdivides a saturated Nearby cell and emits every child batch', async () => {
    const provider = {
      searchNearby: jest.fn(async ({ radiusMeters }) => ({
        places: radiusMeters > 1000 ? places('parent', 20) : places(`child-${radiusMeters}`, 3),
      })),
      searchText: jest.fn(),
    };
    const batches = [];

    const state = await runAdaptiveSearch({
      provider,
      cells: [rootCell],
      businessTypes: [{ id: 'restaurant' }],
      concurrency: 2,
      maxSearchRequests: 20,
      retryDelay: async () => {},
      onBatch: async (batch) => batches.push(batch),
    });

    expect(provider.searchNearby).toHaveBeenCalledTimes(5);
    expect(batches.flat()).toHaveLength(32);
    expect(state.regionsCompleted).toBe(5);
    expect(state.regionsTotal).toBe(5);
    expect(state.unresolvedSaturation).toBe(false);
  });

  test('reports progress after each completed region instead of waiting for the whole wave', async () => {
    const provider = {
      searchNearby: jest.fn(async ({ center }) => ({
        places: places(`ok-${center.lat}`, 1),
      })),
      searchText: jest.fn(),
    };
    const progressEvents = [];

    await runAdaptiveSearch({
      provider,
      cells: [
        rootCell,
        { ...rootCell, id: '1', center: { lat: 48.9, lng: 2.4 } },
      ],
      businessTypes: [{ id: 'restaurant' }],
      concurrency: 1,
      maxSearchRequests: 10,
      retryDelay: async () => {},
      onProgress: async (progress) => progressEvents.push(progress),
    });

    expect(progressEvents.map((event) => event.regionsCompleted)).toEqual([1, 2]);
    expect(progressEvents.every((event) => event.regionsTotal === 2)).toBe(true);
  });

  test('follows every Text Search nextPageToken and uses cell restriction bounds', async () => {
    const provider = {
      searchNearby: jest.fn(),
      searchText: jest.fn()
        .mockResolvedValueOnce({ places: places('page-1', 20), nextPageToken: 'next-1' })
        .mockResolvedValueOnce({ places: places('page-2', 5) }),
    };
    const found = [];

    const state = await runAdaptiveSearch({
      provider,
      cells: [rootCell],
      businessTypes: [{ id: 'clinic' }],
      maxSearchRequests: 10,
      retryDelay: async () => {},
      onBatch: async (batch) => found.push(...batch),
    });

    expect(provider.searchText).toHaveBeenCalledTimes(2);
    expect(provider.searchText.mock.calls[0][0].bounds).toEqual(rootCell.bounds);
    expect(provider.searchText.mock.calls[1][0].pageToken).toBe('next-1');
    expect(found).toHaveLength(25);
    expect(state.unresolvedSaturation).toBe(false);
  });

  test('retries transient provider failures and counts each real request', async () => {
    const transient = Object.assign(new Error('busy'), { retryable: true, code: 'DISCOVERY_PROVIDER_ERROR' });
    const provider = {
      searchNearby: jest.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce({ places: places('ok', 2) }),
      searchText: jest.fn(),
    };

    const state = await runAdaptiveSearch({
      provider,
      cells: [rootCell],
      businessTypes: [{ id: 'restaurant' }],
      maxSearchRequests: 10,
      retryDelay: async () => {},
    });

    expect(provider.searchNearby).toHaveBeenCalledTimes(2);
    expect(state.searchRequests).toBe(2);
    expect(state.errors).toBe(0);
  });

  test('reports unresolved coverage instead of pretending budget exhaustion is complete', async () => {
    const provider = {
      searchNearby: jest.fn().mockResolvedValue({ places: places('full', 20) }),
      searchText: jest.fn(),
    };

    const state = await runAdaptiveSearch({
      provider,
      cells: [rootCell],
      businessTypes: [{ id: 'restaurant' }],
      maxSearchRequests: 1,
      retryDelay: async () => {},
    });

    expect(state.budgetExhausted).toBe(true);
    expect(state.unresolvedSaturation).toBe(true);
  });
});
