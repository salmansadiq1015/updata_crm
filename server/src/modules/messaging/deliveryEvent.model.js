import mongoose from 'mongoose';
import { PROVIDERS } from './messaging.constants.js';

const deliveryEventSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  provider: { type: String, enum: PROVIDERS, required: true, index: true },
  providerMessageId: { type: String, required: true, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageRecipient', default: null, index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageCampaign', default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  channel: { type: String, enum: ['email', 'sms', 'whatsapp', null], default: null },
  direction: { type: String, enum: ['inbound', 'outbound', 'internal'], default: 'outbound' },
  messagePreview: { type: String, maxlength: 500, default: '' },
  eventType: { type: String, required: true, maxlength: 100 },
  normalizedStatus: { type: String, default: null },
  occurredAt: { type: Date, required: true },
  // The unique event key is the durable idempotency claim. An unprocessed
  // claim may be resumed when a downstream database operation failed.
  processedAt: { type: Date, default: null },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });

deliveryEventSchema.index({ leadId: 1, createdBy: 1, occurredAt: -1 });

export default mongoose.model('MessageDeliveryEvent', deliveryEventSchema);
