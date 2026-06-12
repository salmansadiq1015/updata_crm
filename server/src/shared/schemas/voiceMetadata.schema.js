import mongoose from 'mongoose';

/** Reusable voice capture metadata linked to business records. */
export const voiceMetadataSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceSession', default: null },
    audioFileUrl: { type: String, default: null },
    transcript: { type: String, maxlength: 10000, default: null },
    capturedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

export default voiceMetadataSchema;
