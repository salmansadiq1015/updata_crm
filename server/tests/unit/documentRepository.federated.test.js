import {
  afterAll, beforeAll, beforeEach, describe, expect, jest, test,
} from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

// Permissions of the non-admin test user; admins bypass them.
let perms = [];
const actual = await import('../../src/shared/middleware/authenticate.js');
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  ...actual,
  loadUserPermissions: async () => perms,
}));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({
  default: { logEvent: jest.fn(), queryByEntity: jest.fn(async () => []), withUserNames: jest.fn(async (e) => e) },
}));

const { default: service, keysetClause } = await import('../../src/modules/documents/documentIndex.service.js');
const { default: DocumentIndex } = await import('../../src/modules/documents/documentIndex.model.js');
const { default: GeneratedDocument } = await import('../../src/modules/doctpl/generatedDocument.model.js');
const { default: ProjectDocument } = await import('../../src/modules/pm/projectDocument.model.js');
const { default: FileMetadata } = await import('../../src/modules/files/file.model.js');
const { default: AccountingDocument } = await import('../../src/modules/accounting/accountingDocument.model.js');
const { default: Project } = await import('../../src/modules/pm/project.model.js');
const { default: Customer } = await import('../../src/modules/crm/customer.model.js');
if (!mongoose.models.User) mongoose.model('User', new mongoose.Schema({ firstName: String, lastName: String, email: String, status: String }));
const User = mongoose.model('User');

const id = () => new mongoose.Types.ObjectId();
const admin = { _id: id(), role: { name: 'Admin' } };
const T0 = Date.UTC(2026, 0, 1);
const at = (i) => new Date(T0 + i * 60_000);

async function seed({ repo = 0, gen = 0, proj = 0, cust = 0, acc = 0, same = false } = {}) {
  let n = 0;
  const when = () => (same ? new Date(T0) : at(n++));
  const docs = { repo: [], gen: [], proj: [], cust: [], acc: [] };
  for (let i = 0; i < repo; i += 1) docs.repo.push({ _id: id(), source: 'repository', origin: 'uploaded', sourceDocumentId: id(), fileId: id(), title: `Repo ${i}`, fileName: `repo-${i}.pdf`, documentType: 'CONTRACT', category: 'LEGAL', isDeleted: false, createdAt: when() });
  for (let i = 0; i < gen; i += 1) docs.gen.push({ _id: id(), fileName: `gen-${i}.pdf`, documentType: 'invoice_final', sourceModule: 'qop', fileId: id(), generatedBy: admin._id, generatedAt: when() });
  for (let i = 0; i < proj; i += 1) docs.proj.push({ _id: id(), projectId: id(), fileName: `proj-${i}.pdf`, category: 'PLAN', fileId: id(), status: 'FINAL', isDeleted: false, createdAt: when() });
  for (let i = 0; i < cust; i += 1) docs.cust.push({ _id: id(), module: 'crm', entityType: 'customer', entityId: id(), originalName: `cust-${i}.pdf`, bucket: 'documents', key: `k-${i}-${Math.random()}`, category: 'OTHER', sizeBytes: 100, isDeleted: false, createdAt: when() });
  for (let i = 0; i < acc; i += 1) docs.acc.push({ _id: id(), fileName: `acc-${i}.pdf`, documentType: 'RECEIPT', filePath: `acc/${i}`, isDeleted: false, createdAt: when() });
  await Promise.all([
    docs.repo.length && DocumentIndex.collection.insertMany(docs.repo),
    docs.gen.length && GeneratedDocument.collection.insertMany(docs.gen),
    docs.proj.length && ProjectDocument.collection.insertMany(docs.proj),
    docs.cust.length && FileMetadata.collection.insertMany(docs.cust),
    docs.acc.length && AccountingDocument.collection.insertMany(docs.acc),
  ]);
  return docs;
}

async function walk(query, user = admin) {
  const seen = [];
  let cursor;
  for (let page = 0; page < 200; page += 1) {
    const r = await service.list({ ...query, ...(cursor ? { cursor } : {}) }, user);
    seen.push(...r.data.map((d) => d.id));
    if (!r.pagination.hasNext) break;
    cursor = r.pagination.nextCursor;
  }
  return seen;
}

