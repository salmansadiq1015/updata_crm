import mongoose from 'mongoose';

export const FIELD_TICKET_TYPES = [
  'TECHNICAL_NOTIFICATION',
  'SERVICE_REQUEST',
  'INCIDENT',
  'MAINTENANCE_ISSUE',
];

export const FIELD_TICKET_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const FIELD_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING', 'COMPLETED'];

export const FIELD_TICKET_ACTIVITY_TYPES = [
  'CREATED',
  'UPDATED',
  'STATUS_CHANGED',
  'ASSIGNED',
  'COMMENTED',
  'ATTACHMENT_ADDED',
  'ESCALATED',
  'AI_RECOMMENDED',
  'DELETED',
];

export const FIELD_TICKET_ATTACHMENT_KINDS = ['PHOTO', 'VIDEO', 'DOCUMENT', 'OTHER'];
export const FIELD_TICKET_COMMENT_VISIBILITY = ['INTERNAL', 'STATUS_UPDATE'];

const { Schema } = mongoose;

const fieldTicketAttachmentSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'FileMetadata', default: null },
    url: { type: String, trim: true, maxlength: 1000, default: null },
    originalName: { type: String, trim: true, maxlength: 255, default: null },
    mimeType: { type: String, trim: true, maxlength: 120, default: null },
    sizeBytes: { type: Number, min: 0, default: 0 },
    kind: { type: String, enum: FIELD_TICKET_ATTACHMENT_KINDS, default: 'OTHER' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const fieldTicketCommentSchema = new Schema(
  {
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    visibility: { type: String, enum: FIELD_TICKET_COMMENT_VISIBILITY, default: 'INTERNAL' },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const fieldTicketActivitySchema = new Schema(
  {
    type: { type: String, enum: FIELD_TICKET_ACTIVITY_TYPES, required: true },
    message: { type: String, trim: true, maxlength: 500, default: '' },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
    from: { type: Schema.Types.Mixed, default: null },
    to: { type: Schema.Types.Mixed, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: true },
);

const fieldTicketAiSchema = new Schema(
  {
    category: { type: String, trim: true, maxlength: 100, default: null },
    confidence: { type: Number, min: 0, max: 1, default: null },
    recommendedPriority: { type: String, enum: FIELD_TICKET_PRIORITIES, default: null },
    recommendedAssigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    nextActions: [{ type: String, trim: true, maxlength: 300 }],
    rationale: { type: String, trim: true, maxlength: 1000, default: null },
    lastRunAt: { type: Date, default: null },
  },
  { _id: false },
);

const fieldTicketSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    type: { type: String, enum: FIELD_TICKET_TYPES, default: 'TECHNICAL_NOTIFICATION' },
    priority: { type: String, enum: FIELD_TICKET_PRIORITIES, default: 'MEDIUM', index: true },
    status: { type: String, enum: FIELD_TICKET_STATUSES, default: 'OPEN', index: true },
    dueAt: { type: Date, default: null, index: true },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    teamId: { type: Schema.Types.ObjectId, default: null, index: true },
    teamName: { type: String, trim: true, maxlength: 120, default: null },

    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    customerName: { type: String, trim: true, maxlength: 200, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    projectName: { type: String, trim: true, maxlength: 200, default: null },
    assetId: { type: Schema.Types.ObjectId, ref: 'Installation', default: null, index: true },
    assetName: { type: String, trim: true, maxlength: 200, default: null },
    jobId: { type: Schema.Types.ObjectId, default: null, index: true },
    jobNumber: { type: String, trim: true, maxlength: 80, default: null },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', default: null, index: true },
    installationId: { type: Schema.Types.ObjectId, ref: 'Installation', default: null, index: true },
    maintenanceId: { type: Schema.Types.ObjectId, ref: 'MaintenanceInterval', default: null, index: true },
    sourceNotificationId: { type: Schema.Types.ObjectId, ref: 'Notification', default: null },
    sourceWidgetSubmissionId: { type: Schema.Types.ObjectId, default: null },

    attachments: [fieldTicketAttachmentSchema],
    comments: [fieldTicketCommentSchema],
    activity: [fieldTicketActivitySchema],
    ai: { type: fieldTicketAiSchema, default: () => ({ nextActions: [] }) },

    escalated: { type: Boolean, default: false, index: true },
    escalatedAt: { type: Date, default: null },
    escalationReason: { type: String, trim: true, maxlength: 200, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    completedAt: { type: Date, default: null },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

fieldTicketSchema.index({ status: 1, priority: 1, dueAt: 1 });
fieldTicketSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
fieldTicketSchema.index({ customerId: 1, createdAt: -1 });
fieldTicketSchema.index({ projectId: 1, createdAt: -1 });
fieldTicketSchema.index({ escalated: 1, dueAt: 1 });
fieldTicketSchema.index({
  title: 'text',
  description: 'text',
  ticketNumber: 'text',
  customerName: 'text',
  projectName: 'text',
  assetName: 'text',
  jobNumber: 'text',
});

fieldTicketSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const FieldTicket = mongoose.model('FieldTicket', fieldTicketSchema);
export default FieldTicket;
