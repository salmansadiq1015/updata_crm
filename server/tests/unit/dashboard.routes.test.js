import { afterAll, beforeAll, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { serve } from '../helpers/serve.js';

const actor = new mongoose.Types.ObjectId();
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => { req.user = { _id: req.get('x-user') || actor, role: { name: req.get('x-role') || 'Admin' } }; next(); },
  requirePermission: () => (_req, _res, next) => next(),
  loadUserPermissions: async () => [],
  satisfiesPermission: () => false,
}));

let db; let app;
const api = () => request(serve(app));

beforeAll(async () => {
  db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri());
  for (const file of [
    'crm/customer.model.js', 'pm/project.model.js', 'qop/quotation.model.js', 'qop/order.model.js', 'qop/invoice.model.js',
    'tasks/task.model.js', 'deploy/assignment.model.js', 'accounting/apInvoice.model.js', 'accounting/bankTransaction.model.js',
    'accounting/journalEntry.model.js', 'auth/auditLog.model.js', 'auth/user.model.js', 'crm/lead.model.js', 'crm/leadFollowUp.model.js',
    'aiCalling/callRecord.model.js', 'inboundCalling/inboundCall.model.js', 'ai/agent/agentRun.model.js', 'aiCalling/callingAgent.model.js',
    'aiCalling/callCampaign.model.js',
  ]) await import(`../../src/modules/${file}`);
  const routes = (await import('../../src/modules/dashboard/dashboard.routes.js')).default;
  app = express();
  app.use((await import('../../src/shared/middleware/responseEnvelope.js')).default);
  app.use('/dashboard', routes);
  app.use((await import('../../src/shared/middleware/errorHandler.js')).default);
});
afterAll(async () => { await mongoose.disconnect(); await db?.stop(); });

describe('dashboard routes', () => {
  test('rejects unknown period presets', async () => {
    const res = await api().get('/dashboard/analytics?range=5y');
    expect(res.status).toBe(400);
    expect((await api().get('/dashboard/intelligence?granularity=hour')).status).toBe(400);
  });

  test('returns the analytics snapshot and serves repeat requests from the cache', async () => {
    const first = await api().get('/dashboard/analytics?range=7d&granularity=day');
    expect(first.status).toBe(200);
    const { data } = first.body;
    expect(data.warnings).toEqual([]);
    expect(data.filters).toMatchObject({ range: '7d', granularity: 'day' });
    expect(data.overview.kpis.map((kpi) => kpi.id)).toEqual(['revenue', 'customers', 'projects', 'openTasks', 'scheduleToday', 'outstanding']);
    expect(data.overview.financialTrend).toHaveLength(7);
    const second = await api().get('/dashboard/analytics?range=7d&granularity=day');
    expect(second.body.data.updatedAt).toBe(data.updatedAt);
  });

  test('intelligence and mobile CRM are cached per viewer', async () => {
    const mine = await api().get('/dashboard/intelligence?range=30d');
    expect(mine.status).toBe(200);
    expect(mine.body.data.leads).toMatchObject({ available: true, metrics: { total: 0 } });
    const restricted = await api().get('/dashboard/intelligence?range=30d').set('x-user', String(new mongoose.Types.ObjectId())).set('x-role', 'Sales');
    expect(restricted.body.data.leads).toEqual({ available: false });
    const mobile = await api().get('/dashboard/mobile-crm');
    expect(mobile.status).toBe(200);
    expect(mobile.body.data.leads.total).toBe(0);
    expect((await api().get('/dashboard/stats')).body.data).toEqual({ customers: 0, projects: 0, openQuotes: 0, todayTasks: 0 });
  });
});
