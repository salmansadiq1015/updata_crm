import mongoose from 'mongoose';
import { OUTBOUND_STATUSES, MESSAGE_KINDS } from './simSms.constants.js';

/**
 * One SMS in a SIM SMS conversation (outbound or inbound). Outbound messages
 * move pending → leased → attempting → sent|failed|unknown under a per-device
 * lease, so a message is sent at most once: once a device reports `attempting`
 * it is never handed out again; an attempt whose result is lost becomes
 * `unknown` and a human decides.
 */
const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimSmsConversation', required: true, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimSmsCampaign', required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  direction: { type: String, enum: ['outbound', 'inbound'], required: true },
  kind: { type: String, enum: MESSAGE_KINDS, required: true },
  body: { type: String, maxlength: 1600, required: true },
  segments: { type: Number, default: 1 },
  encoding: { type: String, enum: ['GSM-7', 'UCS-2'], default: 'GSM-7' },
  questionFieldKey: { type: String, maxlength: 80, default: null },

  // Outbound transport state.
  status: { type: String, enum: [...OUTBOUND_STATUSES, 'received'], required: true },
  deviceId: { type: String, maxlength: 80, default: null },
  leaseUntil: { type: Date, default: null },
  // Not handed to a phone before this time (backoff after a transient send failure).
  notBefore: { type: Date, default: null },
  attemptedAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  failureCode: { type: String, maxlength: 60, default: null },
  subscriptionId: { type: Number, default: null },

  // Inbound: device-side idempotency key (unique per owner).
  deviceMessageKey: { type: String, maxlength: 128, default: null },
  receivedAt: { type: Date, default: null },
  interpretation: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

messageSchema.index({ createdBy: 1, direction: 1, status: 1, createdAt: 1 });
messageSchema.index({ createdBy: 1, deviceMessageKey: 1 }, { unique: true, partialFilterExpression: { deviceMessageKey: { $type: 'string' } } });
messageSchema.index({ status: 1, leaseUntil: 1 });
messageSchema.index({ conversationId: 1, createdAt: 1 });
// Device dashboard: "campaigns this phone sent for in the last 7 days" — covered by this index.
messageSchema.index({ createdBy: 1, direction: 1, deviceId: 1, updatedAt: 1, campaignId: 1 }, { name: 'sim_sms_device_campaigns' });

export default mongoose.model('SimSmsMessage', messageSchema);
