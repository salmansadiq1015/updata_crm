import mongoose from 'mongoose';

/**
 * Global AI voice-calling settings (one document, key 'global'). `voicePaused` is the kill switch:
 * while set, no campaign dials (cloud SIP or paired phone) and queued paired-phone calls are cancelled
 * before they reach the phone. Env AI_VOICE_CALLING_ENABLED=false forces it on.
 */
const aiCallingSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'global' },
  voicePaused: { type: Boolean, default: false },
  pausedReason: { type: String, trim: true, maxlength: 300, default: '' },
  pausedAt: { type: Date, default: null },
  // Organisation-wide switch for AUTOMATIC follow-up calls (followUpCalling.service.js).
  // Off by default: no agent places an automatic follow-up call until an admin enables it.
  followUpAutomation: {
    enabled: { type: Boolean, default: false },
    pausedReason: { type: String, trim: true, maxlength: 300, default: '' },
    changedAt: { type: Date, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Default escalation recipients for agents that name none.
    escalationUserIds: { type: [mongoose.Schema.Types.ObjectId], default: undefined },
  },
  voiceProviders: { type: mongoose.Schema.Types.Mixed, default: undefined },
  providerCredentials: { type: mongoose.Schema.Types.Mixed, select: false, default: undefined },
  providerHealth: { type: mongoose.Schema.Types.Mixed, default: undefined },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

export default mongoose.models.AiCallingSettings || mongoose.model('AiCallingSettings', aiCallingSettingsSchema);
