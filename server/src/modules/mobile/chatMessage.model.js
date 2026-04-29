import mongoose from 'mongoose';

export const MESSAGE_TYPES = ['TEXT', 'PHOTO', 'DOCUMENT', 'AUDIO', 'VIDEO', 'VIEW_ONCE'];

const chatMessageSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderName: {
      type: String,
      maxlength: 255,
      required: true,
    },
    messageType: {
      type: String,
      enum: MESSAGE_TYPES,
      default: 'TEXT',
    },
    content: {
      type: String,
      maxlength: 5000,
      default: '',
    },
    attachmentUrl: { type: String, default: null },
    attachmentFileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      default: null,
    },
    mentions: [{ type: mongoose.Schema.Types.ObjectId }],
    sentAt: { type: Date, required: true, default: Date.now },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    roomId:            { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', default: null },
    replyToId:         { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
    replyToSnippet:    { type: String, maxlength: 200, default: null },
    replyToSenderName: { type: String, maxlength: 100, default: null },
    reactions:         [{ emoji: { type: String }, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, userName: { type: String }, createdAt: { type: Date, default: Date.now } }],
    readBy:            [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, readAt: { type: Date, default: Date.now } }],
    isViewOnce:        { type: Boolean, default: false },
    viewedBy:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    editedAt:          { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
chatMessageSchema.index({ projectId: 1, sentAt: -1 });
chatMessageSchema.index({ senderId: 1 });
chatMessageSchema.index({ isDeleted: 1 });
chatMessageSchema.index({ roomId: 1, sentAt: -1 });

// --- Soft-delete pre-hook ---
chatMessageSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
export default ChatMessage;
