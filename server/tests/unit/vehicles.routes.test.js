import { beforeEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { serve } from '../helpers/serve.js';

const userId = '507f1f77bcf86cd799439011';
const id = '507f1f77bcf86cd799439012';
let permissions = ['vehicles:read'];

const calls = Object.fromEntries([
  'list', 'stats', 'getById', 'create', 'update', 'remove', 'assignDriver', 'setPhoto', 'removePhoto',
  'listServices', 'addService', 'deleteService', 'listCosts', 'addCost', 'deleteCost',
  'listBookings', 'addBooking', 'cancelBooking', 'listMaterials', 'addMaterial', 'deleteMaterial',
  'listNotes', 'addNote', 'deleteNote', 'listHistory',
].map((name) => [name, jest.fn(async () => ({ ok: name }))]));

jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => { req.user = { _id: userId }; next(); },
  requirePermission: (p) => (_req, res, next) => (permissions.includes(p) ? next() : res.sendStatus(403)),
  loadUserPermissions: async () => permissions,
  satisfiesPermission: (perms, p) => perms.includes(p),
}));
jest.unstable_mockModule('../../src/shared/middleware/rateLimiter.js', () => ({ uploadLimiter: (_q, _s, n) => n() }));
jest.unstable_mockModule('../../src/modules/vehicles/vehicle.service.js', () => ({ default: calls }));
jest.unstable_mockModule('../../src/modules/doctpl/ci.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../src/modules/doctpl/ciRenderAssets.service.js', () => ({ default: {} }));

const { default: router } = await import('../../src/modules/vehicles/vehicle.routes.js');
const app = express();
app.use(express.json());
app.use((_req, res, next) => { res.success = ({ data, statusCode = 200 }) => res.status(statusCode).json({ data }); next(); });
app.use('/vehicles', router);
app.use((e, _req, res, _next) => res.status(e.statusCode || 500).json({ message: e.message }));
const http = serve(app);

beforeEach(() => { jest.clearAllMocks(); permissions = ['vehicles:read']; });

test('readers can list, read stats and book, but not change master data', async () => {
  await request(http).get('/vehicles?status=in_use&attention=true&page=2&limit=25').expect(200);
  expect(calls.list).toHaveBeenCalledWith({ status: 'in_use', attention: true, page: 2, limit: 25 });
  await request(http).get('/vehicles/stats').expect(200);
  await request(http).post(`/vehicles/${id}/bookings`).send({ start: '2026-12-01T08:00:00Z', end: '2026-12-01T10:00:00Z' }).expect(201);
  expect(calls.addBooking.mock.calls[0][2]).toEqual({ _id: userId, canWrite: false });

  await request(http).post('/vehicles').send({ kennzeichen: 'ZH 1' }).expect(403);
  await request(http).patch(`/vehicles/${id}`).send({ status: 'workshop' }).expect(403);
  await request(http).post(`/vehicles/${id}/costs`).send({ type: 'fuel', date: '2026-01-01', amount: 1 }).expect(403);
  expect(calls.create).not.toHaveBeenCalled();
});

test('input is validated and stripped before the service runs', async () => {
  permissions = ['vehicles:read', 'vehicles:write'];
  await request(http).get('/vehicles?limit=5000').expect(400);
  await request(http).get('/vehicles/not-an-id').expect(400);
  await request(http).post('/vehicles').send({ label: 'no plate' }).expect(400);
  await request(http).post('/vehicles').send({ kennzeichen: 'ZH 1', assetType: 'spaceship' }).expect(400);
  await request(http).post(`/vehicles/${id}/bookings`).send({ start: '2026-12-01T10:00:00Z', end: '2026-12-01T08:00:00Z' }).expect(400);
  await request(http).post(`/vehicles/${id}/costs`).send({ type: 'fuel', date: '2026-01-01', amount: -3 }).expect(400);

  await request(http).post('/vehicles').send({ kennzeichen: 'ZH 1', assetType: 'forklift', meterUnit: 'h', isDeleted: true, createdBy: userId }).expect(201);
  expect(calls.create.mock.calls[0][0]).toEqual({ kennzeichen: 'ZH 1', assetType: 'forklift', meterUnit: 'h' });
});

test('photo upload passes the file through multer', async () => {
  permissions = ['vehicles:read', 'vehicles:write'];
  await request(http).post(`/vehicles/${id}/photo`).attach('photo', Buffer.from('img'), { filename: 'a.png', contentType: 'image/png' }).expect(200);
  expect(calls.setPhoto.mock.calls[0][1]).toMatchObject({ mimetype: 'image/png', size: 3 });
});
