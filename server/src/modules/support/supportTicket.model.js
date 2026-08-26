import mongoose from 'mongoose';

export const SUPPORT_TICKET_TYPES = ['bug', 'feature_request', 'feedback', 'other'];
export const SUPPORT_TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
export const SUPPORT_TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const SUPPORT_ORIGIN_PLATFORMS = ['web', 'ios', 'android', 'unknown'];

const { Schema } = mongoose;

const originSchema = new Schema(
  {
    platform: { type: String, enum: SUPPORT_ORIGIN_PLATFORMS, default: 'unknown' },
    url: { type: String, trim: true, maxlength: 2000, default: null },
    viewport: { type: String, trim: true, maxlength: 20, default: null },
    route: { type: String, trim: true, maxlength: 500, default: null, index: true },
  },
  { _id: false },
);

const supportAttachmentSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'FileMetadata', default: null },
    url: { type: String, trim: true, maxlength: 1000, default: null },
    originalName: { type: String, trim: true, maxlength: 255, default: null },
    mimeType: { type: String, trim: true, maxlength: 120, default: null },
    sizeBytes: { type: Number, min: 0, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const supportTicketSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
    type: { type: String, enum: SUPPORT_TICKET_TYPES, default: 'bug' },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    priority: { type: String, enum: SUPPORT_TICKET_PRIORITIES, default: 'normal', index: true },
    status: { type: String, enum: SUPPORT_TICKET_STATUSES, default: 'open', index: true },

    origin: { type: originSchema, default: () => ({}) },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    attachments: [supportAttachmentSchema],

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

supportTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
supportTicketSchema.index({ submittedBy: 1, createdAt: -1 });
supportTicketSchema.index({ 'origin.route': 1, createdAt: -1 });
supportTicketSchema.index({ subject: 'text', description: 'text', ticketNumber: 'text' });

supportTicketSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
export default SupportTicket;
