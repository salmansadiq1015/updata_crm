import mongoose from 'mongoose';
import { CAMPAIGN_STATUSES, CHANNELS, MESSAGE_PURPOSES } from './messaging.constants.js';

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  channel: { type: String, enum: CHANNELS, required: true, index: true },
  purpose: { type: String, enum: MESSAGE_PURPOSES, default: 'promotional' },
  status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageTemplate', default: null },
  content: {
    subject: { type: String, maxlength: 500, default: '' },
    bodyHtml: { type: String, maxlength: 200000, default: '' },
    bodyText: { type: String, maxlength: 10000, default: '' },
    fallbackValues: { type: Map, of: String, default: {} },
    whatsappTemplateName: { type: String, maxlength: 512, default: null },
    whatsappLanguage: { type: String, maxlength: 20, default: null },
    whatsappComponents: { type: [mongoose.Schema.Types.Mixed], default: [] },
    whatsappTwilioContentSid: { type: String, maxlength: 64, default: null },
  },
  routing: {
    smsProvider: { type: String, enum: ['auto', 'textbee', 'twilio'], default: 'auto' },
    allowFallback: { type: Boolean, default: false },
  },
  selection: {
    mode: { type: String, enum: ['explicit', 'filters'], required: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: null },
    leadIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    selectedAt: { type: Date, required: true },
  },
  summary: {
    total: { type: Number, default: 0 },
    eligible: { type: Number, default: 0 },
    ineligible: { type: Number, default: 0 },
    draft: { type: Number, default: 0 },
    queued: { type: Number, default: 0 },
    submitting: { type: Number, default: 0 },
    accepted: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    undelivered: { type: Number, default: 0 },
    unknown: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    suppressed: { type: Number, default: 0 },
    missingContact: { type: Number, default: 0 },
    invalidContact: { type: Number, default: 0 },
    duplicate: { type: Number, default: 0 },
    optedOut: { type: Number, default: 0 },
  },
  scheduledAt: { type: Date, default: null, index: true },
  timezone: { type: String, default: 'UTC', maxlength: 80 },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  isTest: { type: Boolean, default: false, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

campaignSchema.index({ createdBy: 1, createdAt: -1 });
campaignSchema.index({ createdBy: 1, channel: 1, createdAt: -1 });
campaignSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
campaignSchema.index({ status: 1, scheduledAt: 1 });

export default mongoose.model('MessageCampaign', campaignSchema);
