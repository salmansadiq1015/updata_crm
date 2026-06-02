import mongoose from 'mongoose';

// --- Enum constants ---
const ENTRY_TYPES = ['PHASE', 'MILESTONE'];
const RESPONSIBLE_TYPES = ['INTERNAL_TEAM', 'PARTNER_COMPANY'];
const ENTRY_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'WAIVED'];

const scheduleEntrySchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    entryType: {
      type: String,
      enum: ENTRY_TYPES,
      required: true,
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    milestoneDate: { type: Date, default: null },
    responsibleType: {
      type: String,
      enum: RESPONSIBLE_TYPES,
      default: null,
    },
    // No dedicated Team entity exists; internal responsibility points at a User.
    responsibleTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    partnerCompanyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    predecessorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScheduleEntry',
      default: null,
    },
    status: {
      type: String,
      enum: ENTRY_STATUSES,
      default: 'PLANNED',
    },
    notes: { type: String, maxlength: 5000, default: null },
    sortOrder: { type: Number, default: 0 },
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
  },
);

// --- Indexes ---
scheduleEntrySchema.index({ projectId: 1, sortOrder: 1 });
scheduleEntrySchema.index({ status: 1 });
scheduleEntrySchema.index({ predecessorId: 1 });
scheduleEntrySchema.index({ isDeleted: 1 });

// --- Soft-delete pre-hook ---
scheduleEntrySchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const ScheduleEntry = mongoose.model('ScheduleEntry', scheduleEntrySchema);
export default ScheduleEntry;
export { ENTRY_TYPES, RESPONSIBLE_TYPES, ENTRY_STATUSES };
