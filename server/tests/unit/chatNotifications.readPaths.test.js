import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach, describe, test, expect, jest } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import User from '../../src/modules/auth/user.model.js';
import Role from '../../src/modules/auth/role.model.js';
import Permission from '../../src/modules/auth/permission.model.js';
import Lead from '../../src/modules/crm/lead.model.js';
import ChatRoom from '../../src/modules/chat/chatRoom.model.js';
import ChatMessage from '../../src/modules/mobile/chatMessage.model.js';
import chatRoomService from '../../src/modules/chat/chatRoom.service.js';
import chatMessageService from '../../src/modules/chat/chatMessage.service.js';
import chatAccessService from '../../src/modules/chat/chatAccess.service.js';
import InAppNotification from '../../src/modules/notifications/inAppNotification.model.js';
import inAppNotificationRepository from '../../src/modules/notifications/inAppNotification.repository.js';
import notificationFeedService from '../../src/modules/notifications/notificationFeed.service.js';
import mobileNotificationService from '../../src/modules/mobile/notification.service.js';
import cacheManager from '../../src/shared/cache/CacheManager.js';
import migration058 from '../../src/migrations/058_chat_notification_indexes.js';

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([ChatRoom.init(), ChatMessage.init(), InAppNotification.init()]);
});
afterEach(async () => { jest.restoreAllMocks(); cacheManager.l1.flush(); await clearTestDb(); });
afterAll(disconnectTestDb);

const oid = () => new mongoose.Types.ObjectId();
const PENDING = ['TASK', 'FINANCE', 'MAINTENANCE', 'DOCUMENT', 'PROJECT', 'SCHEDULING'];

// The pre-optimisation $facet summary, kept verbatim as the reference for equivalence.
async function referenceSummary(userId) {
  const [summary] = await InAppNotification.aggregate([
    { $match: { userId, isDismissed: false } },
    { $facet: {
      totals: [{ $group: { _id: null, total: { $sum: 1 }, unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } }, highPriority: { $sum: { $cond: [{ $in: ['$priority', ['HIGH', 'CRITICAL']] }, 1, 0] } }, critical: { $sum: { $cond: [{ $eq: ['$priority', 'CRITICAL'] }, 1, 0] } } } }],
      categories: [{ $group: { _id: '$category', total: { $sum: 1 }, unread: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } } } }],
      pendingActions: [
        { $match: { isRead: false, category: { $in: PENDING } } },
        { $addFields: { priorityRank: { $switch: { branches: [{ case: { $eq: ['$priority', 'CRITICAL'] }, then: 4 }, { case: { $eq: ['$priority', 'HIGH'] }, then: 3 }, { case: { $eq: ['$priority', 'NORMAL'] }, then: 2 }], default: 1 } } } },
        { $sort: { priorityRank: -1, sentAt: -1, _id: -1 } }, { $limit: 5 }, { $project: { priorityRank: 0, __v: 0 } },
      ],
    } },
  ]);
  const totals = summary.totals?.[0] || {};
  const byCategory = {};
  for (const row of summary.categories || []) if (row._id) byCategory[row._id] = { total: row.total, unread: row.unread };
  return { total: totals.total || 0, unread: totals.unread || 0, highPriority: totals.highPriority || 0, critical: totals.critical || 0, byCategory, pendingActions: summary.pendingActions };
}

async function seedNotifications(userId, n = 240) {
  const base = Date.UTC(2026, 5, 1);
  const cats = [...PENDING, 'SYSTEM', null];
  const pris = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL', null];
  const docs = Array.from({ length: n }, (_, i) => ({
    userId, title: `T${i}`, body: i % 17 === 0 ? 'Invoice due' : `B${i}`,
    category: cats[i % cats.length], priority: pris[(i * 7) % pris.length],
    isRead: i % 3 === 0, isDismissed: i % 11 === 0,
    sentAt: new Date(base + Math.floor(i / 3) * 1000), // ties on sentAt
  }));
  await InAppNotification.collection.insertMany(docs);
}

