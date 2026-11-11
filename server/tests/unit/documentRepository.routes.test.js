import { beforeEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { serve } from '../helpers/serve.js';

const userId = '507f1f77bcf86cd799439011';
const rid = 'repository:507f1f77bcf86cd799439012';
let permissions = [];
const calls = Object.fromEntries(['list', 'listAttachable', 'stats', 'facets', 'linkTargets', 'updateMetadata', 'bulk', 'upload', 'download', 'setArchived', 'setVisum', 'setReleased', 'delete']
  .map((n) => [n, jest.fn(async () => (n === 'list' ? { data: [], pagination: {} } : n === 'bulk' ? { total: 1, succeeded: 1, failed: [] } : {}))]));

jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => { req.user = { _id: userId }; next(); },
  requirePermission: (p) => (_req, res, next) => (permissions.includes(p) ? next() : res.sendStatus(403)),
  loadUserPermissions: async () => permissions,
  satisfiesPermission: (perms, p) => perms.includes(p),
}));
jest.unstable_mockModule('../../src/modules/documents/documentIndex.service.js', () => ({ default: calls, parseRecordId: () => null }));

const { default: router } = await import('../../src/modules/documents/documentIndex.routes.js');
const app = express();
app.use(express.json());
app.use((_req, res, next) => { res.success = ({ data, statusCode = 200 }) => res.status(statusCode).json({ data }); next(); });
app.use('/documents', router);
app.use((e, _req, res, _next) => res.status(e.statusCode || 500).json({ message: e.message }));
const http = serve(app);

beforeEach(() => { jest.clearAllMocks(); permissions = ['documents:read']; });

test('readers get stats and facets; pickers, edits and bulk need write', async () => {
  await request(http).get('/documents/stats').expect(200);
  await request(http).get('/documents/facets').expect(200);
  await request(http).get('/documents/link-targets?type=customer').expect(403);
  await request(http).patch(`/documents/${rid}`).send({ title: 'x' }).expect(403);
  await request(http).post('/documents/bulk').send({ action: 'archive', ids: [rid] }).expect(403);
  expect(calls.linkTargets).not.toHaveBeenCalled();
});

test('bulk delete additionally requires documents:delete; input is validated first', async () => {
  permissions = ['documents:read', 'documents:write'];
  await request(http).post('/documents/bulk').send({ action: 'archive', ids: [rid] }).expect(200);
  await request(http).post('/documents/bulk').send({ action: 'delete', ids: [rid] }).expect(403);
  await request(http).post('/documents/bulk').send({ action: 'shred', ids: [rid] }).expect(400);
  await request(http).post('/documents/bulk').send({ action: 'archive', ids: ['customer:nope'] }).expect(400);
  await request(http).post('/documents/bulk').send({ action: 'archive', ids: Array.from({ length: 101 }, (_, i) => `repository:${String(i).padStart(24, '0')}`) }).expect(400);
  await request(http).get('/documents/link-targets?type=vehicle').expect(400);
  await request(http).patch(`/documents/${rid}`).send({ fileId: 'x' }).expect(400);
  permissions.push('documents:delete');
  await request(http).post('/documents/bulk').send({ action: 'delete', ids: [rid] }).expect(200);
  expect(calls.bulk).toHaveBeenCalledTimes(2);
});
