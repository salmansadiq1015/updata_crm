import { beforeAll, afterAll, beforeEach, test, expect, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

// Mailbox read paths: keyset conversation list must equal the previous full-group aggregation.
jest.unstable_mockModule('../../src/modules/email/email.providers.js', () => ({ credentials: jest.fn(), sendProvider: jest.fn(), syncProvider: jest.fn(), mutateProvider: jest.fn(), verifyImap: jest.fn(), renewWatch: jest.fn() }));
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob: jest.fn(async () => ({})) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn(async () => ({})) } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn(async () => ({})) } }));
const service = await import('../../src/modules/email/email.service.js');
const { EmailAccount, EmailMessage } = await import('../../src/modules/email/email.models.js');
const { search } = await import('../../src/modules/email/email.validation.js');
const { ObjectId } = mongoose.Types;

beforeAll(async () => { await connectTestDb(); await Promise.all([EmailAccount.init(), EmailMessage.init()]); });
beforeEach(clearTestDb);
afterAll(disconnectTestDb);

/** The pre-060 implementation: group the whole mailbox, then keyset on the latest message. */
async function reference(ownerId, query) {
  const p = search.parse(query), filter = service.messageFilter(ownerId, p);
  const cursor = p.cursor && JSON.parse(Buffer.from(p.cursor, 'base64url').toString());
  const pipeline = [{ $match: filter }, { $sort: { date: -1, _id: -1 } }, { $group: { _id: { accountId: '$accountId', threadKey: '$threadKey' }, latest: { $first: '$$ROOT' }, count: { $sum: 1 }, unreadCount: { $sum: { $cond: ['$unread', 1, 0] } } } }, { $replaceRoot: { newRoot: { $mergeObjects: ['$latest', { conversationCount: '$count', unreadCount: '$unreadCount' }] } } }];
  if (cursor) pipeline.push({ $match: { $or: [{ date: { $lt: new Date(cursor.date) } }, { date: new Date(cursor.date), _id: { $lt: new ObjectId(cursor.id) } }] } });
  pipeline.push({ $sort: { date: -1, _id: -1 } }, { $limit: p.limit + 1 }, { $project: { html: 0, text: 0, bcc: 0 } });
  const rows = await EmailMessage.aggregate(pipeline), more = rows.length > p.limit, items = rows.slice(0, p.limit), last = items.at(-1);
  return { items, nextCursor: more ? Buffer.from(JSON.stringify({ date: last.date, id: last._id })).toString('base64url') : null };
}
const canon = value => JSON.parse(JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)));

async function seed() {
  const ownerId = new ObjectId(), other = new ObjectId(), accounts = [new ObjectId(), new ObjectId()];
  await EmailAccount.collection.insertMany([
    { _id: accounts[0], ownerId, provider: 'google', address: 'a@example.com', status: 'connected', credentials: 'SEALED-SECRET', webhookSecret: 'HOOK-SECRET', syncLeaseToken: 'LEASE', createdAt: new Date(1) },
    { _id: accounts[1], ownerId, provider: 'imap', address: 'b@example.com', status: 'connected', credentials: 'SEALED-SECRET', createdAt: new Date(2) },
  ]);
  const docs = [], base = Date.UTC(2026, 0, 1), folders = ['inbox', 'inbox', 'inbox', 'archive', 'sent', 'spam'];
  let n = 0;
  for (let t = 0; t < 70; t++) {
    const size = 1 + (t % 4);
    for (let i = 0; i < size; i++, n++) {
      // Interleave threads in time and reuse threadKey across accounts, plus equal timestamps.
      const date = new Date(base + ((n * 37) % 120) * 60000);
      docs.push({ ownerId: t % 9 === 8 ? other : ownerId, accountId: accounts[t % 2], externalId: `e${n}`, threadKey: `thread-${t % 35}`, from: `Person ${t} <p${t}@example.com>`, to: ['me@example.com'], bcc: ['hidden@example.com'], subject: `${t % 3 ? 'Invoice' : 'Proposal'} ${t}`, text: `Body ${t}`, html: `<p>Body ${t}</p>`, date, folder: folders[(t + i) % folders.length], unread: (n % 3) === 0, starred: n % 5 === 0, important: n % 7 === 0, state: 'received', attachments: [], __v: 0 });
    }
  }
  await EmailMessage.collection.insertMany(docs);
  return { ownerId, accounts };
}

