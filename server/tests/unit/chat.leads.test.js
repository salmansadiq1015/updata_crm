import { beforeAll, afterAll, afterEach, test, expect, jest } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import User from '../../src/modules/auth/user.model.js';
import Role from '../../src/modules/auth/role.model.js';
import Permission from '../../src/modules/auth/permission.model.js';
import Lead from '../../src/modules/crm/lead.model.js';
import ChatRoom from '../../src/modules/chat/chatRoom.model.js';
import FileMetadata from '../../src/modules/files/file.model.js';
import storageService from '../../src/shared/storage/StorageService.js';
import ChatMessage from '../../src/modules/mobile/chatMessage.model.js';
import { createLeadChat, updateChatLeads } from '../../src/modules/chat/chatLead.service.js';
import chatRoomService from '../../src/modules/chat/chatRoom.service.js';
import chatMessageService from '../../src/modules/chat/chatMessage.service.js';
import { authorizeChatSocket } from '../../src/modules/chat/chatSocketAccess.js';
import { sendMessageSchema, createLeadRoomSchema } from '../../src/modules/chat/chat.validation.js';
import { summarizeConversation } from '../../src/modules/chat/chatSummary.service.js';

beforeAll(async () => { await connectTestDb(); await Promise.all([ChatRoom.init(), ChatMessage.init()]); });
afterEach(async () => { jest.restoreAllMocks(); await clearTestDb(); });
afterAll(disconnectTestDb);
async function fixture() {
  const adminRole = await Role.create({ name: 'Admin', permissions: [] });
  const read = await Permission.create({ module: 'chat', action: 'read' });
  const role = await Role.create({ name: 'Chat only', permissions: [read._id] });
  async function user(email, role) { const result = await User.create({ email, firstName: email, lastName: 'Test', passwordHash: 'hash', role: role._id, status: 'active' }); return User.findById(result._id).populate('role', 'name').lean(); }
  const owner = await user('owner@example.com', adminRole);
  const teammate = await user('team@example.com', adminRole);
  const outsider = await user('outsider@example.com', adminRole);
  const restricted = await user('restricted@example.com', role);
  const leads = await Lead.create(['Northwind', 'Contoso'].map((name, i) => ({ name, leadNumber: `L-${i}`, type: 'business', source: 'manual', createdBy: owner._id })));
  const input = { name: 'Enterprise accounts', leadIds: leads.map(lead => String(lead._id)), memberIds: [String(teammate._id)] };
  return { owner, teammate, outsider, restricted, leads, input };
}

test('one or multiple leads create private conversations and concurrent retries converge', async () => {
  const { owner, input } = await fixture();
  const rooms = await Promise.all(Array.from({ length: 4 }, () => createLeadChat(input, owner)));
  expect(new Set(rooms.map(room => String(room._id))).size).toBe(1);
  expect(rooms[0].leadIds.map(lead => lead.name).sort()).toEqual(['Contoso', 'Northwind']);
  expect(rooms[0].members).toHaveLength(2);
  const single = await createLeadChat({ ...input, leadIds: input.leadIds.slice(0, 1) }, owner);
  expect(single.leadIds).toHaveLength(1);
});

test('lead permission, participant eligibility, deleted leads, and room membership are enforced', async () => {
  const { owner, outsider, restricted, input, leads } = await fixture();
  await expect(createLeadChat(input, restricted)).rejects.toThrow(/Lead access/);
  await expect(createLeadChat({ ...input, memberIds: [String(restricted._id)] }, owner)).rejects.toThrow(/participant/);
  const room = await createLeadChat(input, owner);
  await expect(chatRoomService.assertMembership(room._id, outsider)).rejects.toThrow();
  await expect(authorizeChatSocket(owner._id, room._id)).resolves.toMatchObject({ _id: owner._id });
  await expect(authorizeChatSocket(outsider._id, room._id)).rejects.toThrow();
  await Lead.updateOne({ _id: leads[0]._id }, { isDeleted: true });
  await expect(createLeadChat(input, owner)).rejects.toThrow(/selected leads/);
});

test('only admins update lead associations and stale writes cannot overwrite changes', async () => {
  const { owner, teammate, input } = await fixture();
  const room = await createLeadChat(input, owner);
  const change = { leadIds: input.leadIds.slice(0, 1), version: room.__v, name: 'Northwind account' };
  await expect(updateChatLeads(room._id, change, teammate, room)).rejects.toThrow(/admins/);
  const updated = await updateChatLeads(room._id, change, owner, room);
  expect(updated.name).toBe('Northwind account');
  expect(updated.leadIds).toHaveLength(1);
  await expect(updateChatLeads(room._id, change, owner, room)).rejects.toThrow(/changed/);
});