beforeAll(connectTestDb, 120_000);
afterAll(disconnectTestDb);
beforeEach(async () => { await clearTestDb(); perms = []; });

describe('federated paging', () => {
  test('walks every document across all sources exactly once, newest first', async () => {
    const docs = await seed({ repo: 23, gen: 31, proj: 17, cust: 12, acc: 9 });
    const ids = await walk({ limit: 10, sortOrder: 'desc' });
    const total = Object.values(docs).reduce((n, l) => n + l.length, 0);
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
    const asc = await walk({ limit: 7, sortOrder: 'asc' });
    expect(asc).toEqual([...ids].reverse());
  });

  test('ties on the same timestamp across sources are neither lost nor repeated', async () => {
    await seed({ repo: 6, gen: 6, proj: 6, cust: 6, same: true });
    const ids = await walk({ limit: 5, sortOrder: 'desc' });
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
  });

  test('keyset clause compares the full source:id on equal dates', () => {
    const cursor = { createdAt: new Date(T0).toISOString(), id: `project:${id()}` };
    // Descending: at an equal date "repository:…" sorts before "project:…", so none of it is after the cursor.
    expect(keysetClause('repository', 'createdAt', cursor, 'desc').$or).toHaveLength(1);
    expect(keysetClause('repository', 'createdAt', cursor, 'asc').$or[1]).toEqual({ createdAt: new Date(T0) });
    expect(keysetClause('accounting', 'createdAt', cursor, 'desc').$or[1]).toEqual({ createdAt: new Date(T0) });
    expect(keysetClause('project', 'createdAt', cursor, 'desc').$or[1]._id).toBeDefined();
    expect(keysetClause('project', 'createdAt', null, 'desc')).toBeNull();
  });

  test('a forged cursor is ignored instead of crashing', async () => {
    await seed({ repo: 3 });
    const r = await service.list({ cursor: 'not-base64-json', limit: 10 }, admin);
    expect(r.data).toHaveLength(3);
  });
});

