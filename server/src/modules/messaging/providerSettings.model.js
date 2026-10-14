import mongoose from 'mongoose';

const frequencyRule = {
  minIntervalHours: { type: Number, min: 0, max: 720, default: 0 },
  dailyMax: { type: Number, min: 0, max: 100, default: 0 },
  weeklyMax: { type: Number, min: 0, max: 1000, default: 0 },
};

const regionalQuietHourSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 80, required: true },
  enabled: { type: Boolean, default: true },
  countries: { type: [String], default: [] },
  channel: { type: String, enum: ['email', 'sms', 'whatsapp'], required: true },
  purpose: { type: String, enum: ['transactional', 'promotional', 'support'], default: 'promotional' },
  start: { type: String, default: '20:00' },
  end: { type: String, default: '08:00' },
  timezone: { type: String, default: 'UTC', maxlength: 80 },
}, { _id: true });

const providerSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true, immutable: true },
  providers: {
    metaWhatsappEnabled: { type: Boolean, default: false },
    textbeeEnabled: { type: Boolean, default: false },
    twilioEnabled: { type: Boolean, default: false },
    twilioWhatsappEnabled: { type: Boolean, default: false },
    emailEnabled: { type: Boolean, default: true },
  },
  smsFallback: {
    enabled: { type: Boolean, default: false },
    allowedCountries: { type: [String], default: [] },
    allowedPurposes: { type: [String], default: ['transactional', 'support'] },
    dailySpendLimit: { type: Number, min: 0, default: 0 },
    monthlySpendLimit: { type: Number, min: 0, default: 0 },
  },
  whatsappFallback: {
    enabled: { type: Boolean, default: false },
    allowedCountries: { type: [String], default: [] },
    allowedPurposes: { type: [String], default: ['transactional', 'support'] },
    dailySpendLimit: { type: Number, min: 0, default: 0 },
    monthlySpendLimit: { type: Number, min: 0, default: 0 },
  },
  countryRouting: {
    textbeeAllowedCountries: { type: [String], default: [] },
    twilioAllowedCountries: { type: [String], default: [] },
    whatsappAllowedCountries: { type: [String], default: [] },
    twilioWhatsappAllowedCountries: { type: [String], default: [] },
  },
  quotas: {
    daily: { type: Number, min: 0, max: 50000, default: 50 },
    monthly: { type: Number, min: 0, max: 50000, default: 300 },
    perCampaign: { type: Number, min: 1, max: 50000, default: 1000 },
  },
  // Internal quota ledger. Reservation ids make one atomic settings update the
  // daily and monthly capacity decision. These fields are never returned by
  // settings APIs.
  quotaLedger: {
    dailyPeriod: { type: String, default: null, select: false },
    dailyBaseline: { type: Number, min: 0, default: 0, select: false },
    dailyReservations: { type: [mongoose.Schema.Types.ObjectId], default: [], select: false },
    monthlyPeriod: { type: String, default: null, select: false },
    monthlyBaseline: { type: Number, min: 0, default: 0, select: false },
    monthlyReservations: { type: [mongoose.Schema.Types.ObjectId], default: [], select: false },
  },
  quietHours: {
    enabled: { type: Boolean, default: false },
    start: { type: String, default: '20:00' },
    end: { type: String, default: '08:00' },
    timezone: { type: String, default: 'UTC' },
  },
  frequencyLimits: {
    enabled: { type: Boolean, default: false },
    purposes: { type: [String], enum: ['transactional', 'promotional', 'support'], default: ['promotional'] },
    email: frequencyRule,
    sms: frequencyRule,
    whatsapp: frequencyRule,
  },
  regionalQuietHours: { type: [regionalQuietHourSchema], default: [] },
  pricing: {
    currency: { type: String, uppercase: true, maxlength: 3, default: 'USD' },
    textbeeCarrierPerSegment: { type: Number, min: 0, default: 0 },
    twilioDefaultPerSegment: { type: Number, min: 0, default: 0 },
    twilioWhatsappDefaultPerMessage: { type: Number, min: 0, default: 0 },
    metaMarketingPerMessage: { type: Number, min: 0, default: 0 },
    metaUtilityPerMessage: { type: Number, min: 0, default: 0 },
    metaServicePerMessage: { type: Number, min: 0, default: 0 },
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default mongoose.model('MessagingProviderSettings', providerSettingsSchema);
