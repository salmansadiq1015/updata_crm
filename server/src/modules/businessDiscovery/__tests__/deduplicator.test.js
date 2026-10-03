import { describe, test, expect } from '@jest/globals';
import { dedupeByPlaceId, mergeCellResults } from '../engine/deduplicator.js';

// Wrapper shape: { placeId, business }
const wrap = (placeId, business = {}) => ({ placeId, business: { name: `biz-${placeId}`, ...business } });

describe('dedupeByPlaceId', () => {
  test('collapses duplicates sharing a placeId, preserving first-seen order', () => {
    const out = dedupeByPlaceId([
      wrap('A'),
      wrap('B'),
      wrap('A'),
      wrap('C'),
    ]);
    expect(out.map((r) => r.placeId)).toEqual(['A', 'B', 'C']);
  });

  test('richest record wins and fills gaps from the others', () => {
    const poor = wrap('A', { phone: null, website: null, location: null });
    const rich = wrap('A', {
      phone: '+41441234567',
      website: 'https://example.com',
      websiteDomain: 'example.com',
      location: { type: 'Point', coordinates: [8.54, 47.37] },
    });
    // Poor seen first, rich second → rich must win the merge.
    const out = dedupeByPlaceId([poor, rich]);
    expect(out).toHaveLength(1);
    expect(out[0].business.phone).toBe('+41441234567');
    expect(out[0].business.websiteDomain).toBe('example.com');
    expect(out[0].business.location.coordinates).toEqual([8.54, 47.37]);
  });

  test('gap-fills complementary fields across duplicates', () => {
    const a = wrap('A', { phone: '+41441234567', website: null });
    const b = wrap('A', { phone: null, website: 'https://example.com', websiteDomain: 'example.com' });
    const out = dedupeByPlaceId([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].business.phone).toBe('+41441234567');
    expect(out[0].business.websiteDomain).toBe('example.com');
  });

  test('accepts normalized business objects keyed by provider.placeId', () => {
    const results = [
      { name: 'Alpha', provider: { placeId: 'P1' }, websiteDomain: 'alpha.ch' },
      { name: 'Alpha', provider: { placeId: 'P1' }, normalizedPhone: '+41441112233' },
      { name: 'Beta', provider: { placeId: 'P2' } },
    ];
    const out = dedupeByPlaceId(results);
    expect(out).toHaveLength(2);
    const p1 = out.find((r) => r.provider.placeId === 'P1');
    expect(p1.websiteDomain).toBe('alpha.ch');
    expect(p1.normalizedPhone).toBe('+41441112233');
  });

  test('supports a custom keyExtractor', () => {
    const out = dedupeByPlaceId(
      [{ gid: 'x', v: 1 }, { gid: 'x', v: 2 }, { gid: 'y', v: 3 }],
      { keyExtractor: (item) => item.gid },
    );
    expect(out).toHaveLength(2);
  });

  test('keeps un-keyed items rather than dropping them', () => {
    const out = dedupeByPlaceId([{ name: 'no-id-1' }, { name: 'no-id-2' }]);
    expect(out).toHaveLength(2);
  });

  test('empty / non-array input → []', () => {
    expect(dedupeByPlaceId([])).toEqual([]);
    expect(dedupeByPlaceId(undefined)).toEqual([]);
  });
});

describe('mergeCellResults', () => {
  test('flattens multi-cell arrays and dedupes across cells', () => {
    const cellA = [wrap('A'), wrap('B')];
    const cellB = [wrap('B', { phone: '+41441234567' }), wrap('C')];
    const out = mergeCellResults([cellA, cellB]);
    expect(out.map((r) => r.placeId).sort()).toEqual(['A', 'B', 'C']);
    // 'B' appears in both cells → merged into one, carrying the phone.
    const b = out.find((r) => r.placeId === 'B');
    expect(b.business.phone).toBe('+41441234567');
  });

  test('skips non-array cells defensively and returns a flat list', () => {
    const out = mergeCellResults([[wrap('A')], null, undefined, [wrap('A'), wrap('D')]]);
    expect(out.map((r) => r.placeId).sort()).toEqual(['A', 'D']);
  });

  test('non-array input → []', () => {
    expect(mergeCellResults(null)).toEqual([]);
  });
});
