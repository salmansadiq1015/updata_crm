import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { BASE } from './mocks/handlers';
import { makeRawResultDoc, ok, okPage } from './mocks/data';
import { discoveryApi } from '../services/discovery-api';

// Mirror the real client: bypass the auth interceptor (CJS require of the auth
// store can't resolve under Vitest ESM) and add the envelope-unwrapping response
// interceptor so services see { data, pagination } instead of the raw response.
vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: BASE });
  instance.interceptors.response.use((response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      return {
        data: body.data,
        meta: body.meta || {},
        pagination: body.pagination || null,
      } as unknown as AxiosResponse;
    }
    return response;
  });
  return { default: instance, normalizeApiError: (err: unknown) => err };
});

const D = `${BASE}/business-discovery`;

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('discoveryApi', () => {
  it('getBusinessTypes parses the envelope-unwrapped catalog', async () => {
    const types = await discoveryApi.getBusinessTypes();
    expect(types).toHaveLength(2);
    expect(types[0]).toMatchObject({ id: 'restaurant', providerIncludedType: 'restaurant' });
  });

  it('getBusinessTypes flattens the server GROUPED catalog to unique-id types', async () => {
    // The real server returns [{ group, i18nKey, types:[...] }]; it must flatten
    // to a flat list where every type keeps a real id (regression: grouped shape
    // previously produced empty ids → duplicate React keys + select-all).
    server.use(
      http.get(`${D}/business-types`, () =>
        HttpResponse.json(
          ok([
            {
              group: 'Food & Hospitality',
              i18nKey: 'leadgen.group.food_hospitality',
              types: [
                { id: 'restaurant', name: 'Restaurant', includedType: 'restaurant', icon: 'utensils', i18nKey: 'leadgen.type.restaurant' },
                { id: 'cafe', name: 'Cafe', includedType: 'cafe', icon: 'coffee', i18nKey: 'leadgen.type.cafe' },
              ],
            },
            {
              group: 'Healthcare',
              i18nKey: 'leadgen.group.healthcare',
              types: [{ id: 'pharmacy', name: 'Pharmacy', includedType: 'pharmacy', icon: 'pill', i18nKey: 'leadgen.type.pharmacy' }],
            },
          ]),
        ),
      ),
    );
    const types = await discoveryApi.getBusinessTypes();
    expect(types.map((t) => t.id)).toEqual(['restaurant', 'cafe', 'pharmacy']);
    expect(types.every((t) => t.id.length > 0)).toBe(true);
    expect(new Set(types.map((t) => t.id)).size).toBe(3);
    expect(types.find((t) => t.id === 'restaurant')?.category).toBe('Food & Hospitality');
  });

  it('getUsage normalizes the usage counters', async () => {
    const usage = await discoveryApi.getUsage();
    expect(usage).toEqual({ searchRequests: 10, detailsRequests: 3, geocodeRequests: 2 });
  });

  it('listSessions returns the cursor page shape { data, pagination }', async () => {
    server.use(
      http.get(`${D}/sessions`, () =>
        HttpResponse.json(okPage([], { hasNext: true, nextCursor: 'cursor-2', limit: 25 })),
      ),
    );
    const page = await discoveryApi.listSessions({ limit: 25 });
    expect(page.pagination).toEqual({ hasNext: true, nextCursor: 'cursor-2', limit: 25 });
    expect(Array.isArray(page.data)).toBe(true);
  });

  it('listSessions falls back to a default pagination when absent', async () => {
    server.use(http.get(`${D}/sessions`, () => HttpResponse.json(ok([]))));
    const page = await discoveryApi.listSessions({ limit: 10 });
    expect(page.pagination).toEqual({ hasNext: false, nextCursor: null, limit: 10 });
  });

  it('getSession normalizes status, counts and location center', async () => {
    const session = await discoveryApi.getSession('sess-1');
    expect(session.id).toBe('sess-1');
    expect(session.status).toBe('RUNNING');
    expect(session.counts.new).toBe(12);
    expect(session.location.center).toEqual({ lat: 47.3769, lng: 8.5417 });
  });

  it('createSession returns { sessionId } from a 202 response', async () => {
    const result = await discoveryApi.createSession({
      location: { name: 'Zürich' },
      area: { type: 'radius', radiusMeters: 1000 },
      businessTypes: ['restaurant'],
    });
    expect(result).toEqual({ sessionId: 'sess-new' });
  });

  it('listResults flattens crmStatus/importStatus from the DTO', async () => {
    const page = await discoveryApi.listResults('sess-1');
    expect(page.data).toHaveLength(2);
    expect(page.data[0].crmStatus).toBe('NEW');
    expect(page.data[0].importStatus).toBe('NOT_IMPORTED');
    expect(page.data[0].business.location).toEqual({ lat: 47.3769, lng: 8.5417 });
  });

  it('listResults tolerates the raw Mongo doc shape (matching.status + GeoJSON)', async () => {
    server.use(
      http.get(`${D}/sessions/:id/results`, () => HttpResponse.json(okPage([makeRawResultDoc()]))),
    );
    const page = await discoveryApi.listResults('sess-1');
    const result = page.data[0];
    expect(result.id).toBe('raw-res-1');
    expect(result.placeId).toBe('place-raw-1');
    expect(result.crmStatus).toBe('POSSIBLE_DUPLICATE'); // from matching.status
    expect(result.matchedLeadId).toBe('lead-9');
    expect(result.matchedBy).toEqual([{ method: 'PHONE', confidence: 0.95 }]);
    // GeoJSON [lng, lat] → { lat, lng }
    expect(result.business.location).toEqual({ lat: 47.37, lng: 8.52 });
    expect(result.business.reviewCount).toBe(55); // from userRatingCount
  });

  it('listMarkers returns the independently paginated complete-map stream', async () => {
    const page = await discoveryApi.listMarkers('sess-1', { limit: 500 });
    expect(page.data).toEqual([
      { id: 'result-1', lat: 47.3769, lng: 8.5417, status: 'NEW' },
      { id: 'result-2', lat: 47.38, lng: 8.55, status: 'EXISTING' },
    ]);
    expect(page.pagination.hasNext).toBe(false);
  });

  it('importPreview parses server-computed counts', async () => {
    const preview = await discoveryApi.importPreview('sess-1', 'new', { kind: 'ALL_NEW' });
    expect(preview).toEqual({ new: 12, existing: 4, possibleDuplicates: 2, willImport: 12 });
  });

  it('importSession returns a sync summary when the body contains counts', async () => {
    const res = await discoveryApi.importSession('sess-1', {
      mode: 'new',
      selection: { kind: 'ALL_NEW' },
    });
    expect(res.kind).toBe('sync');
    if (res.kind === 'sync') {
      expect(res.summary).toEqual({ imported: 12, existing: 4, skipped: 0, failed: 0, duplicates: 2 });
    }
  });

  it('importSession returns an async job id on a 202 { jobId }', async () => {
    server.use(
      http.post(`${D}/sessions/:id/import`, () =>
        HttpResponse.json(ok({ jobId: 'job-async-1' }), { status: 202 }),
      ),
    );
    const res = await discoveryApi.importSession('sess-1', {
      mode: 'new',
      selection: { kind: 'ALL_NEW' },
    });
    expect(res).toEqual({ kind: 'async', jobId: 'job-async-1', summary: null });
  });

  it('importResult (Add One) returns a sync summary', async () => {
    const res = await discoveryApi.importResult('res-1', { mode: 'new' });
    expect(res.kind).toBe('sync');
    if (res.kind === 'sync') expect(res.summary.imported).toBe(1);
  });

  it('getImportJob normalizes the job counts', async () => {
    const job = await discoveryApi.getImportJob('job-1');
    expect(job.id).toBe('job-1');
    expect(job.status).toBe('RUNNING');
    expect(job.counts.created).toBe(5);
  });

  it('geocode normalizes a list of candidates', async () => {
    const results = await discoveryApi.geocode({ query: 'Zürich' });
    expect(results[0]).toMatchObject({ name: 'Zürich', center: { lat: 47.37, lng: 8.54 } });
  });

  it('autocomplete normalizes predictions', async () => {
    const predictions = await discoveryApi.autocomplete({ query: 'Zür' });
    expect(predictions[0]).toMatchObject({ placeId: 'ac-1', description: 'Zürich, Switzerland' });
  });

  it('rejects on a server error (error path)', async () => {
    server.use(
      http.get(`${D}/sessions/:id`, () =>
        HttpResponse.json({ success: false, error: { code: 'BOOM', message: 'fail' } }, { status: 500 }),
      ),
    );
    await expect(discoveryApi.getSession('sess-err')).rejects.toBeDefined();
  });
});
