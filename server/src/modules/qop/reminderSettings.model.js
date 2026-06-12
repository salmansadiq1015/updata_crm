import mongoose from 'mongoose';

const reminderSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'default',
      unique: true,
      immutable: true,
    },
    appointmentReminderHours: {
      type: [Number],
      default: [48, 24, 2],
      validate: {
        validator: (values) => Array.isArray(values)
          && values.length > 0
          && values.every((value) => Number.isInteger(value) && value >= 1 && value <= 720),
        message: 'Appointment reminder hours must be integers between 1 and 720',
      },
    },
    quotationFollowupDays: {
      type: [Number],
      default: [7, 14, 21],
      validate: {
        validator: (values) => Array.isArray(values)
          && values.length > 0
          && values.every((value) => Number.isInteger(value) && value >= 1 && value <= 365),
        message: 'Quotation follow-up days must be integers between 1 and 365',
      },
    },
    quotationExpiryWarnDays: {
      type: Number,
      min: 1,
      max: 90,
      default: 3,
    },
    defaultAppointmentChannel: {
      type: String,
      enum: ['email', 'both'],
      default: 'email',
    },
    defaultLanguage: {
      type: String,
      enum: ['de', 'fr', 'it', 'en'],
      default: 'de',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

reminderSettingsSchema.index({ key: 1 }, { unique: true });

const ReminderSettings = mongoose.model('QopReminderSettings', reminderSettingsSchema);
export default ReminderSettings;
