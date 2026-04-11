import mongoose from 'mongoose';

export const INTEGRATION_KEYS = [
  'igh_catalog', 'banking_camt', 'whatsapp', 'smtp_email',
  'ocr_service', 'cloud_storage', 'calendar_google', 'calendar_outlook', 'website_widget',
];
export const INTEGRATION_STATUSES = ['healthy', 'degraded', 'down', 'disabled', 'unknown'];

const integrationConfigSchema = new mongoose.Schema(
  {
    integrationKey: { type: String, enum: INTEGRATION_KEYS, required: true, unique: true },
    displayName: { type: String, required: true, maxlength: 100 },
    provider: { type: String, maxlength: 50, default: null },
    isEnabled: { type: Boolean, default: false },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    credentialsRef: { type: String, default: null },
    syncSchedule: { type: String, default: null },
    status: { type: String, enum: INTEGRATION_STATUSES, default: 'unknown' },
    lastSyncAt: { type: Date, default: null },
    lastHealthCheckAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    lastErrorMessage: { type: String, default: null },
    circuitBreakerState: { type: String, enum: ['CLOSED', 'OPEN', 'HALF_OPEN'], default: 'CLOSED' },
    circuitBreakerOpenedAt: { type: Date, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

integrationConfigSchema.index({ isEnabled: 1 });
integrationConfigSchema.index({ status: 1 });

const IntegrationConfig = mongoose.model('IntegrationConfig', integrationConfigSchema);
export default IntegrationConfig;
