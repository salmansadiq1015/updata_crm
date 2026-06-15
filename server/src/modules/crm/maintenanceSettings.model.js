import mongoose from 'mongoose';

const maintenanceSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'default',
      immutable: true,
    },
    escalationDays: {
      type: Number,
      min: 1,
      max: 365,
      default: 30,
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

maintenanceSettingsSchema.index({ key: 1 }, { unique: true });

const MaintenanceSettings = mongoose.model('MaintenanceSettings', maintenanceSettingsSchema);
export default MaintenanceSettings;