test('message retries are idempotent, reply targets stay in the room, blank messages are rejected', async () => {
  const { owner, input } = await fixture();
  const room = await createLeadChat(input, owner);
  const payload = { messageType: 'TEXT', content: 'Please review the proposal.', clientMessageId: 'retry-123' };
  const sent = await Promise.all([chatMessageService.sendMessage(room._id, payload, owner), chatMessageService.sendMessage(room._id, payload, owner)]);
  expect(String(sent[0]._id)).toBe(String(sent[1]._id));
  expect(await ChatMessage.countDocuments({ roomId: room._id })).toBe(1);
  await expect(chatMessageService.sendMessage(room._id, { content: '  ' }, owner)).rejects.toThrow(/empty/);
  const other = await createLeadChat({ ...input, leadIds: input.leadIds.slice(0, 1) }, owner);
  await expect(chatMessageService.sendMessage(other._id, { ...payload, replyToId: sent[0]._id, clientMessageId: 'other' }, owner)).rejects.toThrow(/same chat/);
});

test('timestamp ties paginate without skipping messages and closed rooms deny access', async () => {
  const { owner, input } = await fixture();
  const room = await createLeadChat(input, owner);
  const sentAt = new Date('2026-11-05T10:00:00Z');
  const messages = await ChatMessage.create(Array.from({ length: 55 }, (_, i) => ({ roomId: room._id, senderId: owner._id, senderName: 'Owner', messageType: 'TEXT', content: `Message ${i}`, sentAt })));
  const latest = await chatMessageService.listMessages(room._id, owner);
  const older = await chatMessageService.listMessages(room._id, owner, { before: latest[0].sentAt.toISOString(), beforeId: latest[0]._id });
  expect(latest).toHaveLength(50); expect(older).toHaveLength(5);
  expect(new Set([...older, ...latest].map(message => String(message._id))).size).toBe(messages.length);
  await ChatRoom.updateOne({ _id: room._id }, { isActive: false });
  await expect(chatMessageService.listMessages(room._id, owner)).rejects.toThrow();
});

test('summary uses authorized messages and the configured provider without executing actions', async () => {
  const { owner, outsider, input } = await fixture();
  const room = await createLeadChat(input, owner);
  await chatMessageService.sendMessage(room._id, { messageType: 'TEXT', content: 'Send the proposal on Monday.' }, owner);
  const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'Next step: send the proposal on Monday.' } }] });
  const client = { chat: { completions: { create } } };
  const result = await summarizeConversation(room._id, owner, 'en', { client });
  expect(result.messageCount).toBe(1); expect(result.summary).toContain('Monday');
  expect(create.mock.calls[0][0].messages[1].content).toContain('proposal');
  await expect(summarizeConversation(room._id, outsider, 'en', { client })).rejects.toThrow();
  expect(create).toHaveBeenCalledTimes(1);
});

test('API validation preserves delivery keys and rejects invalid lead selections', () => {
  const parsed = sendMessageSchema.body.validate({ messageType: 'TEXT', content: 'Hello', clientMessageId: 'retry-key' }, { stripUnknown: true });
  expect(parsed.error).toBeUndefined(); expect(parsed.value.clientMessageId).toBe('retry-key');
  expect(createLeadRoomSchema.body.validate({ name: 'Account', leadIds: [] }).error).toBeDefined();
});

test('attachments must belong to the sender and history renews expiring URLs', async () => {
  const { owner, teammate, input } = await fixture();
  const room = await createLeadChat(input, owner);
  const file = await FileMetadata.create({ bucket: 'general', key: 'chat/proposal.pdf', originalName: 'Proposal.pdf', mimeType: 'application/pdf', sizeBytes: 100, uploadedBy: owner._id, module: 'chat' });
  const sign = jest.spyOn(storageService, 'getPresignedUrl').mockResolvedValueOnce('https://files.test/first').mockResolvedValueOnce('https://files.test/renewed');
  const payload = { messageType: 'DOCUMENT', attachmentFileId: file._id, attachmentUrl: 'https://untrusted.test/file' };
  await expect(chatMessageService.sendMessage(room._id, payload, teammate)).rejects.toThrow(/own uploaded/);
  const message = await chatMessageService.sendMessage(room._id, payload, owner);
  expect(message.attachmentUrl).toBe('https://files.test/first');
  const history = await chatMessageService.listMessages(room._id, owner);
  expect(history[0].attachmentUrl).toBe('https://files.test/renewed');
  expect(history[0].attachmentFileName).toBe('Proposal.pdf');
  expect(sign).toHaveBeenCalledTimes(2);
});

test('leaving a lead chat revokes membership and a new conversation restores only requested participants', async () => {
  const { owner, teammate, outsider, input } = await fixture();
  const room = await createLeadChat(input, owner);
  await expect(chatRoomService.leaveRoom(room._id, outsider._id)).rejects.toThrow(/not a member/);
  await chatRoomService.leaveRoom(room._id, teammate._id);
  await expect(chatRoomService.assertMembership(room._id, teammate)).rejects.toThrow();
  const replacement = await createLeadChat(input, owner);
  expect(String(replacement._id)).not.toBe(String(room._id));
  expect(replacement.members).toHaveLength(2);
});

test('a conversation with only untranscribed attachments has no text to summarize', async () => {
  const { owner, input } = await fixture();
  const room = await createLeadChat(input, owner);
  await ChatMessage.create({ roomId: room._id, senderId: owner._id, senderName: 'Owner', messageType: 'AUDIO', attachmentUrl: 'https://files.test/audio', content: '' });
  await expect(summarizeConversation(room._id, owner, 'en', { client: {} })).rejects.toThrow(/no text messages/);
});
