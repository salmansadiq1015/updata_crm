import mongoose from 'mongoose';

export const SESSION_TYPES = ['ORDER_CREATION', 'REPORT_DICTATION', 'ADDRESS_CAPTURE', 'COMMAND', 'GENERAL'];
export const SESSION_STATUSES = ['ACTIVE', 'PROCESSING', 'AWAITING_CONFIRMATION', 'COMPLETED', 'CANCELLED', 'FAILED'];
export const DEVICE_TYPES = ['MOBILE', 'WEB'];
export const STT_PROVIDERS = ['whisper', 'google', 'azure'];

const resultSchema = new mongoose.Schema({
  action: { type: String, default: null },
  recordId: { type: mongoose.Schema.Types.ObjectId, default: null },
  recordType: { type: String, default: null },
  message: { type: String, default: null },
}, { _id: false });

const voiceSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sessionType: { type: String, enum: SESSION_TYPES, required: true },
    language: { type: String, default: 'de-CH', maxlength: 10 },
    status: { type: String, enum: SESSION_STATUSES, default: 'ACTIVE' },
    audioFileUrl: { type: String, default: null },
    audioDurationMs: { type: Number, default: null },
    rawTranscript: { type: String, default: null },
    correctedTranscript: { type: String, default: null },
    transcriptConfidence: { type: Number, min: 0, max: 1, default: null },
    intentName: { type: String, default: null },
    intentConfidence: { type: Number, min: 0, max: 1, default: null },
    contextModule: { type: String, default: null },
    contextRecordType: { type: String, default: null },
    contextRecordId: { type: mongoose.Schema.Types.ObjectId, default: null },
    deviceType: { type: String, enum: DEVICE_TYPES, default: 'WEB' },
    sttProvider: { type: String, enum: STT_PROVIDERS, default: 'whisper' },
    processingTimeMs: { type: Number, default: null },
    result: { type: resultSchema, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

voiceSessionSchema.index({ userId: 1, createdAt: -1 });
voiceSessionSchema.index({ status: 1 });
voiceSessionSchema.index({ sessionType: 1, createdAt: -1 });
voiceSessionSchema.index({ isDeleted: 1 });

voiceSessionSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const VoiceSession = mongoose.model('VoiceSession', voiceSessionSchema);
export default VoiceSession;
