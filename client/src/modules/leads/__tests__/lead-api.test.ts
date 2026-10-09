import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { BASE } from './mocks/handlers';
import { makeLeadDTO, ok, okPage } from './mocks/data';

vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: BASE });
  instance.interceptors.response.use((response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      return { data: body.data, meta: body.meta || {}, pagination: body.pagination || null } as unknown as AxiosResponse;
    }
    return response;
  });
  return { default: instance, normalizeApiError: (err: unknown) => err };
});

import { leadApi } from '../services/lead-api';

const L = `${BASE}/crm/leads`;

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('leadApi', () => {
  it('getFilterOptions normalizes database-backed country, city, area and type facets', async () => {
    const options = await leadApi.getFilterOptions();
    expect(options.countries).toEqual([{ value: 'CH', count: 3 }]);
    expect(options.cities).toEqual([
      { value: 'Basel', country: 'CH', count: 1 },
      { value: 'Zürich', country: 'CH', count: 2 },
    ]);
    expect(options.areas).toEqual([
      { value: 'Altstadt', city: 'Zürich', country: 'CH', count: 1 },
    ]);
    expect(options.types).toEqual([
      { value: 'business', count: 2 },
      { value: 'private', count: 1 },
    ]);
  });

  it('listLeads returns the cursor page shape { data, pagination }', async () => {
    server.use(
      http.get(L, () => HttpResponse.json(okPage([makeLeadDTO()], { hasNext: true, nextCursor: 'c2', limit: 20 }))),
    );
    const page = await leadApi.listLeads({ limit: 20 });
    expect(page.pagination).toEqual({ hasNext: true, nextCursor: 'c2', limit: 20 });
    expect(page.data[0].leadNumber).toMatch(/^L-/);
  });

  it('listLeads defaults pagination when the envelope omits it', async () => {
    server.use(http.get(L, () => HttpResponse.json(ok([makeLeadDTO()]))));
    const page = await leadApi.listLeads({ limit: 15 });
    expect(page.pagination).toEqual({ hasNext: false, nextCursor: null, limit: 15 });
  });

  it('mapLeads parses the located-first leads and the located/unlocated counts', async () => {
    server.use(
      http.get(`${L}/map`, () =>
        HttpResponse.json(
          ok({
            leads: [makeLeadDTO({ id: 'm1' }), makeLeadDTO({ id: 'm2', location: null })],
            total: 5,
            withLocation: 3,
            withoutLocation: 2,
            limited: true,
          }),
        ),
      ),
    );
    const result = await leadApi.mapLeads({ status: 'new' });
    expect(result.leads).toHaveLength(2);
    expect(result.leads[0].id).toBe('m1');
    expect(result.leads[0].location).toEqual({ lat: 47.3769, lng: 8.5417 });
    expect(result.leads[1].location).toBeNull();
    expect(result).toMatchObject({ total: 5, withLocation: 3, withoutLocation: 2, limited: true });
  });

  it('mapLeads tolerates an empty / missing payload', async () => {
    server.use(http.get(`${L}/map`, () => HttpResponse.json(ok({}))));
    const result = await leadApi.mapLeads();
    expect(result).toEqual({ leads: [], total: 0, withLocation: 0, withoutLocation: 0, limited: false });
  });

  it('geocodeLead returns the updated lead + geocoded:true on success', async () => {
    server.use(
      http.post(`${L}/lead-x/geocode`, () =>
        HttpResponse.json(
          ok({ lead: makeLeadDTO({ id: 'lead-x' }), geocoded: true, reason: null, formattedAddress: 'Bahnhofstrasse 1, 8001 Zürich' }),
        ),
      ),
    );
    const r = await leadApi.geocodeLead('lead-x');
    expect(r.geocoded).toBe(true);
    expect(r.lead.id).toBe('lead-x');
    expect(r.reason).toBeNull();
    expect(r.formattedAddress).toContain('Zürich');
  });

  it('geocodeLead reports an honest not-found result without a location', async () => {
    server.use(
      http.post(`${L}/lead-y/geocode`, () =>
        HttpResponse.json(ok({ lead: makeLeadDTO({ id: 'lead-y', location: null }), geocoded: false, reason: 'not_found', formattedAddress: null })),
      ),
    );
    const r = await leadApi.geocodeLead('lead-y');
    expect(r.geocoded).toBe(false);
    expect(r.reason).toBe('not_found');
    expect(r.lead.location).toBeNull();
  });

  it('getLead normalizes the lead DTO', async () => {
    const lead = await leadApi.getLead('lead-x');
    expect(lead.id).toBe('lead-x');
    expect(lead.status).toBe('new');
    expect(lead.source).toBe('google_places');
    expect(lead.location).toEqual({ lat: 47.3769, lng: 8.5417 });
    expect(lead.sourceMetadata.discoverySessionId).toBe('sess-1');
  });

  it('getLead and listLeads keep the populated creator and flatten a populated assignee to its id', async () => {
    // The API populates createdBy and assignedTo; only the creator's name is needed by the UI.
    const populated = {
      createdBy: { _id: 'u-9', firstName: 'Olivia', lastName: 'Keller', email: 'olivia@example.ch' },
      assignedTo: { _id: 'u-2', firstName: 'Noah', lastName: 'Frei', email: 'noah@example.ch' },
    };
    server.use(
      http.get(`${L}/:id`, ({ params }) => HttpResponse.json(ok(makeLeadDTO({ id: params.id as string, ...populated })))),
      http.get(L, () => HttpResponse.json(okPage([makeLeadDTO(populated)]))),
    );

    const lead = await leadApi.getLead('lead-p');
    expect(lead.createdBy).toEqual({ id: 'u-9', firstName: 'Olivia', lastName: 'Keller', email: 'olivia@example.ch' });
    expect(lead.assignedTo).toBe('u-2');

    const page = await leadApi.listLeads({ limit: 10 });
    expect(page.data[0].createdBy).toMatchObject({ id: 'u-9', firstName: 'Olivia', lastName: 'Keller' });
    expect(page.data[0].assignedTo).toBe('u-2');
  });

  it('createLead posts and parses the created lead', async () => {
    const lead = await leadApi.createLead({ name: 'Acme AG' });
    expect(lead.name).toBe('Acme AG');
  });

  it('updateLead patches and parses the updated lead', async () => {
    const lead = await leadApi.updateLead('lead-1', { status: 'contacted' });
    expect(lead.status).toBe('contacted');
  });

  it('deleteLead returns { deleted: true }', async () => {
    const res = await leadApi.deleteLead('lead-1');
    expect(res).toEqual({ deleted: true });
  });

  it('convertLead returns the updated lead + customerId (lead-shaped response)', async () => {
    const res = await leadApi.convertLead('lead-1');
    expect(res.lead?.status).toBe('converted');
    expect(res.customerId).toBe('cust-123');
  });

  it('convertLead handles a { customerId } only response', async () => {
    server.use(
      http.post(`${L}/:id/convert`, () => HttpResponse.json(ok({ customerId: 'cust-999' }))),
    );
    const res = await leadApi.convertLead('lead-1');
    expect(res.customerId).toBe('cust-999');
    expect(res.lead).toBeNull();
  });

  it('findDuplicates parses the duplicate list', async () => {
    const dups = await leadApi.findDuplicates({ phone: '+41 44 123 45 67' });
    expect(dups).toHaveLength(1);
    expect(dups[0]).toMatchObject({ entityType: 'customer', matchedBy: ['PHONE'], confidence: 0.95 });
  });

  it('rejects on a server error (error path)', async () => {
    server.use(
      http.get(`${L}/:id`, () =>
        HttpResponse.json({ success: false, error: { code: 'BOOM', message: 'fail' } }, { status: 500 }),
      ),
    );
    await expect(leadApi.getLead('lead-err')).rejects.toBeDefined();
  });
});
