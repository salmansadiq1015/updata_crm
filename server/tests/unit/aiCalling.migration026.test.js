import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, describe, expect, it, jest,
} from '@jest/globals';

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob: jest.fn(async () => ({})) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn(async () => ({})) } }));

let mongod;
let migration;
let service;
let CallRecord;
let CallCampaign;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { autoIndex: false });
  migration = await import('../../src/migrations/026_ai_calling_reliability_indexes.js');
  service = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

// The legacy campaign has no callWindow (defaults 09:00–19:00) and the recipient window defaults to
// 08:00–20:00: pin both to "always open" so the test does not depend on the wall clock.
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';

describe('migration 026 against pre-existing (legacy-shaped) data', () => {
  it('is additive, idempotent, reversible, and legacy documents keep working', async () => {
    const owner = new mongoose.Types.ObjectId();
    // Documents written by the previous release: none of the new fields exist.
    const { insertedId: campaignId } = await CallCampaign.collection.insertOne({
      name: 'legacy', status: 'running', selection: { mode: 'explicit', leadIds: [], selectedAt: new Date() },
      questionnaire: { questions: [] }, schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }, createdBy: owner, updatedBy: owner,
      createdAt: new Date(), updatedAt: new Date(),
    });
    await CallRecord.collection.insertOne({
      campaignId, recipientId: new mongoose.Types.ObjectId(), leadId: new mongoose.Types.ObjectId(),
      internalCallId: 'legacy-1', attemptNumber: 1, state: 'completed', disposition: 'answered_completed',
      resultsProcessedAt: new Date(), createdBy: owner, createdAt: new Date(), updatedAt: new Date(),
    });

    // Production state: earlier migrations created schema keys under custom names.
    await CallCampaign.collection.createIndex({ isTest: 1 }, { name: 'is_test' });
    await CallRecord.collection.createIndex({ campaignId: 1, initiatedAt: 1 }, { name: 'legacy_daily_cap' });

    await migration.up();
    await migration.up(); // idempotent
    // An existing key under another name is reused, never duplicated.
    expect((await CallRecord.collection.indexes()).filter((i) => JSON.stringify(i.key) === '{"campaignId":1,"initiatedAt":1}')).toHaveLength(1);
    const names = (await CallRecord.collection.indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['reconcile_state_initiatedAt', 'reconcile_processing_lease', 'legacy_daily_cap']));
    expect((await CallCampaign.collection.indexes()).map((i) => i.name)).toContain('status_1_nextTickAt_1');

    // Legacy campaign (no tickToken) is driven by a legacy token-less tick, and the
    // watchdog treats its missing nextTickAt as overdue.
    expect(await service.tickCampaign(campaignId, null)).not.toEqual({ superseded: true });
    const res = await service.reconcileStuckCalls();
    expect(res.ticksRevived).toBe(1);
    expect((await CallCampaign.findById(campaignId).lean()).tickToken).toBeTruthy();
    // Processed legacy record untouched.
    expect((await CallRecord.findOne({ internalCallId: 'legacy-1' }).lean()).disposition).toBe('answered_completed');

    await migration.down();
    expect((await CallRecord.collection.indexes()).map((i) => i.name)).not.toContain('reconcile_processing_lease');
    await migration.down(); // reversible twice without error
    await migration.up();
    expect((await CallRecord.collection.indexes()).map((i) => i.name)).toContain('reconcile_processing_lease');
  });
});
