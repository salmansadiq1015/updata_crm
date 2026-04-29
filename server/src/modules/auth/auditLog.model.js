import mongoose from 'mongoose';
import config from '../../config/index.js';

/**
 * Auth audit log schema.
 *
 * IMMUTABLE: No update or delete operations allowed.
 * The repository only exposes create() and find*() methods.
 *
 * Uses a TTL index for automatic retention cleanup.
 */
const auditLogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    eventType: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    email: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    result: {
      type: String,
      required: true,
      enum: ['success', 'failure'],
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    module: {
      type: String,
      required: true,
      default: 'auth',
    },
  },
  {
    timestamps: false,
  },
);

// --- Indexes ---
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ eventType: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ result: 1, timestamp: -1 });

// TTL index for automatic retention cleanup
const retentionSeconds = (config.audit?.retentionDays || 730) * 86400;
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: retentionSeconds });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
