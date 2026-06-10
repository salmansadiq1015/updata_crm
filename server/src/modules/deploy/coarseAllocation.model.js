import mongoose from 'mongoose';

const coarseAllocationSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    calendarYear: {
      type: Number,
      required: true,
    },
    calendarWeek: {
      type: Number,
      required: true,
      min: 1,
      max: 53,
    },
    allocationPercent: {
      type: Number,
      required: true,
      enum: [25, 50, 75, 100],
    },
    notes: {
      type: String,
      maxlength: 2000,
      default: null,
    },
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
coarseAllocationSchema.index({ employeeId: 1, calendarYear: 1, calendarWeek: 1 });
coarseAllocationSchema.index({ projectId: 1, calendarYear: 1, calendarWeek: 1 });
coarseAllocationSchema.index(
  { employeeId: 1, projectId: 1, calendarYear: 1, calendarWeek: 1 },
  { unique: true },
);

const CoarseAllocation = mongoose.model('CoarseAllocation', coarseAllocationSchema);
export default CoarseAllocation;
