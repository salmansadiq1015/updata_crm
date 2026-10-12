import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';
import { down, preview, up } from '../../src/migrations/015_english_lead_geography.js';

let mongod;
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

const point = (lat, lng) => ({ type: 'Point', coordinates: [lng, lat] });

// English reverse geocodes keyed by latitude (real Nominatim answers).
const GEO = {
  31.367: { city: 'Lahore', area: 'Bahria Town', country: 'PK', region: 'Punjab' },
  31.446: { city: 'Lahore', area: 'Johar Town', country: 'PK', region: 'Punjab' },
  48.867: { city: 'Paris', area: '8th Arrondissement of Paris', country: 'FR', region: 'Ile-de-France' },
};

describe('migration 015 English lead geography', () => {
  it('repairs Urdu/junk cities from coordinates, unifies spellings, and rolls back exactly', async () => {
    const leads = mongoose.connection.db.collection('leads');
    const docs = [
      { _id: new mongoose.Types.ObjectId(), address: { country: 'PK', city: 'تروگل', area: 'Iris Block Sector C Bahria Town' }, location: point(31.367, 74.198) },
      { _id: new mongoose.Types.ObjectId(), address: { country: 'PK', city: 'لاہور', area: 'Block D Pia Housing Scheme' }, location: point(31.446, 74.281) },
      { _id: new mongoose.Types.ObjectId(), address: { country: null, city: 'A Rosewood Hotel · Visited link' }, location: point(48.867, 2.321) },
      { _id: new mongoose.Types.ObjectId(), address: { country: 'MA', city: 'Mohammédia المحمدية' }, location: point(33.7, -7.39) },
      { _id: new mongoose.Types.ObjectId(), address: { country: 'MA', city: 'Mohammédia المحمدية', area: 'Centre' }, location: point(33.7, -7.39) },
      { _id: new mongoose.Types.ObjectId(), address: { country: 'MA', city: 'Mohammedia' }, location: point(33.7, -7.39) },
      { _id: new mongoose.Types.ObjectId(), address: { country: 'PK', city: 'Lahore Pakistan' } },
      // Junk with no coordinates: never invented, only canonicalized.
      { _id: new mongoose.Types.ObjectId(), address: { country: null, city: 'Immeuble Haj Yemmou' } },
    ];
    await leads.insertMany(docs);
    const reverseGeocode = jest.fn(async ({ lat }) => GEO[lat.toFixed(3)] ?? null);

    const dry = await preview({ reverseGeocode });
    expect(dry.updated).toBe(0);
    expect(await leads.findOne({ _id: docs[0]._id })).toMatchObject({ address: { city: 'تروگل' } });

    const stats = await up({ reverseGeocode });
    expect(stats.unrepairable).toBe(1);
    const byId = async (doc) => (await leads.findOne({ _id: doc._id })).address;

    expect(await byId(docs[0])).toMatchObject({ country: 'PK', city: 'Lahore', area: 'Bahria Town' });
    expect(await byId(docs[1])).toMatchObject({ country: 'PK', city: 'Lahore', area: 'Johar Town' });
    expect(await byId(docs[2])).toMatchObject({ country: 'FR', city: 'Paris', area: '8th Arrondissement' });
    const moh = await Promise.all([docs[3], docs[4], docs[5]].map(byId));
    expect(new Set(moh.map((a) => a.city))).toEqual(new Set(['Mohammédia']));
    expect(new Set(moh.map((a) => a.geography.cityId)).size).toBe(1);
    expect(await byId(docs[6])).toMatchObject({ city: 'Lahore', country: 'PK' });
    expect((await byId(docs[6])).geography.cityId).toBe((await byId(docs[0])).geography.cityId);
    expect((await byId(docs[7])).geography.cityId).toBeNull();

    // Idempotent: a second run changes nothing.
    const again = await up({ reverseGeocode });
    expect(again.changed).toBe(0);

    await down();
    for (const doc of docs) expect(await byId(doc)).toEqual(doc.address);
  });
});
