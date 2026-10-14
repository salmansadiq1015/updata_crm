import { http, HttpResponse } from 'msw';
import { makeDuplicateDTO, makeLeadDTO, ok, okPage } from './data';

export const BASE = 'http://localhost:9097/api/v1';
const L = `${BASE}/crm/leads`;

export const handlers = [
  http.get(L, () => HttpResponse.json(okPage([makeLeadDTO(), makeLeadDTO()]))),

  http.get(`${L}/filter-options`, () => HttpResponse.json(ok({
    countries: [{ id: 'country:CH', value: 'Switzerland', code: 'CH', count: 3 }],
    cities: [
      { id: 'city:111111111111111111111111', value: 'Basel', countryId: 'country:CH', country: 'Switzerland', countryCode: 'CH', count: 1 },
      { id: 'city:222222222222222222222222', value: 'Zürich', countryId: 'country:CH', country: 'Switzerland', countryCode: 'CH', count: 2 },
    ],
    areas: [{ id: 'area:333333333333333333333333', value: 'Altstadt', type: 'neighborhood', cityId: 'city:222222222222222222222222', city: 'Zürich', countryId: 'country:CH', country: 'Switzerland', countryCode: 'CH', count: 1 }],
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

  http.get(`${BASE}/messaging/leads/:id/consent`, ({ params }) => HttpResponse.json(ok({
    leadId: String(params.id),
    channels: [
      { channel: 'email', status: 'unknown', effectiveStatus: 'unknown', hasDestination: true, evidence: '', suppression: null },
      { channel: 'sms', status: 'unknown', effectiveStatus: 'unknown', hasDestination: true, evidence: '', suppression: null },
      { channel: 'whatsapp', status: 'unknown', effectiveStatus: 'unknown', hasDestination: true, evidence: '', suppression: null },
    ],
  }))),
];
