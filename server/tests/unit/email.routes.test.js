import { beforeEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
const ownerId = '507f1f77bcf86cd799439011', id = '507f1f77bcf86cd799439012';
let permissions = ['email:read'];
const calls = { listAccounts: jest.fn(async () => []), listMessages: jest.fn(async () => ({ items: [] })), saveDraft: jest.fn(), submit: jest.fn(), settings: jest.fn() };
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({ authenticate: (req, _res, next) => { req.user = { _id: ownerId }; next(); }, requirePermission: p => (_req, res, next) => permissions.includes(p) ? next() : res.sendStatus(403) }));
jest.unstable_mockModule('../../src/modules/email/email.service.js', () => calls);
const { default: router } = await import('../../src/modules/email/email.routes.js');
const app = express(); app.use(express.json()); app.use((_req, res, next) => { res.success = data => res.json(data); next(); }); app.use('/email', router); app.use((e, _req, res, _next) => res.status(e.statusCode || 500).json({ message: e.message }));
beforeEach(() => { jest.clearAllMocks(); permissions = ['email:read']; });
test('mailbox readers cannot compose, send, approve, manage or use AI', async () => {
 await request(app).get('/email/accounts').expect(200); expect(calls.listAccounts).toHaveBeenCalledWith(ownerId);
 for (const path of ['/drafts', `/messages/${id}/send`, `/messages/${id}/approve`, `/accounts/imap`, `/messages/${id}/ai`]) await request(app).post(`/email${path}`).send({}).expect(403);
 expect(calls.saveDraft).not.toHaveBeenCalled(); expect(calls.submit).not.toHaveBeenCalled();
});
test('account configuration cannot enable automation or AI without the matching permission', async () => {
 permissions = ['email:manage'];
 await request(app).patch(`/email/accounts/${id}`).send({ followUp: { enabled: true } }).expect(403);
 await request(app).patch(`/email/accounts/${id}`).send({ autoIntelligence: true }).expect(403);
 expect(calls.settings).not.toHaveBeenCalled();
});
test('invalid identifiers and untrusted approval fields are rejected before services run', async () => {
 permissions = ['email:send', 'email:manage'];
 await request(app).post('/email/messages/not-an-id/approve').send({}).expect(400);
 await request(app).patch(`/email/accounts/${id}`).send({ credentials: 'stolen-token', ownerId }).expect(400);
 expect(calls.submit).not.toHaveBeenCalled(); expect(calls.settings).not.toHaveBeenCalled();
});
