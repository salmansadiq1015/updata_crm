import mongoose from 'mongoose';

export const ACTION_TYPES = ['NAVIGATE', 'SEARCH', 'UPDATE', 'CREATE'];

const voiceCommandSchema = new mongoose.Schema(
  {
    intent: { type: String, required: true, trim: true },
    language: { type: String, required: true, maxlength: 12 },
    phrases: [{ type: String, required: true }],
    actionType: { type: String, enum: ACTION_TYPES, required: true },
    actionTarget: { type: String, required: true },
    actionParameters: { type: mongoose.Schema.Types.Mixed, default: {} },
    requiresConfirmation: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

voiceCommandSchema.index({ intent: 1, language: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
voiceCommandSchema.index({ language: 1, isActive: 1 });
voiceCommandSchema.index({ isDeleted: 1 });

voiceCommandSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const VoiceCommand = mongoose.model('VoiceCommand', voiceCommandSchema);
export default VoiceCommand;
