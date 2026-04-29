import mongoose from 'mongoose';
const { Schema } = mongoose;

const chatRoomSchema = new Schema({
  roomType:        { type: String, enum: ['PROJECT', 'DM', 'GROUP'], required: true },
  projectId:       { type: Schema.Types.ObjectId, ref: 'Project', default: null },
  members:         [{ userId: { type: Schema.Types.ObjectId, ref: 'User' }, joinedAt: { type: Date, default: Date.now } }],
  createdBy:       { type: Schema.Types.ObjectId, ref: 'User' },
  lastMessageId:   { type: Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
  lastMessageAt:   { type: Date, default: null },
  lastMessageText: { type: String, maxlength: 200, default: null },
  blockedBy:       [{ type: Schema.Types.ObjectId, ref: 'User' }],
  isActive:        { type: Boolean, default: true },
  name:              { type: String, maxlength: 100, default: null },
  description:       { type: String, maxlength: 500, default: null },
  joinCode:          { type: String, maxlength: 4, default: null },
  joinCodeExpiresAt: { type: Date, default: null },
  admins:            [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

chatRoomSchema.index({ roomType: 1, projectId: 1 });
chatRoomSchema.index({ 'members.userId': 1, lastMessageAt: -1 });
chatRoomSchema.index({ joinCode: 1 }, { sparse: true });

export default mongoose.model('ChatRoom', chatRoomSchema);