describe('sections, flags and actions', () => {
  test('sign-off and archive split every source, not only project files', async () => {
    const docs = await seed({ repo: 3, gen: 3, cust: 2, acc: 2 });
    await DocumentIndex.collection.updateOne({ _id: docs.repo[0]._id }, { $set: { visumBy: admin._id, visumAt: new Date() } });
    await GeneratedDocument.collection.updateOne({ _id: docs.gen[0]._id }, { $set: { visumBy: admin._id } });
    await FileMetadata.collection.updateOne({ _id: docs.cust[0]._id }, { $set: { archived: true } });
    await AccountingDocument.collection.updateOne({ _id: docs.acc[0]._id }, { $set: { archived: true, visumBy: admin._id } });

    const visum = await walk({ section: 'visum', limit: 50 });
    const archiv = await walk({ section: 'archiv', limit: 50 });
    const current = await walk({ section: 'documents', limit: 50 });
    expect(visum.sort()).toEqual([`repository:${docs.repo[0]._id}`, `generated:${docs.gen[0]._id}`].sort());
    expect(archiv.sort()).toEqual([`customer:${docs.cust[0]._id}`, `accounting:${docs.acc[0]._id}`].sort());
    expect(current).toHaveLength(10 - 4);
  });

  test('archive, sign-off and release work on uploaded repository documents', async () => {
    const [doc] = (await seed({ repo: 1 })).repo;
    const recordId = `repository:${doc._id}`;
    await expect(service.setArchived(recordId, admin, true)).resolves.toEqual({ archived: true });
    await service.setArchived(recordId, admin, false);
    await expect(service.setVisum(recordId, admin, true)).resolves.toEqual({ visiert: true });
    await expect(service.setReleased(recordId, admin, true)).resolves.toEqual({ released: true });
    const stored = await DocumentIndex.findById(doc._id).lean();
    expect(stored).toMatchObject({ archived: false, releasedToField: true });
    expect(String(stored.visumBy)).toBe(String(admin._id));
    const [listed] = (await service.list({ section: 'visum' }, admin)).data;
    expect(listed.visum.by).toBe(String(admin._id));
  });

  test('without documents:read:all only released documents are listed — on every page', async () => {
    const docs = await seed({ repo: 30 });
    await DocumentIndex.collection.updateMany({ _id: { $in: docs.repo.filter((_, i) => i % 3 === 0).map((d) => d._id) } }, { $set: { releasedToField: true } });
    perms = ['documents:read'];
    const user = { _id: id(), role: { name: 'Staff' } };
    const ids = await walk({ limit: 4 }, user);
    expect(ids).toHaveLength(10);
  });

  test('bulk runs each id through the single action and reports failures per id', async () => {
    const docs = await seed({ repo: 3 });
    const ids = docs.repo.map((d) => `repository:${d._id}`);
    const res = await service.bulk('archive', [...ids, `repository:${id()}`], admin);
    expect(res).toMatchObject({ total: 4, succeeded: 3 });
    expect(res.failed[0].statusCode).toBe(404);
    expect(await DocumentIndex.countDocuments({ archived: true })).toBe(3);
  });

  test('metadata edits are limited to uploaded documents', async () => {
    const docs = await seed({ repo: 1, gen: 1 });
    const updated = await service.updateMetadata(`repository:${docs.repo[0]._id}`, { title: 'Renamed', category: 'TECHNICAL' }, admin);
    expect(updated).toMatchObject({ title: 'Renamed', category: 'TECHNICAL' });
    await expect(service.updateMetadata(`generated:${docs.gen[0]._id}`, { title: 'x' }, admin)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('filters and names', () => {
  test('a scope a source cannot carry excludes that source instead of being ignored', async () => {
    const employeeId = id();
    await seed({ repo: 2, gen: 3, proj: 3, cust: 3, acc: 2 });
    await DocumentIndex.collection.insertOne({ _id: id(), source: 'repository', sourceDocumentId: id(), fileName: 'licence.pdf', employeeId, isDeleted: false, createdAt: new Date() });
    await AccountingDocument.collection.insertOne({ _id: id(), fileName: 'expense.pdf', documentType: 'RECEIPT', employeeId, isDeleted: false, createdAt: new Date() });
    const r = await service.list({ employeeId: String(employeeId), limit: 50 }, admin);
    expect(r.data.map((d) => d.fileName).sort()).toEqual(['expense.pdf', 'licence.pdf']);
  });

  test('a date-only "to" includes that whole day', async () => {
    await DocumentIndex.collection.insertOne({ _id: id(), source: 'repository', sourceDocumentId: id(), fileName: 'late.pdf', isDeleted: false, createdAt: new Date('2026-09-24T18:30:00Z') });
    const r = await service.list({ dateFrom: '2026-09-24', dateTo: '2026-09-24' }, admin);
    expect(r.data.map((d) => d.fileName)).toEqual(['late.pdf']);
  });

  test('search is a partial, case-insensitive match on every source', async () => {
    await seed({ repo: 2, gen: 2, cust: 2 });
    const r = await service.list({ search: 'GEN-1' }, admin);
    expect(r.data.map((d) => d.fileName)).toEqual(['gen-1.pdf']);
    await expect(service.list({ search: '(.*' }, admin)).resolves.toMatchObject({ data: [] });
  });

  test('links carry names, one batch per type; the generated owner is no longer an "employee"', async () => {
    const customer = await Customer.collection.insertOne({ name: 'Meier Haustechnik AG', customerNumber: 'K-1001', isDeleted: false });
    const project = await Project.collection.insertOne({ name: 'Wärmepumpe Dornach', projectNumber: 'P-2026-01', isDeleted: false });
    const person = { _id: (await User.collection.insertOne({ firstName: 'Anna', lastName: 'Keller', email: 'anna@example.com', isDeleted: false })).insertedId };
    await DocumentIndex.collection.insertOne({ _id: id(), source: 'repository', sourceDocumentId: id(), fileName: 'a.pdf', customerId: customer.insertedId, projectId: project.insertedId, employeeId: person._id, uploadedBy: person._id, isDeleted: false, createdAt: new Date() });
    await GeneratedDocument.collection.insertOne({ _id: id(), fileName: 'g.pdf', documentType: 'quotation', fileId: id(), sourceModule: 'qop', ownerUserId: person._id, generatedBy: admin._id, generatedAt: new Date(T0) });
    const { data } = await service.list({}, admin);
    const repo = data.find((d) => d.fileName === 'a.pdf');
    expect(repo.links).toEqual([
      { type: 'customer', id: String(customer.insertedId), label: 'Meier Haustechnik AG', code: 'K-1001' },
      { type: 'project', id: String(project.insertedId), label: 'Wärmepumpe Dornach', code: 'P-2026-01' },
      { type: 'employee', id: String(person._id), label: 'Anna Keller' },
    ]);
    expect(repo.uploadedByName).toBe('Anna Keller');
    expect(data.find((d) => d.fileName === 'g.pdf').links).toEqual([]);
  });

  test('a site lists its projects\' documents and pages with a cursor', async () => {
    const siteId = id();
    const projects = await Project.collection.insertMany([{ siteId, name: 'A', projectNumber: 'P-A', isDeleted: false }, { siteId, name: 'B', projectNumber: 'P-B', isDeleted: false }, { name: 'other', projectNumber: 'P-C', isDeleted: false }]);
    const pids = Object.values(projects.insertedIds);
    await ProjectDocument.collection.insertMany(Array.from({ length: 9 }, (_, i) => ({ _id: id(), projectId: pids[i % 3], fileName: `p${i}.pdf`, isDeleted: false, createdAt: at(i) })));
    const ids = await walk({ siteId: String(siteId), limit: 2 });
    expect(ids).toHaveLength(6);
  });
});

describe('stats and pickers', () => {
  test('stats agree with the section lists and only count readable sources', async () => {
    const docs = await seed({ repo: 4, gen: 2, cust: 3, acc: 2 });
    await DocumentIndex.collection.updateOne({ _id: docs.repo[0]._id }, { $set: { archived: true } });
    await DocumentIndex.collection.updateOne({ _id: docs.repo[1]._id }, { $set: { visumBy: admin._id } });
    const s = await service.stats(admin);
    expect(s).toMatchObject({ total: 11, sections: { documents: 9, visum: 1, archiv: 1 }, bySource: { repository: 4, generated: 2, customer: 3, accounting: 2 } });
    expect(s.storageBytes).toBe(300);

    perms = ['documents:read', 'documents:read:all'];
    const staff = { _id: id(), role: { name: 'Staff' } };
    const limited = await service._computeStats(staff, perms, false);
    expect(limited.bySource).toEqual({ repository: 4, generated: 2 });
  });

  test('link pickers search by name or number and respect permissions', async () => {
    await Customer.collection.insertMany([{ name: 'Meier AG', customerNumber: 'K-1', isDeleted: false }, { name: 'Huber GmbH', customerNumber: 'K-2', isDeleted: false }]);
    expect((await service.linkTargets({ type: 'customer', search: 'meier' }, admin)).map((c) => c.label)).toEqual(['Meier AG']);
    perms = ['documents:write'];
    expect(await service.linkTargets({ type: 'customer', search: '' }, { _id: id(), role: { name: 'Staff' } })).toEqual([]);
  });
});

describe('query performance', () => {
  test('a page stays fast with 6,000 documents across sources, deep pages included', async () => {
    await seed({ repo: 1500, gen: 1500, proj: 1000, cust: 1500, acc: 500 });
    await Promise.all([DocumentIndex, GeneratedDocument, ProjectDocument, FileMetadata, AccountingDocument].map((m) => m.createIndexes()));
    await service.list({ limit: 25 }, admin);
    const t0 = performance.now();
    const first = await service.list({ limit: 25 }, admin);
    const t1 = performance.now();
    let cursor = first.pagination.nextCursor;
    for (let i = 0; i < 40; i += 1) cursor = (await service.list({ limit: 25, cursor }, admin)).pagination.nextCursor;
    const t2 = performance.now();
    const deep = await service.list({ limit: 25, cursor }, admin);
    const t3 = performance.now();
    await service._computeStats(admin, [], false); // uncached
    const t4 = performance.now();
    expect(deep.data).toHaveLength(25);
    expect(t1 - t0).toBeLessThan(400);
    expect(t3 - t2).toBeLessThan(400);
    console.log(`documents perf (6000): first page ${(t1 - t0).toFixed(1)} ms, page 42 ${(t3 - t2).toFixed(1)} ms, avg page ${((t2 - t1) / 40).toFixed(1)} ms, stats (uncached) ${(t4 - t3).toFixed(1)} ms`);
  }, 120_000);
});
