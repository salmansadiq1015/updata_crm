import mongoose from 'mongoose';
import { agentAvatarPresetIds } from './agentAvatarPresets.js';
import { agentConfigSchema, questionSchema, scheduleSchema, statusRuleSchema } from './callCampaign.model.js';

const draftQuestionSchema = questionSchema.clone();
draftQuestionSchema.path('label').required(false);
draftQuestionSchema.path('text').required(false);

// Reusable configuration only. Each execution still belongs to CallCampaign.
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  title: { type: String, trim: true, maxlength: 160, default: '' },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  availability: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },
  avatarPresetId: { type: String, enum: [...agentAvatarPresetIds, null], default: null },
  avatarFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileMetadata', default: null },
  agentConfig: { type: agentConfigSchema, default: () => ({}) },
  questionnaire: { questions: { type: [draftQuestionSchema], default: [] } },
  statusRules: { type: [statusRuleSchema], default: [] },
  schedule: { type: scheduleSchema, default: () => ({}) },
  transport: { type: String, enum: ['cloud_sip', 'paired_phone'], default: 'cloud_sip' },
  pairedDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PairedDevice', default: null },
  assignedLeadIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  // Approved knowledge the agent speaks from (knowledge.service.js) and its human transfer setup (humanTransfer.service.js).
  knowledge: {
    mode: { type: String, enum: ['latest', 'pinned', 'none'], default: 'latest' },
    versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeVersion', default: null },
  },
  transfer: {
    enabled: { type: Boolean, default: false },
    targetUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    timeoutSeconds: { type: Number, default: 30 },
    allowPhoneTransfer: { type: Boolean, default: true },
  },
  version: { type: Number, default: 1 },
  launchLeaseUntil: { type: Date, default: null },
  launchLeaseToken: { type: String, default: null, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });
schema.index({ createdBy: 1, availability: 1, updatedAt: -1 });
export default mongoose.model('CallingAgent', schema);
