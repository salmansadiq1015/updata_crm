import { createHash } from 'node:crypto';
import ChatRoom from './chatRoom.model.js';
import chatRoomRepository from './chatRoom.repository.js';
import chatAccessService from './chatAccess.service.js';
import { AuthorizationError, ConflictError, ValidationError } from '../../shared/errors/AppError.js';

const idOf = value => String(value?._id ?? value);
export const leadChatKey = (createdBy, leadIds, memberIds) => createHash('sha256').update(JSON.stringify([
  idOf(createdBy), [...new Set(leadIds.map(idOf))].sort(), [...new Set(memberIds.map(idOf))].sort(),
])).digest('hex');

export async function createLeadChat(input, user) {
  const leadIds = await chatAccessService.assertLeadAccess(input.leadIds, user);
  const members = await chatAccessService.assertLeadMembersAllowed([...new Set([idOf(user), ...(input.memberIds || []).map(idOf)])]);
  const key = leadChatKey(user, leadIds, members);
  let room;
  try {
    room = await ChatRoom.findOneAndUpdate({ leadChatKey: key }, { $setOnInsert: {
      roomType: 'LEAD', leadIds, leadChatKey: key, name: input.name.trim(), description: input.description || '',
      createdBy: idOf(user), admins: [idOf(user)], members: members.map(userId => ({ userId })),
    } }, { upsert: true, returnDocument: 'after', runValidators: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    room = await ChatRoom.findOne({ leadChatKey: key });
  }
  if (!room?.isActive) throw new ConflictError('This lead conversation is closed');
  return chatRoomRepository.findById(room._id);
}

export async function updateChatLeads(roomId, input, user, room) {
  const actor = idOf(user);
  if (idOf(room.createdBy) !== actor && !(room.admins || []).some(id => idOf(id) === actor)) throw new AuthorizationError('Only conversation admins can change linked leads');
  if (room.roomType === 'LEAD' && input.leadIds.length === 0) throw new ValidationError('A lead conversation must contain at least one lead');
  const leadIds = await chatAccessService.assertLeadAccess(input.leadIds, user);
  if (leadIds.length > 0) await chatAccessService.assertLeadMembersAllowed(room.members.map(member => idOf(member.userId)));
  const patch = { leadIds };
  if (room.roomType === 'LEAD') {
    patch.leadChatKey = leadChatKey(room.createdBy, leadIds, room.members.map(member => idOf(member.userId)));
    if (input.name !== undefined) patch.name = input.name;
  }
  let updated;
  try {
    updated = await ChatRoom.findOneAndUpdate({ _id: roomId, __v: input.version }, { $set: patch, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true });
  } catch (error) {
    if (error.code === 11000) throw new ConflictError('A conversation already exists for these leads and participants');
    throw error;
  }
  if (!updated) throw new ConflictError('The conversation changed. Reload before saving');
  (room.members || []).forEach(member => global.io?.to(`user:${idOf(member.userId)}`).emit('chat:room_updated', { roomId }));
  return chatRoomRepository.findById(roomId);
}
