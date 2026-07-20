import mongoose from 'mongoose';

export const ASSIGNMENT_TYPES = ['SERVICE_CALL', 'PROJECT_WORK', 'MAINTENANCE', 'INSTALLATION', 'INSPECTION', 'OTHER'];
export const ASSIGNMENT_STATUSES = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'];
export const PRIORITIES = ['NORMAL', 'HIGH', 'URGENT'];
export const ASSIGNMENT_TARGET_TYPES = ['EMPLOYEE', 'TEAM', 'DEPARTMENT'];

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
    assignmentTargetType: {
      type: String,
      enum: ASSIGNMENT_TARGET_TYPES,
      default: 'EMPLOYEE',
      index: true,
    },
    assignmentTargetId: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
      index: true,
    },
    assignmentTargetLabel: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    // Set when this assignment was generated from a PM schedule entry
    // (Bauplan → Einsatzplanung transfer); enables dedup and re-sync from the plan.
    sourceScheduleEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScheduleEntry',
      default: null,
      index: true,
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
    requiredSkills: {
      type: [String],
      default: [],
      set: (values) => Array.isArray(values) ? values.map((v) => String(v).trim()).filter(Boolean) : [],
    },
    recommendedSkills: {
      type: [String],
      default: [],
      set: (values) => Array.isArray(values) ? values.map((v) => String(v).trim()).filter(Boolean) : [],
    },
    requiredCertifications: {
      type: [String],
      default: [],
      set: (values) => Array.isArray(values) ? values.map((v) => String(v).trim()).filter(Boolean) : [],
    },
    recommendedCertifications: {
      type: [String],
      default: [],
      set: (values) => Array.isArray(values) ? values.map((v) => String(v).trim()).filter(Boolean) : [],
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      default: null,
    },
    installationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Installation',
      default: null,
    },
    maintenanceIntervalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MaintenanceInterval',
      default: null,
    },
    recurrenceGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    recurrenceIndex: {
      type: Number,
      default: 0,
      min: 0,
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
assignmentSchema.index({ assignmentTargetType: 1, assignmentTargetId: 1, startDatetime: 1 });
assignmentSchema.index({ orderId: 1 });
assignmentSchema.index({ projectId: 1 });
assignmentSchema.index({ installationId: 1, startDatetime: 1 }, { sparse: true });
assignmentSchema.index({ maintenanceIntervalId: 1 }, { sparse: true });
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
