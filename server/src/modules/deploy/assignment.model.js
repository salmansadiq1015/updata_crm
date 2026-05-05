import mongoose from 'mongoose';

export const ASSIGNMENT_TYPES = ['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER'];
export const ASSIGNMENT_STATUSES = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];

const assignmentSchema = new mongoose.Schema(
  {
    assignmentNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    assignmentType: {
      type: String,
      enum: ASSIGNMENT_TYPES,
      required: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null,
    },
    startDatetime: {
      type: Date,
      required: true,
    },
    endDatetime: {
      type: Date,
      required: true,
    },
    isFullDay: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ASSIGNMENT_STATUSES,
      default: 'PLANNED',
      index: true,
    },
    priority: {
      type: String,
      enum: PRIORITIES,
      default: 'NORMAL',
    },
    instructions: {
      type: String,
      maxlength: 5000,
      default: null,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    recurrenceGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    colorCode: {
      type: String,
      maxlength: 7,
      default: null,
    },
    isCustomerAppointment: {
      type: Boolean,
      default: false,
    },
    version: {
      type: Number,
      default: 1,
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
assignmentSchema.index({ employeeId: 1, startDatetime: 1 }, { sparse: true });
assignmentSchema.index({ orderId: 1 });
assignmentSchema.index({ projectId: 1 });
assignmentSchema.index({ startDatetime: 1 });
assignmentSchema.index({ recurrenceGroupId: 1 });
assignmentSchema.index({ isDeleted: 1, status: 1 });
assignmentSchema.index({ createdAt: -1 });

// --- Soft-delete pre-hook ---
assignmentSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Assignment = mongoose.model('Assignment', assignmentSchema);
export default Assignment;
