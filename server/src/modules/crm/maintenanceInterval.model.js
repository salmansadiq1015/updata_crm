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
    // Free-text label (CRM-007 AC-1). Usable as the display label for ANY type,
    // not only when maintenanceType === 'other'. Falls back to maintenanceType
    // via the `displayLabel` virtual when not provided.
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
    // Set once an overdue interval crosses the escalation threshold so the
    // maintenance-check job never re-publishes MAINTENANCE_ESCALATED for the
    // same item (CRM-008 AC-7). Reset to false whenever the interval leaves the
    // overdue state (e.g. serviced, recalculated) so a future lapse can escalate again.
    escalated: { type: Boolean, default: false },
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

// --- Virtuals ---
// Display label prefers the free-text customTypeLabel for any type, falling
// back to the enum maintenanceType when no custom label is set (CRM-007 AC-1).
maintenanceIntervalSchema.virtual('displayLabel').get(function () {
  return this.customTypeLabel || this.maintenanceType;
});

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
