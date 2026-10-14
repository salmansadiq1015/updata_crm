import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { up, down } from '../../src/migrations/023_messaging_progress_backfill.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    mongoose.connection.db.collection('messagecampaigns').deleteMany({}),
    mongoose.connection.db.collection('messagerecipients').deleteMany({}),
  ]);
});

describe('migration 023 messaging progress backfill', () => {
  it('rebuilds additive progress counters without changing existing summary evidence', async () => {
    const campaignId = new mongoose.Types.ObjectId();
    const emptyCampaignId = new mongoose.Types.ObjectId();
    await mongoose.connection.db.collection('messagecampaigns').insertMany([
      { _id: campaignId, summary: { total: 7, delivered: 2 } },
      { _id: emptyCampaignId, summary: { total: 0, delivered: 0 } },
    ]);
    await mongoose.connection.db.collection('messagerecipients').insertMany([
      { campaignId, status: 'draft' },
      { campaignId, status: 'queued' },
      { campaignId, status: 'queued' },
      { campaignId, status: 'submitting' },
      { campaignId, status: 'undelivered' },
      { campaignId, status: 'cancelled' },
      { campaignId, status: 'delivered' },
    ]);

    await up();

    await expect(mongoose.connection.db.collection('messagecampaigns').findOne({ _id: campaignId })).resolves.toMatchObject({
      summary: {
        total: 7, delivered: 2, draft: 1, queued: 2, submitting: 1, undelivered: 1, cancelled: 1,
      },
    });
    await expect(mongoose.connection.db.collection('messagecampaigns').findOne({ _id: emptyCampaignId })).resolves.toMatchObject({
      summary: { draft: 0, queued: 0, submitting: 0, undelivered: 0, cancelled: 0 },
    });

    await down();
    const rolledBack = await mongoose.connection.db.collection('messagecampaigns').findOne({ _id: campaignId });
    expect(rolledBack.summary).toMatchObject({ total: 7, delivered: 2 });
    expect(rolledBack.summary).not.toHaveProperty('draft');
    expect(rolledBack.summary).not.toHaveProperty('submitting');
  });
});
