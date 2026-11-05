import ChatRoom from './chatRoom.model.js';
import '../crm/customer.model.js';
import '../crm/lead.model.js';

const chatRoomRepository = {
  async findOrCreateTaskRoom(taskId, createdByUserId, memberIds = [], name = null) {
    const members = [...new Set([String(createdByUserId), ...memberIds.map(String)])];
    return ChatRoom.findOneAndUpdate(
      { roomType: 'TASK', taskId },
      {
        $setOnInsert: {
          roomType: 'TASK',
          taskId,
          name,
          createdBy: createdByUserId,
          members: members.map((userId) => ({ userId })),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
  },

  async findOrCreateProjectRoom(projectId, createdByUserId, memberIds = []) {
    const members = [...new Set([String(createdByUserId), ...memberIds.map(String)])];
    return ChatRoom.findOneAndUpdate(
      { roomType: 'PROJECT', projectId },
      {
        $setOnInsert: {
          roomType: 'PROJECT',
          projectId,
          createdBy: createdByUserId,
          members: members.map((userId) => ({ userId })),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
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
      .populate('members.userId', 'firstName lastName email avatarUrl role')
      .populate('projectId', 'projectNumber name customerName customerId status projectType')
      .populate('orderId', 'orderNumber title customerName customerId projectId status')
      .populate('customerId', 'customerNumber name city type')
      .populate({ path: 'leadIds', select: 'name leadNumber status type', match: { isDeleted: { $ne: true } } })
      .sort({ lastMessageAt: -1, updatedAt: -1, _id: -1 })
      .lean();
  },

  async findById(roomId) {
    return ChatRoom.findById(roomId)
      .populate('members.userId', 'firstName lastName email avatarUrl role')
      .populate('projectId', 'projectNumber name customerName customerId status projectType')
      .populate('orderId', 'orderNumber title customerName customerId projectId status')
      .populate('customerId', 'customerNumber name city type')
      .populate({ path: 'leadIds', select: 'name leadNumber status type', match: { isDeleted: { $ne: true } } })
      .lean();
  },

  async updateLastMessage(roomId, { messageId, text, sentAt }) {
    return ChatRoom.findByIdAndUpdate(roomId, {
      $set: { lastMessageId: messageId, lastMessageText: text, lastMessageAt: sentAt },
    });
  },

  async addMember(roomId, userId) {
    return ChatRoom.updateOne(
      { _id: roomId, 'members.userId': { $ne: userId } },
      { $push: { members: { userId } } },
    );
  },

  async addMembers(roomId, userIds = []) {
    for (const userId of [...new Set(userIds.map(String))]) {
      await this.addMember(roomId, userId);
    }
    return this.findById(roomId);
  },

  async addBlock(roomId, userId) {
    return ChatRoom.findByIdAndUpdate(roomId, { $addToSet: { blockedBy: userId } });
  },

  async removeBlock(roomId, userId) {
    return ChatRoom.findByIdAndUpdate(roomId, { $pull: { blockedBy: userId } });
  },

  async findByJoinCode(joinCode) {
    return ChatRoom.findOne({ joinCode, isActive: true })
      .populate('members.userId', 'firstName lastName email avatarUrl role')
      .populate('projectId', 'projectNumber name customerName customerId status projectType')
      .populate('orderId', 'orderNumber title customerName customerId projectId status')
      .populate('customerId', 'customerNumber name city type')
      .populate({ path: 'leadIds', select: 'name leadNumber status type', match: { isDeleted: { $ne: true } } })
      .lean();
  },

  async removeMember(roomId, userId) {
    return ChatRoom.findByIdAndUpdate(roomId, {
      $pull: { members: { userId } },
    });
  },
};

export default chatRoomRepository;
