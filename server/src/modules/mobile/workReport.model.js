import mongoose from 'mongoose';
import voiceMetadataSchema from '../../shared/schemas/voiceMetadata.schema.js';
import catalogSnapshotSchema from '../../shared/schemas/catalogSnapshot.schema.js';

export const REPORT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INVOICED'];
export const REPORT_GENERATION_SOURCES = ['MANUAL', 'VOICE', 'TIME_TRACKING', 'TASKS', 'SYNC'];
export const ACCOUNTING_TRANSFER_STATUSES = ['NOT_REQUIRED', 'PENDING', 'TRANSFERRED', 'FAILED'];

const materialItemSchema = new mongoose.Schema({
  catalogSource: { type: String, enum: ['IGH', 'INTERNAL', 'CUSTOM'], required: true },
  catalogItemId: { type: String, maxlength: 50, default: null },
  catalogSnapshot: { type: catalogSnapshotSchema, default: null },
  description: { type: String, maxlength: 300, required: true },
  quantity: { type: Number, min: 0, required: true },
  unit: { type: String, maxlength: 20, required: true },
  sortOrder: { type: Number, default: 0 },
}, { _id: false });

const workReportSchema = new mongoose.Schema(
  {
    reportNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    reportDate: {
      type: Date,
      required: true,
    },
    arrivalTime: { type: Date, default: null },
    departureTime: { type: Date, default: null },
    workPerformed: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    findings: { type: String, maxlength: 5000, default: null },
    nextSteps: { type: String, maxlength: 5000, default: null },
    followUpNeeded: { type: Boolean, default: false },
    technicianNotes: { type: String, maxlength: 5000, default: null },
    customerSignature: { type: String, default: null },
    customerSignerName: { type: String, maxlength: 255, default: null },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    submittedAt: { type: Date, default: null },
    editableUntil: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    invoicedAt: { type: Date, default: null },
    invoicedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    invoiceReference: { type: String, trim: true, maxlength: 100, default: null },
    accountingTransferStatus: {
      type: String,
      enum: ACCOUNTING_TRANSFER_STATUSES,
      default: 'NOT_REQUIRED',
      index: true,
    },
    accountingTransferError: { type: String, maxlength: 1000, default: null },
    billableMinutes: { type: Number, min: 0, default: 0 },
    nonBillableMinutes: { type: Number, min: 0, default: 0 },
    billableNotes: { type: String, maxlength: 1000, default: null },
    generationSource: {
      type: String,
      enum: REPORT_GENERATION_SOURCES,
      default: 'MANUAL',
      index: true,
    },
    sourceSessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceTimeEntryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TimeEntry' }],
    sourceTaskIds: [{ type: mongoose.Schema.Types.ObjectId, default: null }],
    documentIds: [{ type: mongoose.Schema.Types.ObjectId, default: null }],
    technicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    version: { type: Number, default: 1 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    materialItems: { type: [materialItemSchema], default: [] },
    voiceAttachments: { type: [voiceMetadataSchema], default: [] },
    rejectionNote: { type: String, maxlength: 2000, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
workReportSchema.index({ orderId: 1 });
workReportSchema.index({ projectId: 1, reportDate: -1 });
workReportSchema.index({ technicianId: 1, reportDate: -1 });
workReportSchema.index({ isDeleted: 1, status: 1 });
workReportSchema.index({ invoiceId: 1 }, { sparse: true });
workReportSchema.index({ createdAt: -1 });

// --- Soft-delete pre-hook ---
workReportSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const WorkReport = mongoose.model('WorkReport', workReportSchema);
export default WorkReport;
