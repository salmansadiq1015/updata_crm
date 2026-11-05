import mongoose from 'mongoose';
import User from '../auth/user.model.js';
import chatRoomService from './chatRoom.service.js';
import { loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';
import { AuthorizationError } from '../../shared/errors/AppError.js';

export async function authorizeChatSocket(userId, roomId) {
  if (!mongoose.isValidObjectId(roomId)) throw new AuthorizationError('Invalid conversation');
  const user = await User.findOne({ _id: userId, isDeleted: false, status: 'active' }).populate('role', 'name').lean();
  if (!user) throw new AuthorizationError('Chat access denied');
  if (user.role?.name !== 'Admin' && !satisfiesPermission(await loadUserPermissions(user), 'chat:read')) throw new AuthorizationError('Chat access denied');
  await chatRoomService.assertMembership(roomId, user);
  return user;
}
