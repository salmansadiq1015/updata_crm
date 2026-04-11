import mongoose from 'mongoose';

export const CONFLICT_TYPES = ['DOUBLE_BOOKING', 'ABSENCE', 'WORKING_HOURS', 'TRAVEL_TIME'];
export const SEVERITIES = ['HARD', 'SOFT'];

const conflictRecordSchema = new mongoose.Schema(
  {
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: true,
    },
    conflictingWithId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    conflictType: {
      type: String,
      enum: CONFLICT_TYPES,
      required: true,
    },
    severity: {
      type: String,
      enum: SEVERITIES,
      required: true,
    },
    description: {
      type: String,
      maxlength: 500,
      required: true,
    },
    resolved: {
      type: Boolean,
      default: false,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    overrideReason: {
      type: String,
      maxlength: 2000,
      default: null,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
conflictRecordSchema.index({ assignmentId: 1 });
conflictRecordSchema.index({ resolved: 1 });
conflictRecordSchema.index({ severity: 1 });
conflictRecordSchema.index({ resolved: 1, severity: 1 });

const ConflictRecord = mongoose.model('ConflictRecord', conflictRecordSchema);
export default ConflictRecord;
