import mongoose from 'mongoose';

const searchPresetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  filters: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

searchPresetSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('SearchPreset', searchPresetSchema);
