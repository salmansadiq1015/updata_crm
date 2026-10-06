import mongoose from 'mongoose';

/**
 * ExtensionConnection — the authoritative record that a CRM user has linked the
 * Lead Finder Chrome extension to their account (§ Chrome Extension integration).
 *
 * One document per (user, browser instance). It exists so the CRM can honestly
 * answer "is this user's extension connected?" (status card), support
 * disconnect/reconnect, and audit the link — WITHOUT inventing a second user or
 * lead system. The short-lived token session itself lives in Redis via the
 * existing sessionService (deviceType 'extension'); this doc only points at it
 * through `sessionId`.
 *
 * Single-tenant: scoped by `createdBy` (there is no organizationId anywhere in
 * this CRM). The extension never stores a password — it is minted a normal
 * rotating access/refresh pair after redeeming a one-time pairing grant.
 */

export const EXTENSION_CONNECTION_STATUS = Object.freeze({
  CONNECTED: 'connected',
  REVOKED: 'revoked',
  ERROR: 'error',
});

const extensionConnectionSchema = new mongoose.Schema(
  {
    // The CRM user who owns this link. Identity is always derived server-side
    // from the authenticated request, never from the client body.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // A random id the extension generates once and persists locally, so the same
    // browser install reuses one connection record across reconnects.
    instanceId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    // The Redis session id backing the extension's token pair. Revoking this
    // session (disconnect / logout-all) immediately invalidates the extension.
    sessionId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 128,
    },
    status: {
      type: String,
      enum: Object.values(EXTENSION_CONNECTION_STATUS),
      default: EXTENSION_CONNECTION_STATUS.CONNECTED,
      index: true,
    },
    extensionVersion: { type: String, default: null, trim: true, maxlength: 32 },
    userAgent: { type: String, default: null, maxlength: 512 },
    browser: { type: String, default: null, trim: true, maxlength: 64 },
    os: { type: String, default: null, trim: true, maxlength: 64 },
    ipAddress: { type: String, default: null, trim: true, maxlength: 64 },
    connectedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One connection per (user, browser install). Reconnecting the same install
// updates the existing row (new session) instead of piling up dead records.
extensionConnectionSchema.index({ createdBy: 1, instanceId: 1 }, { unique: true });
// Status card reads the user's most recently active connection first.
extensionConnectionSchema.index({ createdBy: 1, status: 1, lastSeenAt: -1 });

const ExtensionConnection = mongoose.model('ExtensionConnection', extensionConnectionSchema);

export default ExtensionConnection;
