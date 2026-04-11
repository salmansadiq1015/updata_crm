import mongoose from 'mongoose';

const preferenceEntrySchema = new mongoose.Schema({
  notificationType: { type: String, required: true },
  channel: { type: String, required: true },
  enabled: { type: Boolean, default: true },
}, { _id: false });

const quietHoursSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  startTime: { type: String, default: '20:00', maxlength: 5 },
  endTime: { type: String, default: '07:00', maxlength: 5 },
  timezone: { type: String, default: 'Europe/Zurich' },
  bypassCritical: { type: Boolean, default: true },
}, { _id: false });

const userNotificationPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    preferences: [preferenceEntrySchema],
    quietHours: { type: quietHoursSchema, default: () => ({}) },
  },
  { timestamps: true },
);

const UserNotificationPreference = mongoose.model('UserNotificationPreference', userNotificationPreferenceSchema);
export default UserNotificationPreference;
