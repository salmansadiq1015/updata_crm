import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const userId = '507f1f77bcf86cd799439011';
const taskId = '507f1f77bcf86cd799439012';
const service = { active: jest.fn(), summary: jest.fn(), start: jest.fn(), transition: jest.fn() };
const authenticate = jest.fn((req, _res, next) => {
  req.user = { _id: userId, role: { name: 'Staff' }, permissions: ['tasks:read', 'tasks:write'] };
  next();
});
jest.unstable_mockModule('../../src/modules/tasks/taskTime.service.js', () => ({ default: service }));
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate,
  requirePermission: permission => (req, res, next) => req.user.permissions.includes(permission) ? next() : res.status(403).json({ code: 'FORBIDDEN' }),
}));
const { default: router } = await import('../../src/modules/tasks/taskTime.routes.js');
const app = express();
app.use(express.json());
app.use((_req, res, next) => { res.success = value => res.json(value); next(); });
app.use('/tasks', router);
app.get('/tasks/unrelated', (_req, res) => res.sendStatus(204));
app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
beforeEach(() => {
  jest.clearAllMocks();
  service.summary.mockResolvedValue({ totalMs: 0 });
  service.start.mockResolvedValue({ session: null });
});

describe('Task timer API boundaries', () => {
  test('timer middleware leaves existing task endpoints untouched', async () => {
    await request(app).get('/tasks/unrelated').expect(204);
    expect(authenticate).not.toHaveBeenCalled();
  });
  test('team reports require time-tracking permission', async () => {
    await request(app).get('/tasks/time-tracking/report?scope=team').expect(403);
    expect(service.summary).not.toHaveBeenCalled();
    await request(app).get('/tasks/time-tracking/report?scope=mine').expect(200);
    expect(service.summary).toHaveBeenCalledWith(userId, { scope: 'mine', days: 30 }, { isAdmin: false });
  });
  test('starts always use the authenticated employee and discard a forged employee id', async () => {
    await request(app).post(`/tasks/${taskId}/time-tracking/start`).send({ mode: 'FOCUS', targetMinutes: 25 }).expect(200);
    expect(service.start).toHaveBeenCalledWith(taskId, { mode: 'FOCUS', targetMinutes: 25 }, userId, { isAdmin: false });
    service.start.mockClear();
    await request(app).post(`/tasks/${taskId}/time-tracking/start`).send({ userId: taskId }).expect(200);
    expect(service.start).toHaveBeenCalledWith(taskId, { mode: 'TIMER', targetMinutes: 25 }, userId, { isAdmin: false });
  });
  test('invalid focus goals and oversized session notes are rejected before writes', async () => {
    await request(app).post(`/tasks/${taskId}/time-tracking/start`).send({ targetMinutes: 0 }).expect(400);
    await request(app).post(`/tasks/time-tracking/sessions/${taskId}/stop`).send({ note: 'x'.repeat(1001) }).expect(400);
    expect(service.start).not.toHaveBeenCalled();
    expect(service.transition).not.toHaveBeenCalled();
  });
});
