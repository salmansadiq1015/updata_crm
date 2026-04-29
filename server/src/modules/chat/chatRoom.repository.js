import ChatRoom from './chatRoom.model.js';

const chatRoomRepository = {
  async findOrCreateProjectRoom(projectId, createdByUserId) {
    let room = await ChatRoom.findOne({ roomType: 'PROJECT', projectId });
    if (!room) {
      room = await ChatRoom.create({
        roomType: 'PROJECT',
        projectId,
        createdBy: createdByUserId,
        members: [{ userId: createdByUserId }],
      });
    }
    return room;
  },

  async findOrCreateDmRoom(userIdA, userIdB) {
    const sorted = [String(userIdA), String(userIdB)].sort();
    // Find existing DM room with exactly these two participants
    let room = await ChatRoom.findOne({
      roomType: 'DM',
      'members.userId': { $all: sorted },
      $expr: { $eq: [{ $size: '$members' }, 2] },
    });
    if (!room) {
      room = await ChatRoom.create({
        roomType: 'DM',
        createdBy: userIdA,
        members: [{ userId: userIdA }, { userId: userIdB }],
      });
    }
    return room;
  },

  async findRoomsForUser(userId) {
    return ChatRoom.find({ 'members.userId': userId, isActive: true })
      .sort({ lastMessageAt: -1 })
      .lean();
  },

  async findById(roomId) {
    return ChatRoom.findById(roomId).lean();
  },

  async updateLastMessage(roomId, { messageId, text, sentAt }) {
    return ChatRoom.findByIdAndUpdate(roomId, {
      $set: { lastMessageId: messageId, lastMessageText: text, lastMessageAt: sentAt },
    });
  },

  async addMember(roomId, userId) {
    return ChatRoom.findByIdAndUpdate(roomId, {
      $addToSet: { members: { userId } },
    });
  },

  async addBlock(roomId, userId) {
    return ChatRoom.findByIdAndUpdate(roomId, { $addToSet: { blockedBy: userId } });
  },

  async removeBlock(roomId, userId) {
    return ChatRoom.findByIdAndUpdate(roomId, { $pull: { blockedBy: userId } });
  },
};

export default chatRoomRepository;
