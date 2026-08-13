import mongoose from 'mongoose';

/**
 * Company-wide working-time rules. Singleton, following the
 * MaintenanceSettings pattern: one document keyed 'default'.
 *
 * The break is what the client asked for — office hours booked from/to should
 * deduct the lunch break automatically, while staying adjustable per entry.
 */
const workTimeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', immutable: true },
    // Minutes deducted once the worked span reaches breakThresholdHours.
    breakDurationMin: { type: Number, min: 0, max: 240, default: 30 },
    breakThresholdHours: { type: Number, min: 0, max: 24, default: 6 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

workTimeSettingsSchema.index({ key: 1 }, { unique: true });

const WorkTimeSettings = mongoose.model('WorkTimeSettings', workTimeSettingsSchema);
export default WorkTimeSettings;
