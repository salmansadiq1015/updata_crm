import mongoose from 'mongoose';

export const PROJECT_STATUSES = ['DRAFT', 'PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'];
export const PROJECT_TYPES = ['NEW_INSTALLATION', 'RENOVATION', 'MAINTENANCE', 'SERVICE_CONTRACT', 'OTHER'];

const projectSchema = new mongoose.Schema(
  {
    projectNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    description: { type: String, maxlength: 5000, default: null },
    projectType: {
      type: String,
      enum: PROJECT_TYPES,
      required: true,
    },
    status: {
      type: String,
      enum: PROJECT_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      default: null,
    },
    projectManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    plannedStartDate: { type: Date, default: null },
    plannedEndDate: { type: Date, default: null },
    actualStartDate: { type: Date, default: null },
    actualEndDate: { type: Date, default: null },
    estimatedBudget: { type: Number, default: null, min: 0 },
    currency: { type: String, trim: true, maxlength: 3, default: 'CHF' },
    notes: { type: String, maxlength: 5000, default: null },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
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
projectSchema.index({ customerId: 1 });
projectSchema.index({ projectManagerId: 1 });
projectSchema.index({ plannedStartDate: 1 });
projectSchema.index({ isDeleted: 1, status: 1 });
projectSchema.index({ createdAt: -1 });
projectSchema.index({ projectType: 1 });
projectSchema.index(
  { name: 'text', projectNumber: 'text' },
  { weights: { name: 10, projectNumber: 5 } },
);

// --- Soft-delete pre-hook ---
projectSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Project = mongoose.model('Project', projectSchema);
export default Project;