describe('notification feed read paths', () => {
  test('summary matches the original $facet aggregation exactly (ties, null priority/category)', async () => {
    const me = oid();
    await seedNotifications(me);
    await seedNotifications(oid(), 30);
    const expected = await referenceSummary(me);
    expect(JSON.parse(JSON.stringify(await inAppNotificationRepository.getSummary(me))))
      .toEqual(JSON.parse(JSON.stringify(expected)));
    expect(expected.pendingActions).toHaveLength(5);
    // string ids (aggregate does not cast) give the same result
    expect((await inAppNotificationRepository.getSummary(String(me))).total).toBe(expected.total);
  });

  test('keyset paging over every filter returns the full ordered set with no gaps or duplicates', async () => {
    const me = oid();
    await seedNotifications(me);
    for (const filters of [{}, { isRead: false }, { category: 'FINANCE' }, { category: 'TASK', isRead: true }, { search: 'invoice' }]) {
      const expected = await InAppNotification.find({ userId: me, isDismissed: false, ...(filters.category && { category: filters.category }), ...(typeof filters.isRead === 'boolean' && { isRead: filters.isRead }), ...(filters.search && { $or: [{ title: /invoice/i }, { body: /invoice/i }] }) }).sort({ sentAt: -1, _id: -1 }).lean();
      const seen = [];
      let cursor;
      do {
        const page = await inAppNotificationRepository.findByUserId(me, { ...filters, cursor, limit: 7 });
        seen.push(...page.data.map((doc) => String(doc._id)));
        cursor = page.pagination.nextCursor;
      } while (cursor);
      expect(seen).toEqual(expected.map((doc) => String(doc._id)));
    }
  });

  test('a malformed cursor is a 400 validation error, not a 500', async () => {
    await expect(inAppNotificationRepository.findByUserId(oid(), { cursor: 'not-a-cursor' })).rejects.toMatchObject({ statusCode: 400 });
    const bad = Buffer.from(JSON.stringify({ _id: 'x', sentAt: 'nope' })).toString('base64url');
    await expect(inAppNotificationRepository.findByUserId(oid(), { cursor: bad })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('unread badge is cached but every write path (feed API, mobile API, adapter create, raw update) invalidates it', async () => {
    const me = oid();
    const other = oid();
    const [a, b] = await InAppNotification.create([{ userId: me, title: 'a', body: 'a' }, { userId: me, title: 'b', body: 'b' }]);
    await InAppNotification.create({ userId: other, title: 'c', body: 'c' });
    expect(await notificationFeedService.getUnreadCount(me)).toBe(2);

    const count = jest.spyOn(inAppNotificationRepository, 'countUnread');
    expect(await notificationFeedService.getUnreadCount(me)).toBe(2);
    expect(count).not.toHaveBeenCalled(); // served from cache

    await notificationFeedService.markRead(String(a._id), me);
    expect(await notificationFeedService.getUnreadCount(me)).toBe(1);

    await InAppNotification.create({ userId: me, title: 'new', body: 'new' }); // in-app adapter path
    expect(await notificationFeedService.getUnreadCount(me)).toBe(2);

    await mobileNotificationService.markRead(String(b._id), me); // mobile API path
    expect(await notificationFeedService.getUnreadCount(me)).toBe(1);

    await InAppNotification.updateMany({ userId: { $in: [me, other] } }, { $set: { isRead: true } }); // no single user → global bump
    expect(await notificationFeedService.getUnreadCount(me)).toBe(0);
    expect(await notificationFeedService.getUnreadCount(other)).toBe(0);
  });

  test('feed page and summary are invalidated by writes; other users keep their cache', async () => {
    const me = oid();
    await seedNotifications(me, 40);
    const before = await notificationFeedService.getFeed(me, { limit: 10 });
    const first = before.data[0];
    await notificationFeedService.dismiss(String(first._id), me);
    const after = await notificationFeedService.getFeed(me, { limit: 10 });
    expect(after.data.map((d) => String(d._id))).not.toContain(String(first._id));
    expect(after.summary.total).toBe(before.summary.total - 1);
    await notificationFeedService.markAllRead(me);
    expect((await notificationFeedService.getFeed(me, { limit: 10 })).summary.unread).toBe(0);
  });

  test('migration 058 is idempotent and the feed queries avoid in-memory sorts', async () => {
    await InAppNotification.collection.dropIndexes();
    await InAppNotification.collection.createIndex({ userId: 1, isDismissed: 1, sentAt: -1 }); // pre-058 production indexes
    await InAppNotification.collection.createIndex({ userId: 1, isDismissed: 1, category: 1, sentAt: -1 });
    await migration058.up();
    await migration058.up();
    const names = (await InAppNotification.collection.indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['feed_cursor', 'feed_read_cursor', 'feed_category_cursor', 'feed_summary_pending']));
    expect(names).not.toContain('userId_1_isDismissed_1_sentAt_-1'); // strict prefixes retired
    expect(names).not.toContain('userId_1_isDismissed_1_category_1_sentAt_-1');
    const me = oid();
    await seedNotifications(me, 60);
    const plan = JSON.stringify((await InAppNotification.find({ userId: me, isDismissed: false }).sort({ sentAt: -1, _id: -1 }).limit(10).explain('queryPlanner')).queryPlanner.winningPlan);
    expect(plan).not.toContain('"SORT"');
    await migration058.down();
    const restored = (await InAppNotification.collection.indexes()).map((i) => i.name);
    expect(restored).not.toContain('feed_cursor');
    expect(restored).toContain('userId_1_isDismissed_1_sentAt_-1');
    await InAppNotification.syncIndexes();
  });
});

describe('chat read paths', () => {
  async function users() {
    const admin = await Role.create({ name: 'Admin', permissions: [] });
    const chatRead = await Permission.create({ module: 'chat', action: 'read' });
    const limited = await Role.create({ name: 'Chat only', permissions: [chatRead._id] });
    const make = async (email, role) => { const u = await User.create({ email, firstName: email, lastName: 'T', passwordHash: 'h', role: role._id, status: 'active' }); return User.findById(u._id).populate('role', 'name').lean(); };
    return { me: await make('me@x.io', admin), peer: await make('peer@x.io', admin), restricted: await make('r@x.io', limited) };
  }

  async function referenceUnread(roomIds, userId) {
    const uid = new mongoose.Types.ObjectId(String(userId));
    const rows = await ChatMessage.aggregate([{ $match: { roomId: { $in: roomIds }, senderId: { $ne: uid }, 'readBy.userId': { $ne: uid }, isDeleted: false } }, { $group: { _id: '$roomId', count: { $sum: 1 } } }]);
    return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
  }

  test('read horizon keeps unread counts identical, bounds mark-read, and does not reorder rooms', async () => {
    const { me, peer } = await users();
    const rooms = await ChatRoom.create([1, 2, 3].map((i) => ({ roomType: 'GROUP', name: `R${i}`, members: [{ userId: me._id }, { userId: peer._id }], admins: [me._id] })));
    const old = Date.now() - 3_600_000;
    await ChatMessage.collection.insertMany(rooms.flatMap((room) => Array.from({ length: 30 }, (_, i) => ({ roomId: room._id, senderId: i % 4 === 0 ? me._id : peer._id, senderName: 'x', messageType: 'TEXT', content: `m${i}`, sentAt: new Date(old + i * 1000), isDeleted: i === 7, readBy: [] }))));

    await chatMessageService.markRoomRead(String(rooms[0]._id), me);
    const stored = await ChatRoom.findById(rooms[0]._id).lean();
    const member = stored.members.find((m) => String(m.userId) === String(me._id));
    expect(member.lastReadAt).toBeInstanceOf(Date);
    expect(stored.updatedAt.getTime()).toBe(rooms[0].updatedAt.getTime()); // timestamps untouched
    expect(stored.members.find((m) => String(m.userId) === String(peer._id)).lastReadAt).toBeUndefined();

    // new messages after the horizon (and one stamped inside the safety margin) are counted
    await chatMessageService.sendMessage(String(rooms[0]._id), { content: 'fresh' }, peer);
    await ChatMessage.collection.insertOne({ roomId: rooms[0]._id, senderId: peer._id, senderName: 'x', messageType: 'TEXT', content: 'late insert', sentAt: new Date(Date.now() - 60_000), isDeleted: false, readBy: [] });

    const listed = await chatRoomService.listRoomsForUser(me);
    const expected = await referenceUnread(rooms.map((r) => r._id), me._id);
    for (const room of listed) expect(room.unreadCount).toBe(expected[String(room._id)] || 0);
    expect(listed.find((r) => String(r._id) === String(rooms[0]._id)).unreadCount).toBe(2);

    await chatMessageService.markRoomRead(String(rooms[0]._id), me);
    expect((await referenceUnread([rooms[0]._id], me._id))[String(rooms[0]._id)]).toBeUndefined();
    // the horizon never moves backwards
    const again = (await ChatRoom.findById(rooms[0]._id).lean()).members.find((m) => String(m.userId) === String(me._id)).lastReadAt;
    expect(again.getTime()).toBeGreaterThanOrEqual(member.lastReadAt.getTime());
  });

  test('search uses the same room visibility as the room list without loading it', async () => {
    const { me, restricted } = await users();
    const [liveLead, deadLead] = await Lead.create([{ name: 'Live', leadNumber: 'L-1', type: 'business', source: 'manual', createdBy: me._id }, { name: 'Gone', leadNumber: 'L-2', type: 'business', source: 'manual', createdBy: me._id }]);
    await Lead.updateOne({ _id: deadLead._id }, { isDeleted: true });
    const members = [{ userId: me._id }, { userId: restricted._id }];
    const rooms = await ChatRoom.create([
      { roomType: 'GROUP', name: 'plain', members },
      { roomType: 'GROUP', name: 'live lead', members, leadIds: [liveLead._id] },
      { roomType: 'GROUP', name: 'dead lead', members, leadIds: [deadLead._id] },
      { roomType: 'LEAD', name: 'lead room', members, leadIds: [deadLead._id] },
      { roomType: 'GROUP', name: 'inactive', members, isActive: false },
    ]);
    await ChatMessage.create(rooms.map((room) => ({ roomId: room._id, senderId: me._id, senderName: 'me', content: `needle in ${room.name}` })));
    for (const user of [me, restricted]) {
      const listed = (await chatRoomService.listRoomsForUser(user)).map((r) => String(r._id)).sort();
      expect((await chatRoomService.listAccessibleRoomIds(user)).map(String).sort()).toEqual(listed);
    }
    const spy = jest.spyOn(chatRoomService, 'listRoomsForUser');
    const hits = await chatMessageService.searchMessages(restricted, { q: 'needle' });
    expect(spy).not.toHaveBeenCalled();
    expect(hits.map((m) => m.content).sort()).toEqual(['needle in dead lead', 'needle in plain']);
  });

  test('team/department assignment targets resolve in one batched user query', async () => {
    const Project = (await import('../../src/modules/pm/project.model.js')).default;
    const Assignment = (await import('../../src/modules/deploy/assignment.model.js')).default;
    const { me } = await users();
    const role = await Role.findOne({ name: 'Admin' });
    const dept = await User.create({ email: 'd@x.io', firstName: 'd', lastName: 'd', passwordHash: 'h', role: role._id, status: 'active', department: 'Plumbing' });
    const pref = oid();
    const prefUser = await User.create({ email: 'p@x.io', firstName: 'p', lastName: 'p', passwordHash: 'h', role: role._id, status: 'active', preferences: { preferredDepartmentId: pref } });
    const projectId = oid();
    await Project.collection.insertOne({ _id: projectId, projectNumber: 'P-1', name: 'P', createdBy: me._id, isDeleted: false });
    await Assignment.collection.insertMany([
      { projectId, assignmentNumber: 'A-1', assignmentTargetType: 'TEAM', assignmentTargetId: 'Plumbing', status: 'PLANNED', isDeleted: false },
      { projectId, assignmentNumber: 'A-2', assignmentTargetType: 'DEPARTMENT', assignmentTargetId: String(pref), status: 'PLANNED', isDeleted: false },
    ]);
    const find = jest.spyOn(User, 'find');
    const ids = await chatAccessService.resolveProjectParticipantIds(projectId);
    expect(ids).toEqual(expect.arrayContaining([String(me._id), String(dept._id), String(prefUser._id)]));
    expect(find).toHaveBeenCalledTimes(1); // assignments batched (project has no teamId)
  });

  test('removing a reaction never adds one, and room/edit errors carry proper HTTP statuses', async () => {
    const { me, peer } = await users();
    const room = await chatRoomService.createGroupRoom('G', me, [String(peer._id)]);
    const msg = await chatMessageService.sendMessage(String(room._id), { content: 'hi' }, me);
    const remove = (emoji) => chatMessageService.addReaction(String(msg._id), String(room._id), emoji, peer, '', { mode: 'remove' });
    expect(await remove('👍')).toHaveLength(0);
    await chatMessageService.addReaction(String(msg._id), String(room._id), '👍', peer, 'Peer');
    expect(await remove('👍')).toHaveLength(0);
    expect((await ChatMessage.findById(msg._id).lean()).reactions).toHaveLength(0);

    await expect(chatRoomService.joinByCode('0000', peer)).rejects.toMatchObject({ statusCode: 404 });
    await ChatRoom.updateOne({ _id: room._id }, { joinCodeExpiresAt: new Date(Date.now() - 1000) });
    await expect(chatRoomService.joinByCode(room.joinCode, peer)).rejects.toMatchObject({ statusCode: 410 });
    await expect(chatRoomService.refreshJoinCode(String(room._id), String(peer._id))).rejects.toMatchObject({ statusCode: 403 });
    await expect(chatRoomService.leaveRoom(String(oid()), String(me._id))).rejects.toMatchObject({ statusCode: 404 });

    const audio = await ChatMessage.create({ roomId: room._id, senderId: me._id, senderName: 'me', messageType: 'AUDIO', attachmentUrl: 'https://x.test/a' });
    await expect(chatMessageService.editMessage(String(audio._id), 'text', me)).rejects.toMatchObject({ statusCode: 400 });
  });
});
