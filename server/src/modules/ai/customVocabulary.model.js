import mongoose from 'mongoose';

export const VOCAB_CATEGORIES = ['EQUIPMENT', 'PART', 'BRAND', 'LOCATION', 'GENERAL'];
export const VOCAB_SOURCES = ['MANUAL', 'AUTO_SUGGESTED'];
export const VOCAB_STATUSES = ['ACTIVE', 'PENDING_REVIEW', 'DISABLED'];

const customVocabularySchema = new mongoose.Schema(
  {
    term: { type: String, required: true, trim: true, maxlength: 255 },
    phonetic: { type: String, default: null, maxlength: 255 },
    category: { type: String, enum: VOCAB_CATEGORIES, required: true },
    language: { type: String, required: true, maxlength: 5 },
    aliases: [{ type: String }],
    source: { type: String, enum: VOCAB_SOURCES, default: 'MANUAL' },
    status: { type: String, enum: VOCAB_STATUSES, default: 'ACTIVE' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

customVocabularySchema.index({ term: 1, language: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
customVocabularySchema.index({ category: 1, language: 1 });
customVocabularySchema.index({ status: 1 });
customVocabularySchema.index({ isDeleted: 1 });

customVocabularySchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const CustomVocabulary = mongoose.model('CustomVocabulary', customVocabularySchema);
export default CustomVocabulary;
