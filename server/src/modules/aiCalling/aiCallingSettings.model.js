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
  voiceProviders: { type: mongoose.Schema.Types.Mixed, default: undefined },
  providerCredentials: { type: mongoose.Schema.Types.Mixed, select: false, default: undefined },
  providerHealth: { type: mongoose.Schema.Types.Mixed, default: undefined },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

export default mongoose.models.AiCallingSettings || mongoose.model('AiCallingSettings', aiCallingSettingsSchema);
