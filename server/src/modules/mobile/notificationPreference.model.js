import mongoose from 'mongoose';

const notificationPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    newAssignment: { type: Boolean, default: true },
    orderChanged: { type: Boolean, default: true },
    chatMessage: { type: Boolean, default: true },
    dailyReminder: { type: Boolean, default: true },
    escalation: { type: Boolean, default: true },
    quietHoursEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: String, maxlength: 5, default: '20:00' },
    quietHoursEnd: { type: String, maxlength: 5, default: '07:00' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
notificationPreferenceSchema.index({ userId: 1 }, { unique: true });

const NotificationPreference = mongoose.model('NotificationPreference', notificationPreferenceSchema);
export default NotificationPreference;
