import mongoose from 'mongoose';

const fieldConfigSchema = new mongoose.Schema({
  visible: { type: Boolean, default: true },
  required: { type: Boolean, default: false },
}, { _id: false });

const requestTypeSchema = new mongoose.Schema({
  key: { type: String, required: true },
  labelDe: { type: String, required: true },
  labelFr: { type: String, default: null },
  labelIt: { type: String, default: null },
  labelEn: { type: String, default: null },
  isActive: { type: Boolean, default: true },
}, { _id: false });

const widgetConfigSchema = new mongoose.Schema(
  {
    widgetId: { type: String, required: true, unique: true, default: 'updata-main-site' },
    branding: {
      logoUrl: { type: String, default: null },
      primaryColor: { type: String, default: '#0056b3' },
      companyName: { type: String, default: 'Updata' },
    },
    fields: {
      contactName: { type: fieldConfigSchema, default: () => ({ visible: true, required: true }) },
      contactEmail: { type: fieldConfigSchema, default: () => ({ visible: true, required: true }) },
      contactPhone: { type: fieldConfigSchema, default: () => ({ visible: true, required: true }) },
      contactAddress: { type: fieldConfigSchema, default: () => ({ visible: true, required: false }) },
      preferredWindow: { type: fieldConfigSchema, default: () => ({ visible: true, required: false }) },
      photoUpload: { type: fieldConfigSchema, default: () => ({ visible: true, required: false }) },
    },
    requestTypes: [requestTypeSchema],
    captcha: {
      provider: { type: String, default: 'recaptcha_v3' },
      siteKey: { type: String, default: null },
      secretKey: { type: String, default: null },
      threshold: { type: Number, default: 0.3 },
    },
    confirmationMessageDe: { type: String, default: 'Ihre Anfrage wurde erfolgreich übermittelt. Wir melden uns innerhalb von 24 Stunden.' },
    confirmationMessageFr: { type: String, default: null },
    confirmationMessageIt: { type: String, default: null },
    languages: [{ type: String }],
    maxFilesPerSubmission: { type: Number, default: 3 },
    maxFileSizeMb: { type: Number, default: 10 },
    rateLimitPerHour: { type: Number, default: 10 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const WidgetConfig = mongoose.model('WidgetConfig', widgetConfigSchema);
export default WidgetConfig;
