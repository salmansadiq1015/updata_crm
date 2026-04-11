import mongoose from 'mongoose';

export const ENTITY_TYPES = [
  'CUSTOMER_NAME', 'ADDRESS', 'EQUIPMENT_MODEL', 'PART_NUMBER',
  'DATE', 'TIME', 'URGENCY', 'QUANTITY', 'DESCRIPTION', 'STATUS',
];

const voiceSessionEntitySchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'VoiceSession', required: true },
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    value: { type: String, required: true },
    normalizedValue: { type: String, default: null },
    confidence: { type: Number, min: 0, max: 1, default: null },
    resolvedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    startOffset: { type: Number, default: null },
    endOffset: { type: Number, default: null },
    correctedValue: { type: String, default: null },
  },
  { timestamps: true },
);

voiceSessionEntitySchema.index({ sessionId: 1 });

const VoiceSessionEntity = mongoose.model('VoiceSessionEntity', voiceSessionEntitySchema);
export default VoiceSessionEntity;
