import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import discoveryRepository from '../discovery.repository.js';
import DiscoveryResult from '../discoveryResult.model.js';

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await DiscoveryResult.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('complete discovery result persistence', () => {
  test('stores, pages, maps and selects all rows beyond the old 20-result limit', async () => {
    const sessionId = new mongoose.Types.ObjectId();
    const createdBy = new mongoose.Types.ObjectId();
    const rows = Array.from({ length: 125 }, (_, index) => ({
      createdBy,
      discoverySessionId: sessionId,
      provider: { name: 'google_places', placeId: `place-${index}` },
      business: {
        name: `Restaurant ${String(index).padStart(3, '0')}`,
        normalizedName: `restaurant ${String(index).padStart(3, '0')}`,
        primaryType: 'restaurant',
        types: ['restaurant'],
        address: { formatted: `${index} Test Street` },
        location: { type: 'Point', coordinates: [2.30 + index / 10000, 48.80 + index / 10000] },
      },
      matching: { status: 'NEW', matchedBy: [] },
      import: { status: 'NOT_IMPORTED' },
      discoveredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
      isDeleted: false,
    }));

    await discoveryRepository.bulkUpsertResults(rows);
    // Repeated overlap pages are idempotent by {session, placeId}.
    await discoveryRepository.bulkUpsertResults(rows.slice(0, 25));

    const counts = await discoveryRepository.countsForSession(sessionId, { createdBy });
    expect(counts.discovered).toBe(125);
    expect(counts.new).toBe(125);

    const listed = [];
    let cursor = null;
    do {
      const page = await discoveryRepository.listResults(sessionId, {
        cursor,
        limit: 50,
        sortBy: 'discoveredAt',
        sortOrder: 'asc',
        createdBy,
      });
      expect(page.pagination.total).toBe(125);
      listed.push(...page.data);
      cursor = page.pagination.nextCursor;
    } while (cursor);
    expect(listed).toHaveLength(125);
    expect(new Set(listed.map((row) => row.provider.placeId)).size).toBe(125);

    const markerIds = [];
    cursor = null;
    do {
      const page = await discoveryRepository.listResultMarkers(sessionId, {
        cursor,
        limit: 40,
        createdBy,
      });
      markerIds.push(...page.data.map((row) => String(row._id)));
      cursor = page.pagination.nextCursor;
    } while (cursor);
    expect(markerIds).toHaveLength(125);

    const addAll = await discoveryRepository.findResultsForImport(sessionId, {
      mode: 'new',
      createdBy,
    });
    expect(addAll).toHaveLength(125);

    const filtered = await discoveryRepository.listResults(sessionId, {
      limit: 50,
      search: 'Restaurant 124',
      createdBy,
    });
    expect(filtered.data).toHaveLength(1);
    expect(filtered.pagination.total).toBe(1);
    expect(filtered.data[0].provider.placeId).toBe('place-124');
  });
});
