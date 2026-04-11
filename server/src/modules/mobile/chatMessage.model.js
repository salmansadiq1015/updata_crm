import mongoose from 'mongoose';

export const MESSAGE_TYPES = ['TEXT', 'PHOTO', 'DOCUMENT'];

const chatMessageSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
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
      required: true,
      maxlength: 5000,
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

// --- Soft-delete pre-hook ---
chatMessageSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
export default ChatMessage;
