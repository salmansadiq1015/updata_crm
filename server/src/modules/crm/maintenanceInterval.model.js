import mongoose from 'mongoose';

const maintenanceIntervalSchema = new mongoose.Schema(
  {
    installationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Installation',
      required: true,
    },
    maintenanceType: {
      type: String,
      enum: ['annual_service', 'filter_change', 'chimney_sweep', 'general_inspection', 'other'],
      required: true,
    },
    customTypeLabel: { type: String, trim: true, maxlength: 100, default: null },
    frequencyMonths: {
      type: Number,
      required: true,
      min: 1,
      max: 120,
    },
    lastServiceDate: { type: Date, default: null },
    nextDueDate: { type: Date, default: null },
    maintenanceStatus: {
      type: String,
      enum: ['ok', 'due', 'overdue', 'scheduled'],
      default: 'ok',
    },
    linkedServiceOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    notes: { type: String, maxlength: 2000, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
maintenanceIntervalSchema.index({ installationId: 1 });
maintenanceIntervalSchema.index(
  { nextDueDate: 1, maintenanceStatus: 1 },
  { partialFilterExpression: { maintenanceStatus: { $in: ['ok', 'due', 'overdue'] } } },
);
maintenanceIntervalSchema.index({ maintenanceStatus: 1 });

// --- Pre-save hook: auto-calculate nextDueDate ---
maintenanceIntervalSchema.pre('save', function () {
  if (
    this.lastServiceDate &&
    this.frequencyMonths &&
    (this.isModified('lastServiceDate') || this.isModified('frequencyMonths'))
  ) {
    const next = new Date(this.lastServiceDate);
    next.setMonth(next.getMonth() + this.frequencyMonths);
    this.nextDueDate = next;
  }
});

const MaintenanceInterval = mongoose.model('MaintenanceInterval', maintenanceIntervalSchema);
export default MaintenanceInterval;
