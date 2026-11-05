import mongoose from 'mongoose';
const { Schema } = mongoose;
const oid = (ref, required = false) => ({ type: Schema.Types.ObjectId, ref, required });
const accountSchema = new Schema({
  ownerId: oid('User', true), provider: { type: String, enum: ['google', 'microsoft', 'imap'], required: true },
  address: { type: String, required: true, lowercase: true }, name: String,
  status: { type: String, enum: ['connected', 'disconnected', 'error'], default: 'connected' },
  credentials: { type: String, select: false }, signature: { type: String, default: '', maxlength: 10000 },
  autoIntelligence: { type: Boolean, default: false },
  followUp: { enabled: { type: Boolean, default: false }, enabledAt: Date, agentId: oid('CallingAgent'), delayHours: { type: Number, default: 48, min: 1, max: 720 }, subject: { type: String, maxlength: 998 }, template: { type: String, maxlength: 10000 } },
  agentGrants: [{ agentId: oid('CallingAgent', true), read: { type: Boolean, default: true }, draft: { type: Boolean, default: true }, send: { type: Boolean, default: false }, requireApproval: { type: Boolean, default: true }, instructions: { type: String, maxlength: 4000 }, template: { type: String, maxlength: 10000 } }],
  subscriptionId: String, webhookSecret: { type: String, select: false }, watchExpiresAt: Date,
  cursor: { type: Schema.Types.Mixed, default: {} }, lastSyncAt: Date, nextSyncAt: { type: Date, default: Date.now },
  syncLeaseToken: { type: String, select: false },
  syncLease: { type: Date, default: null }, credentialLease: { type: Date, default: null }, failures: { type: Number, default: 0 }, lastError: String,
}, { timestamps: true });
accountSchema.index({ ownerId: 1, address: 1 }, { unique: true });
accountSchema.index({ status: 1, nextSyncAt: 1 });
const messageSchema = new Schema({
  ownerId: oid('User', true), accountId: oid('EmailAccount', true), externalId: { type: String, required: true },
  threadKey: { type: String, required: true }, messageId: String, inReplyTo: String, references: [String],
  from: String, to: [String], cc: [String], bcc: { type: [String], default: [], select: false }, subject: { type: String, default: '' },
  text: { type: String, default: '' }, html: { type: String, default: '' }, snippet: String, date: { type: Date, default: Date.now },
  folder: { type: String, default: 'inbox' }, labels: [String], unread: { type: Boolean, default: false }, starred: { type: Boolean, default: false }, important: { type: Boolean, default: false },
  attachments: [oid('EmailAttachment')], leadId: oid('Lead'), contactId: oid('Customer'),
  state: { type: String, enum: ['received', 'draft', 'approval', 'queued', 'sending', 'sent', 'failed', 'unknown'], default: 'received' },
  scheduledAt: Date, agentId: oid('CallingAgent'), approvedBy: oid('User'), approvedAt: Date,
  automationSourceId: oid('EmailMessage'),
  idempotencyKey: String, sendStartedAt: Date, sentAt: Date, error: String, intelligence: Schema.Types.Mixed,
}, { timestamps: true, optimisticConcurrency: true });
messageSchema.index({ accountId: 1, externalId: 1 }, { unique: true });
messageSchema.index({ ownerId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
messageSchema.index({ ownerId: 1, folder: 1, date: -1, _id: -1 });
messageSchema.index({ accountId: 1, threadKey: 1, date: 1 });
messageSchema.index({ state: 1, scheduledAt: 1 });
const attachmentSchema = new Schema({ ownerId: oid('User', true), accountId: oid('EmailAccount', true), messageId: oid('EmailMessage'), name: String, mime: String, size: Number, sourceKey: String, content: { type: Buffer, select: false } }, { timestamps: true });
attachmentSchema.index({ ownerId: 1, createdAt: 1 });
attachmentSchema.index({ messageId: 1, sourceKey: 1 }, { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } });
const oauthSchema = new Schema({ digest: { type: String, unique: true }, ownerId: oid('User', true), provider: String, verifier: { type: String, select: false }, expiresAt: Date }, { timestamps: true });
oauthSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const EmailAccount = mongoose.model('EmailAccount', accountSchema);
export const EmailMessage = mongoose.model('EmailMessage', messageSchema);
export const EmailAttachment = mongoose.model('EmailAttachment', attachmentSchema);
export const EmailOAuth = mongoose.model('EmailOAuth', oauthSchema);
