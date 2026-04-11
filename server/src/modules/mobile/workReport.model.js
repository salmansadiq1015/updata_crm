import mongoose from 'mongoose';

export const REPORT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];

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
workReportSchema.index({ orderId: 1 });
workReportSchema.index({ technicianId: 1, reportDate: -1 });
workReportSchema.index({ isDeleted: 1, status: 1 });
workReportSchema.index({ createdAt: -1 });

// --- Soft-delete pre-hook ---
workReportSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const WorkReport = mongoose.model('WorkReport', workReportSchema);
export default WorkReport;
