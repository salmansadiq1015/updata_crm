import mongoose from 'mongoose';
const { Schema } = mongoose;

const chatRoomSchema = new Schema({
  roomType:        { type: String, enum: ['PROJECT', 'DM'], required: true },
  projectId:       { type: Schema.Types.ObjectId, ref: 'Project', default: null },
  members:         [{ userId: { type: Schema.Types.ObjectId, ref: 'User' }, joinedAt: { type: Date, default: Date.now } }],
  createdBy:       { type: Schema.Types.ObjectId, ref: 'User' },
  lastMessageId:   { type: Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
  lastMessageAt:   { type: Date, default: null },
  lastMessageText: { type: String, maxlength: 200, default: null },
  blockedBy:       [{ type: Schema.Types.ObjectId, ref: 'User' }],
  isActive:        { type: Boolean, default: true },
}, { timestamps: true });

chatRoomSchema.index({ roomType: 1, projectId: 1 });
chatRoomSchema.index({ 'members.userId': 1, lastMessageAt: -1 });

export default mongoose.model('ChatRoom', chatRoomSchema);
