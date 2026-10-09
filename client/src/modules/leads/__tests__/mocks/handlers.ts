import { http, HttpResponse } from 'msw';
import { makeDuplicateDTO, makeLeadDTO, ok, okPage } from './data';

export const BASE = 'http://localhost:9097/api/v1';
const L = `${BASE}/crm/leads`;

export const handlers = [
  http.get(L, () => HttpResponse.json(okPage([makeLeadDTO(), makeLeadDTO()]))),

  http.get(`${L}/filter-options`, () => HttpResponse.json(ok({
    countries: [{ value: 'CH', count: 3 }],
    cities: [
      { value: 'Basel', country: 'CH', count: 1 },
      { value: 'Zürich', country: 'CH', count: 2 },
    ],
    areas: [{ value: 'Altstadt', city: 'Zürich', country: 'CH', count: 1 }],
    types: [
      { value: 'business', count: 2 },
      { value: 'private', count: 1 },
    ],
  }))),

  http.post(L, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(ok(makeLeadDTO({ name: (body.name as string) ?? 'New Lead' })));
  }),

  http.get(`${L}/duplicates`, () => HttpResponse.json(ok([makeDuplicateDTO()]))),

  http.get(`${L}/:id`, ({ params }) => HttpResponse.json(ok(makeLeadDTO({ id: params.id as string })))),

  http.patch(`${L}/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(ok(makeLeadDTO({ id: params.id as string, ...body })));
  }),

  http.delete(`${L}/:id`, () => HttpResponse.json(ok({ deleted: true }))),

  http.post(`${L}/:id/convert`, ({ params }) =>
    HttpResponse.json(
      ok(
        makeLeadDTO({
          id: params.id as string,
          status: 'converted',
          convertedCustomerId: 'cust-123',
          convertedAt: new Date().toISOString(),
        }),
      ),
    ),
  ),
];
