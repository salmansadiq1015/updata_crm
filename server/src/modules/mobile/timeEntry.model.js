import mongoose from 'mongoose';

export const ACTIVITY_TYPES = ['TRAVEL', 'ONSITE_WORK', 'ADMINISTRATIVE', 'OTHER'];
export const RELEASE_STATUSES = ['PENDING', 'RELEASED', 'LOCKED'];

const timeEntrySchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
    },
    technicianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: { type: Date, default: null },
    breakDurationMin: { type: Number, default: 0, min: 0 },
    netDurationMin: { type: Number, default: null },
    activityType: {
      type: String,
      enum: ACTIVITY_TYPES,
      required: true,
    },
    note: { type: String, maxlength: 500, default: null },
    isTimerActive: { type: Boolean, default: false },
    releaseStatus: {
      type: String,
      enum: RELEASE_STATUSES,
      default: 'PENDING',
    },
    overrideJustification: {
      type: String,
      maxlength: 1000,
      default: null,
    },
    overriddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    overriddenAt: { type: Date, default: null },
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
timeEntrySchema.index({ orderId: 1, technicianId: 1 });
timeEntrySchema.index({ technicianId: 1, date: 1 });
timeEntrySchema.index({ releaseStatus: 1 });
timeEntrySchema.index({ isDeleted: 1, releaseStatus: 1 });

// --- Soft-delete pre-hook ---
timeEntrySchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema);
export default TimeEntry;
