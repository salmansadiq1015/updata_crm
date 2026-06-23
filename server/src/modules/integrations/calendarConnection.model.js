import mongoose from 'mongoose';

export const CALENDAR_PROVIDERS = ['google', 'outlook'];
export const CONNECTION_STATUSES = ['connected', 'disconnected', 'expired', 'error'];

const calendarConnectionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: CALENDAR_PROVIDERS, required: true },
    status: { type: String, enum: CONNECTION_STATUSES, default: 'connected' },
    accessToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    tokenExpiresAt: { type: Date, default: null },
    calendarId: { type: String, default: null },
    externalCalendarId: { type: String, default: null },
    scope: { type: String, default: null },
    connectedAt: { type: Date, default: null },
    lastSyncAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastErrorMessage: { type: String, default: null },
  },
  { timestamps: true },
);

calendarConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });
calendarConnectionSchema.index({ status: 1 });

const CalendarConnection = mongoose.model('CalendarConnection', calendarConnectionSchema);
export default CalendarConnection;
