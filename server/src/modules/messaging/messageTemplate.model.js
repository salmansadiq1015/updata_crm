import mongoose from 'mongoose';
import { CHANNELS, MESSAGE_PURPOSES } from './messaging.constants.js';

const messageTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  channel: { type: String, enum: CHANNELS, required: true, index: true },
  purpose: { type: String, enum: MESSAGE_PURPOSES, default: 'promotional' },
  category: { type: String, trim: true, maxlength: 80, default: 'custom' },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  subject: { type: String, maxlength: 500, default: '' },
  bodyHtml: { type: String, maxlength: 200000, default: '' },
  bodyText: { type: String, maxlength: 10000, default: '' },
  requiredVariables: { type: [String], default: [] },
  fallbackValues: { type: Map, of: String, default: {} },
  whatsapp: {
    metaName: { type: String, trim: true, maxlength: 512, default: null },
    language: { type: String, trim: true, maxlength: 20, default: null },
    approvalStatus: { type: String, enum: ['approved', 'pending', 'rejected', 'paused', 'disabled', null], default: null },
    templateCategory: { type: String, trim: true, maxlength: 50, default: null },
    parameterOrder: { type: [String], default: [] },
    components: { type: [mongoose.Schema.Types.Mixed], default: [] },
    providerDefinition: { type: mongoose.Schema.Types.Mixed, default: null },
    // Optional mapping to an independently approved Twilio Content Template.
    // It does not replace or alter the Meta-approved primary template.
    twilioContentSid: { type: String, trim: true, maxlength: 64, default: null },
  },
  isShared: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

messageTemplateSchema.index({ channel: 1, isArchived: 1, createdAt: -1 });
messageTemplateSchema.index({ createdBy: 1, name: 1 });

export default mongoose.model('MessageTemplate', messageTemplateSchema);
