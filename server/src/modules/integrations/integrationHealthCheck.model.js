import mongoose from 'mongoose';

export const HEALTH_STATUSES = ['healthy', 'degraded', 'down'];

const integrationHealthCheckSchema = new mongoose.Schema(
  {
    integrationKey: { type: String, required: true },
    status: { type: String, enum: HEALTH_STATUSES, required: true },
    responseTimeMs: { type: Number, default: null },
    errorMessage: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    checkedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

integrationHealthCheckSchema.index({ integrationKey: 1, checkedAt: -1 });
// TTL: auto-delete after 30 days
integrationHealthCheckSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const IntegrationHealthCheck = mongoose.model('IntegrationHealthCheck', integrationHealthCheckSchema);
export default IntegrationHealthCheck;
