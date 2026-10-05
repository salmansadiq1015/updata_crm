import { http, HttpResponse } from 'msw';
import {
  makeBusinessType,
  makeImportJobDTO,
  makeResultDTO,
  makeSessionDTO,
  ok,
  okPage,
} from './data';

export const BASE = 'http://localhost:9097/api/v1';
const D = `${BASE}/business-discovery`;

export const handlers = [
  http.get(`${D}/business-types`, () =>
    HttpResponse.json(ok([makeBusinessType(), makeBusinessType({ id: 'hotel', name: 'Hotel' })])),
  ),

  http.get(`${D}/usage`, () =>
    HttpResponse.json(ok({ searchRequests: 10, detailsRequests: 3, geocodeRequests: 2 })),
  ),

  http.get(`${D}/sessions`, () =>
    HttpResponse.json(okPage([makeSessionDTO(), makeSessionDTO()])),
  ),

  http.post(`${D}/sessions`, () => HttpResponse.json(ok({ sessionId: 'sess-new' }), { status: 202 })),

  http.get(`${D}/sessions/:id`, ({ params }) =>
    HttpResponse.json(ok(makeSessionDTO({ id: params.id as string }))),
  ),

  http.post(`${D}/sessions/:id/cancel`, ({ params }) =>
    HttpResponse.json(ok(makeSessionDTO({ id: params.id as string, status: 'CANCELLED', cancelRequested: true }))),
  ),

  http.post(`${D}/sessions/:id/load-more`, ({ params }) =>
    HttpResponse.json(ok(makeSessionDTO({ id: params.id as string, status: 'QUEUED' })), { status: 202 }),
  ),

  http.delete(`${D}/sessions/:id`, () => HttpResponse.json(ok({ deleted: true }))),

  http.get(`${D}/sessions/:id/results`, () =>
    HttpResponse.json(okPage([makeResultDTO(), makeResultDTO()])),
  ),

  http.get(`${D}/sessions/:id/markers`, () =>
    HttpResponse.json(okPage([
      { id: 'result-1', lat: 47.3769, lng: 8.5417, status: 'NEW' },
      { id: 'result-2', lat: 47.38, lng: 8.55, status: 'EXISTING' },
    ])),
  ),

  http.get(`${D}/sessions/:id/results/:resultId`, ({ params }) =>
    HttpResponse.json(ok(makeResultDTO({ id: params.resultId as string }))),
  ),

  http.get(`${D}/sessions/:id/import/preview`, () =>
    HttpResponse.json(ok({ new: 12, existing: 4, possibleDuplicates: 2, willImport: 12 })),
  ),

  http.post(`${D}/sessions/:id/import`, () =>
    HttpResponse.json(ok({ imported: 12, existing: 4, skipped: 0, failed: 0, duplicates: 2 })),
  ),

  http.post(`${D}/results/:resultId/import`, () =>
    HttpResponse.json(ok({ imported: 1, existing: 0, skipped: 0, failed: 0, duplicates: 0 })),
  ),

  http.get(`${D}/import-jobs/:jobId`, ({ params }) =>
    HttpResponse.json(ok(makeImportJobDTO({ id: params.jobId as string }))),
  ),

  http.post(`${D}/location/geocode`, () =>
    HttpResponse.json(
      ok([{ name: 'Zürich', formattedAddress: 'Zürich, CH', center: { lat: 47.37, lng: 8.54 }, placeId: 'geo-1' }]),
    ),
  ),

  http.post(`${D}/location/autocomplete`, () =>
    HttpResponse.json(ok([{ placeId: 'ac-1', description: 'Zürich, Switzerland' }])),
  ),
];
