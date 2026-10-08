import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  jest, describe, it, beforeAll, afterAll, afterEach, beforeEach, expect,
} from '@jest/globals';

// Bulk soft delete against the real data layer (Lead model + repository +
// service), so what is asserted is what Mongoose actually does with updateMany
// and the soft-delete hook — not a mock's idea of it. Peripherals are mocked.
jest.unstable_mockModule('../../auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../../metrics/index.js', () => ({ leadImportsTotal: { inc: jest.fn() } }));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: {
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
  },
}));

let mongod;
let Lead;
let User;
let leadRepository;
let leadService;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  Lead = (await import('../lead.model.js')).default;
  User = (await import('../../auth/user.model.js')).default;
  leadRepository = (await import('../lead.repository.js')).default;
  leadService = (await import('../lead.service.js')).default;
  await Lead.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const roleId = new mongoose.Types.ObjectId();
let seq = 0;

beforeEach(async () => {
  await Promise.all([Lead.deleteMany({}), User.deleteMany({})]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function makeUser() {
  seq += 1;
  return User.create({
    email: `bulk${seq}@example.ch`,
    passwordHash: 'not-a-real-hash',
    firstName: 'A',
    lastName: 'B',
    role: roleId,
  });
}

let leadNo = 0;
async function makeLeads(createdBy, count) {
  const docs = Array.from({ length: count }, () => {
    leadNo += 1;
    return {
      leadNumber: `L-7${String(leadNo).padStart(5, '0')}`,
      name: `Lead ${leadNo}`,
      createdBy,
    };
  });
  return Lead.insertMany(docs);
}

describe('leadService.bulkSoftDelete', () => {
  it('soft-deletes many leads company-wide in a SINGLE updateMany', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    // Mixed ownership proves the delete is company-wide (gated by RBAC, not createdBy).
    const mine = await makeLeads(owner._id, 3);
    const theirs = await makeLeads(other._id, 2);
    const ids = [...mine, ...theirs].map((lead) => String(lead._id));
    const spy = jest.spyOn(Lead, 'updateMany');

    const result = await leadService.bulkSoftDelete(ids, { userId: owner._id });

    expect(result.requested).toBe(5);
    expect(result.deleted).toBe(5);
    expect(result.notDeletedIds).toEqual([]);
    expect(new Set(result.deletedIds)).toEqual(new Set(ids));
    expect(spy).toHaveBeenCalledTimes(1); // ONE bulk query, never one-per-id
    expect(await Lead.countDocuments({ isDeleted: false })).toBe(0);
    expect(await Lead.countDocuments({ isDeleted: true })).toBe(5);
  });

  it('deletes a single lead correctly (1 still works)', async () => {
    const owner = await makeUser();
    const [lead] = await makeLeads(owner._id, 1);

    const result = await leadService.bulkSoftDelete([String(lead._id)], { userId: owner._id });

    expect(result).toMatchObject({ requested: 1, deleted: 1, notDeletedIds: [] });
    expect(await Lead.countDocuments({ isDeleted: false })).toBe(0);
  });

  it('collapses duplicate ids and deletes each lead once', async () => {
    const owner = await makeUser();
    const [lead] = await makeLeads(owner._id, 1);
    const id = String(lead._id);

    const result = await leadService.bulkSoftDelete([id, id, id], { userId: owner._id });

    expect(result.requested).toBe(1); // deduped
    expect(result.deleted).toBe(1);
    expect(result.deletedIds).toEqual([id]);
  });

  it('reports ids it could not delete (nonexistent / already deleted) without failing the batch', async () => {
    const owner = await makeUser();
    const [a, b] = await makeLeads(owner._id, 2);
    const ghost = String(new mongoose.Types.ObjectId()); // valid id, no such lead

    // Pre-delete b so it is already gone.
    await leadService.softDelete(String(b._id), { userId: owner._id });

    const result = await leadService.bulkSoftDelete(
      [String(a._id), String(b._id), ghost],
      { userId: owner._id },
    );

    expect(result.requested).toBe(3);
    expect(result.deleted).toBe(1); // only a
    expect(result.deletedIds).toEqual([String(a._id)]);
    expect(new Set(result.notDeletedIds)).toEqual(new Set([String(b._id), ghost]));
  });

  it('is a no-op for an empty selection (no updateMany)', async () => {
    const spy = jest.spyOn(Lead, 'updateMany');
    const result = await leadService.bulkSoftDelete([], { userId: new mongoose.Types.ObjectId() });
    expect(result).toEqual({ requested: 0, deleted: 0, deletedIds: [], notDeletedIds: [] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('leaves the single-delete path intact', async () => {
    const owner = await makeUser();
    const [lead] = await makeLeads(owner._id, 1);
    const result = await leadService.softDelete(String(lead._id), { userId: owner._id });
    expect(result).toEqual({ id: String(lead._id), deleted: true });
    expect(await Lead.countDocuments({ isDeleted: false })).toBe(0);
  });
});

describe('leadRepository.bulkSoftDelete', () => {
  it('runs exactly one find + one updateMany regardless of id count (no N+1)', async () => {
    const owner = await makeUser();
    const leads = await makeLeads(owner._id, 20);
    const ids = leads.map((lead) => String(lead._id));
    const findSpy = jest.spyOn(Lead, 'find');
    const updateSpy = jest.spyOn(Lead, 'updateMany');

    const { deletedIds, modifiedCount } = await leadRepository.bulkSoftDelete(ids);

    expect(deletedIds).toHaveLength(20);
    expect(modifiedCount).toBe(20);
    expect(findSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });
});

describe('leadService.bulkAssign', () => {
  it('assigns many leads company-wide in a SINGLE updateMany', async () => {
    const owner = await makeUser();
    const assignee = await makeUser();
    const leads = await makeLeads(owner._id, 4);
    const ids = leads.map((lead) => String(lead._id));
    const spy = jest.spyOn(Lead, 'updateMany');

    const result = await leadService.bulkAssign(ids, String(assignee._id), { userId: owner._id });

    expect(result).toMatchObject({ requested: 4, updated: 4, notUpdatedIds: [] });
    expect(spy).toHaveBeenCalledTimes(1); // ONE bulk query, never one-per-id
    const after = await Lead.find({ _id: { $in: ids } }).lean();
    expect(after.every((lead) => String(lead.assignedTo) === String(assignee._id))).toBe(true);
  });

  it('unassigns every selected lead when assignedTo is null', async () => {
    const owner = await makeUser();
    const assignee = await makeUser();
    const leads = await makeLeads(owner._id, 2);
    const ids = leads.map((lead) => String(lead._id));
    await leadService.bulkAssign(ids, String(assignee._id), { userId: owner._id });

    const result = await leadService.bulkAssign(ids, null, { userId: owner._id });

    expect(result.updated).toBe(2);
    const after = await Lead.find({ _id: { $in: ids } }).lean();
    expect(after.every((lead) => lead.assignedTo == null)).toBe(true);
  });

  it('collapses duplicates and reports ids it could not assign', async () => {
    const owner = await makeUser();
    const assignee = await makeUser();
    const [lead] = await makeLeads(owner._id, 1);
    const id = String(lead._id);
    const ghost = String(new mongoose.Types.ObjectId());

    const result = await leadService.bulkAssign([id, id, ghost], String(assignee._id), { userId: owner._id });

    expect(result.requested).toBe(2); // deduped
    expect(result.updated).toBe(1);
    expect(result.updatedIds).toEqual([id]);
    expect(result.notUpdatedIds).toEqual([ghost]);
  });
});
