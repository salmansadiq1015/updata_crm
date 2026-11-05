import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getDashboardIntelligence } from '../../src/modules/dashboard/dashboard-intelligence.service.js';

let mongod; let connection; let models;
const owner = new mongoose.Types.ObjectId();
const other = new mongoose.Types.ObjectId();
const now = new Date('2026-11-05T12:00:00Z');
const date = new Date('2026-11-03T12:00:00Z');
const old = new Date('2025-01-01T12:00:00Z');
const access = { assistant: true, calling: true, incoming: true, leads: true };
const viewer = { id: owner, access, inboundAll: false };
const run = (who = viewer, overrides = {}) => getDashboardIntelligence({ range: '7d', granularity: 'day' }, who, { now, models, ...overrides });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  connection = await mongoose.createConnection(mongod.getUri()).asPromise();
  models = Object.fromEntries(['AgentRun', 'CallRecord', 'CallingAgent', 'CallCampaign', 'InboundCall', 'Lead', 'LeadFollowUp'].map(name => [name, connection.model(name, new mongoose.Schema({}, { strict: false }))]));
  await models.AgentRun.collection.insertMany([
    { userId: owner, createdAt: date, status: 'COMPLETED' }, { userId: owner, createdAt: date, status: 'AWAITING_CONFIRMATION' },
    { userId: owner, createdAt: old, status: 'FAILED' }, { userId: other, createdAt: date, status: 'FAILED' },
  ]);
  await models.CallRecord.collection.insertMany([
    { createdBy: owner, createdAt: date, state: 'completed', qualification: 'qualified', answeredAt: date },
    { createdBy: owner, createdAt: date, state: 'no_answer', answeredAt: null },
    { createdBy: owner, createdAt: date, state: 'completed', isTest: true, answeredAt: date },
    { createdBy: other, createdAt: date, state: 'completed', answeredAt: date },
  ]);
  await models.CallingAgent.collection.insertMany([{ createdBy: owner, availability: 'active' }, { createdBy: owner, availability: 'draft' }, { createdBy: other, availability: 'active' }]);
  await models.CallCampaign.collection.insertMany([{ createdBy: owner, status: 'running' }, { createdBy: owner, status: 'running', isTest: true }]);
  await models.InboundCall.collection.insertMany([
    { createdBy: owner, createdAt: date, status: 'COMPLETED', answeredAt: date, outcome: 'handled_by_ai', qualification: { result: 'QUALIFIED' } },
    { createdBy: other, assignedTo: owner, createdAt: date, status: 'MISSED' },
    { createdBy: other, createdAt: date, status: 'COMPLETED', answeredAt: date },
    { createdBy: owner, createdAt: date, status: 'MISSED', isTest: true },
    { createdBy: owner, createdAt: old, status: 'RINGING' },
  ]);
  await models.Lead.collection.insertMany([
    { createdBy: owner, createdAt: date, status: 'qualified', isDeleted: false }, { createdBy: owner, createdAt: old, status: 'converted' },
    { createdBy: owner, createdAt: date, status: 'qualified', isDeleted: true }, { createdBy: other, createdAt: date, status: 'qualified' },
  ]);
  await models.LeadFollowUp.collection.insertMany([{ ownerId: owner, status: 'open', nextDueAt: old }, { ownerId: owner, status: 'done', nextDueAt: old }, { ownerId: other, status: 'open', nextDueAt: old }]);
});
afterAll(async () => { await connection?.close(); await mongod?.stop(); });

describe('dashboard intelligence aggregates', () => {
  test('uses owner-scoped production calls, period metrics, and independent current inventory', async () => {
    const result = await run();
    expect(result.warnings).toEqual([]);
    expect(result.assistant.metrics).toMatchObject({ total: 2, completed: 1, awaiting: 1, failed: 0 });
    expect(result.calling.metrics).toMatchObject({ total: 2, answered: 1, qualified: 1 });
    expect(result.calling.inventory).toEqual({ agents: 2, activeAgents: 1, activeCampaigns: 1 });
    expect(result.calling.trend).toHaveLength(7);
    expect(result.calling.trend.reduce((sum, point) => sum + point.total, 0)).toBe(2);
    expect(result.leads.metrics).toMatchObject({ total: 1, qualified: 1, converted: 0 });
    expect(result.leads.inventory).toEqual({ total: 2, overdueFollowUps: 1 });
  });
  test('includes assigned calls and the persisted inbound qualification vocabulary', async () => {
    const result = await run();
    expect(result.incoming.scope).toBe('personal');
    expect(result.incoming.metrics).toMatchObject({ total: 2, answered: 1, aiHandled: 1, missed: 1, qualified: 1 });
    expect(result.incoming.inventory.live).toBe(1);
    const supervisor = await run({ ...viewer, inboundAll: true });
    expect(supervisor.incoming.scope).toBe('team');
    expect(supervisor.incoming.metrics.total).toBe(3);
    expect(supervisor.calling.metrics.total).toBe(2);
    expect(supervisor.assistant.metrics.total).toBe(2);
  });
  test('does not query restricted sources or manufacture zero metrics', async () => {
    const result = await run({ ...viewer, access: {} }, { models: {} });
    for (const key of Object.keys(access)) expect(result[key]).toEqual({ available: false });
    expect(result.warnings).toEqual([]);
  });
  test('isolates a failed source and represents it as unavailable', async () => {
    const result = await run(viewer, { models: { ...models, AgentRun: { aggregate() { throw new Error('offline'); } } } });
    expect(result.assistant).toEqual({ available: false, error: true });
    expect(result.warnings).toEqual([{ source: 'assistant' }]);
    expect(result.calling.metrics.total).toBe(2);
  });
});
