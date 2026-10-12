import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it,
} from '@jest/globals';
import {
  down, preview, up,
} from '../../src/migrations/014_canonicalize_lead_geography.js';

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

describe('migration 014 canonical lead geography', () => {
  it('previews, applies, resumes idempotently, and rolls back exact addresses', async () => {
    const leads = mongoose.connection.db.collection('leads');
    const originals = [
      { _id: new mongoose.Types.ObjectId(), address: { city: 'Lahore', area: 'Lahore', country: 'PK', street: 'One' } },
      { _id: new mongoose.Types.ObjectId(), address: { city: 'Lahore, Pakistan', area: 'Lahore, Pakistan', country: null } },
      { _id: new mongoose.Types.ObjectId(), address: { city: 'Paris 10th Arrondissement', country: 'FR' } },
      { _id: new mongoose.Types.ObjectId(), address: { city: 'Paris', area: 'Paris 11e', country: 'FR' } },
      { _id: new mongoose.Types.ObjectId(), address: { city: 'Paris', area: '10 Rue Trousseau', country: 'FR' } },
    ];
    await leads.insertMany(originals);

    const dryRun = await preview({ db: mongoose.connection.db });
    expect(dryRun).toMatchObject({ scanned: 5, affected: 5, canonical: 4, reviewRequired: 1 });

    const applied = await up({ db: mongoose.connection.db });
    expect(applied.updated).toBe(5);
    const migrated = await leads.find({}).sort({ _id: 1 }).toArray();
    const lahoreIds = migrated.slice(0, 2).map((lead) => lead.address.geography.cityId);
    expect(new Set(lahoreIds).size).toBe(1);
    expect(migrated[0].address.area).toBeNull();

    const paris = migrated.filter((lead) => lead.address.city === 'Paris');
    expect(new Set(paris.map((lead) => lead.address.geography.cityId)).size).toBe(1);
    expect(new Set(paris.slice(0, 2).map((lead) => lead.address.geography.areaId)).size).toBe(2);
    expect(paris.find((lead) => lead.address.area === '10 Rue Trousseau').address.geography.areaId).toBeNull();

    // A resumed migration leaves already canonical documents untouched and does
    // not overwrite the original rollback snapshots.
    const resumed = await up({ db: mongoose.connection.db });
    expect(resumed.updated).toBe(0);
    expect(await mongoose.connection.db.collection('migration_014_lead_geography_backup').countDocuments()).toBe(5);

    const rolledBack = await down({ db: mongoose.connection.db });
    expect(rolledBack.restored).toBe(5);
    const restored = await leads.find({}).sort({ _id: 1 }).toArray();
    expect(restored.map((lead) => lead.address)).toEqual(
      [...originals].sort((a, b) => String(a._id).localeCompare(String(b._id))).map((lead) => lead.address),
    );
  });

  it('repairs the legacy CH default only from reliable context or exact geocoding', async () => {
    const leads = mongoose.connection.db.collection('leads');
    await leads.insertMany([
      {
        _id: new mongoose.Types.ObjectId(),
        source: 'google_places',
        address: { city: 'Paris', country: 'CH' },
        sourceMetadata: { discoveryLocation: { name: 'Paris, France' } },
      },
      {
        _id: new mongoose.Types.ObjectId(),
        source: 'import',
        address: { city: 'Lahore', country: 'CH' },
      },
      {
        _id: new mongoose.Types.ObjectId(),
        source: 'import',
        address: { city: null, country: 'CH' },
      },
    ]);
    const resolveLocation = async (query) => (
      query === 'Lahore' ? { city: 'Lahore', countryCode: 'PK' } : null
    );

    const result = await up({ db: mongoose.connection.db, resolveLocation });
    expect(result.updated).toBe(3);

    const migrated = await leads.find({}).toArray();
    const paris = migrated.find((lead) => lead.address.city === 'Paris');
    const lahore = migrated.find((lead) => lead.address.city === 'Lahore');
    const unresolved = migrated.find((lead) => !lead.address.city);
    expect(paris.address).toMatchObject({ country: 'FR' });
    expect(paris.address.geography.countryId).toBe('country:FR');
    expect(lahore.address).toMatchObject({ country: 'PK' });
    expect(lahore.address.geography.countryId).toBe('country:PK');
    expect(unresolved.address.country).toBeNull();
    expect(unresolved.address.geography).toMatchObject({
      countryId: null,
      cityId: null,
      reviewRequired: true,
    });
    expect(unresolved.address.geography.issues).toContain('UNVERIFIED_COUNTRY');
  });
});