test('keyset conversation list returns exactly the previous aggregation for every folder, filter and page', async () => {
  const { ownerId, accounts } = await seed();
  const queries = [{ folder: 'inbox' }, { folder: 'all' }, { folder: 'starred' }, { folder: 'important' }, { folder: 'sent' }, { folder: 'inbox', unread: 'true' }, { folder: 'all', q: 'invoice' }, { folder: 'inbox', accountId: String(accounts[1]) }, { folder: 'all', from: 'Person 1' }];
  for (const q of queries) {
    let a, b, pages = 0;
    do {
      const mine = await service.listMessages(ownerId, { ...q, limit: 7, ...(a ? { cursor: a } : {}) });
      const ref = await reference(ownerId, { ...q, limit: 7, ...(b ? { cursor: b } : {}) });
      expect(canon(mine)).toEqual(canon(ref));
      a = mine.nextCursor; b = ref.nextCursor; pages++;
    } while (a && pages < 50);
    expect(b).toBeNull();
  }
});

test('conversation list never carries bodies or BCC and rejects tampered cursors', async () => {
  const { ownerId } = await seed();
  const { items } = await service.listMessages(ownerId, { folder: 'all', limit: 100 });
  expect(items.length).toBeGreaterThan(0);
  for (const item of items) { expect(item).not.toHaveProperty('html'); expect(item).not.toHaveProperty('text'); expect(item).not.toHaveProperty('bcc'); expect(item.conversationCount).toBeGreaterThan(0); }
  await expect(service.listMessages(ownerId, { cursor: 'not-a-cursor' })).rejects.toThrow(/Invalid message cursor/);
  expect(await service.listMessages(new ObjectId(), { folder: 'all' })).toEqual({ items: [], nextCursor: null });
});

test('account list reports per-account inbox unread counts from the index and exposes no secrets', async () => {
  const { ownerId, accounts } = await seed();
  const accountsOut = await service.listAccounts(ownerId);
  const expected = await Promise.all(accounts.map(accountId => EmailMessage.countDocuments({ ownerId, accountId, folder: 'inbox', unread: true })));
  expect(accountsOut.map(a => a.unreadCount)).toEqual(expected);
  expect(JSON.stringify(accountsOut)).not.toMatch(/SEALED-SECRET|HOOK-SECRET|LEASE/);
  const plan = JSON.stringify(await EmailMessage.aggregate([{ $match: { ownerId, folder: 'inbox', unread: true } }, { $group: { _id: '$accountId', count: { $sum: 1 } } }]).explain('executionStats'));
  expect(plan).toContain('ownerId_1_folder_1_unread_1_accountId_1');
  expect(plan).toMatch(/"totalDocsExamined":0/);
});

test('migration 060 creates the mailbox and user read indexes idempotently', async () => {
  const migration = await import('../../src/migrations/060_email_users_indexes.js');
  const { default: User } = await import('../../src/modules/auth/user.model.js');
  await migration.up(); await migration.up();
  const keys = async model => (await model.collection.indexes()).map(i => JSON.stringify(i.key));
  expect(await keys(EmailMessage)).toEqual(expect.arrayContaining(['{"ownerId":1,"date":-1,"_id":-1}', '{"ownerId":1,"starred":1,"date":-1,"_id":-1}', '{"ownerId":1,"important":1,"date":-1,"_id":-1}', '{"ownerId":1,"folder":1,"unread":1,"accountId":1}']));
  expect(await keys(User)).toEqual(expect.arrayContaining(['{"isDeleted":1,"createdAt":-1,"_id":-1}', '{"isDeleted":1,"status":1,"createdAt":1}']));
  const starred = (await EmailMessage.collection.indexes()).find(i => JSON.stringify(i.key) === '{"ownerId":1,"starred":1,"date":-1,"_id":-1}');
  expect(starred.partialFilterExpression).toEqual({ starred: true });
});
